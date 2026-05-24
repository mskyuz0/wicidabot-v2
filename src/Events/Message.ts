/**
 * Messages.ts
 * Handler utama untuk semua pesan masuk.
 * Menangani:
 *  - Relay pesan antara user ↔ admin (sesi aktif)
 *  - Sistem "terima dulu": bot broadcast ke semua admin, admin pertama yang
 *    ketik "terima" akan terhubung — dilindungi mutex agar tidak tabrakan
 *  - Perintah khusus: "hubungi admin", "batalkan", "selesai"
 *  - Pencocokan FAQ berbasis keyword dengan toleransi typo
 */

import { WASocket } from 'baileys'
import Config from '../../config.json' with { type: 'json' }
import { loadKnowledgeBase, keywordIndex } from '../Utils/knowledgeBase.js'
import { clearSession, resetTimeout, userSessions } from '../Utils/sessionManager.js'
import { matchKeyword } from '../Utils/typoHandle.js'
import {
    initAdminQueue,
    isWorkingHours,
    getWorkingHoursInfo,
    getAvailableAdmins,
    getAdminStatusByJid,
    addToQueue,
    removeFromQueue,
    getQueuePosition,
    isInQueue,
    isInPending,
    getPendingRequest,
    getPendingUserByAdmin,
    createPendingRequest,
    cancelPendingRequest,
    isInAdminChat,
    getAdminChatByUser,
    getUserByAdminJid,
    startAdminChat,
    endAdminChat,
    peekNextInQueue,
    dequeueUser,
    canonicalJid,
    tryLockAccept,
    unlockAccept,
    PENDING_TIMEOUT_MS,
} from '../Utils/adminQueue.js'
import * as T from '../Utils/textFunction.js'

// ─── Inisialisasi ─────────────────────────────────────────────────────────────

await loadKnowledgeBase()
await initAdminQueue()

// ─── Helper ───────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeJid(jid: string): string {
    return jid.replace(/:\d+@/, '@')
}

function isAdminJid(jid: string): boolean {
    const norm = normalizeJid(jid)
    return (Config.admins as any[]).some((a: any) => normalizeJid(a.jid) === norm)
}

function getAdminConfigByJid(jid: string): any | null {
    const norm = normalizeJid(jid)
    return (Config.admins as any[]).find((a: any) => normalizeJid(a.jid) === norm) ?? null
}

// ─── Broadcast ke Admin ───────────────────────────────────────────────────────

/**
 * Broadcast notifikasi ke semua admin yang tidak sibuk.
 * Buat pending request dengan timer timeout.
 * Jika tidak ada admin tersedia → langsung masuk antrian.
 */
async function broadcastToAdmins(client: WASocket, userJid: string): Promise<void> {
    const available = getAvailableAdmins()

    if (available.length === 0) {
        const pos = addToQueue(userJid)
        T.addedToQueueMessage(client, userJid, pos, pos)
        console.log(`[AdminQueue] ${userJid} masuk antrian posisi ${pos} (semua admin sibuk)`)
        return
    }

    const timeoutMinutes = PENDING_TIMEOUT_MS / 1000 / 60
    const notifiedJids: string[] = []

    for (const admin of available) {
        T.notifyAdminPendingRequest(client, admin.config.jid, userJid, admin.config.name, timeoutMinutes)
        notifiedJids.push(admin.config.jid)
    }

    createPendingRequest(userJid, notifiedJids, () => {
        // Timeout — tidak ada admin yang terima dalam 5 menit
        console.log(`[AdminQueue] Timeout pending untuk ${userJid}`)
        T.allAdminBusyMessage(client, userJid)
    })

    T.waitingForAdminMessage(client, userJid, timeoutMinutes)
    console.log(`[AdminQueue] Broadcast ke ${notifiedJids.length} admin untuk user ${userJid}`)
}

// ─── Logika Hubungi Admin ─────────────────────────────────────────────────────

async function handleContactAdmin(client: WASocket, sender: string): Promise<void> {
    if (!isWorkingHours()) {
        T.outsideWorkingHoursMessage(client, sender, getWorkingHoursInfo())
        return
    }
    if (isInAdminChat(sender)) {
        T.alreadyInAdminChatMessage(client, sender)
        return
    }
    if (isInPending(sender)) {
        const pending = getPendingRequest(sender)!
        const elapsed = Date.now() - pending.createdAt
        const remaining = Math.ceil((PENDING_TIMEOUT_MS - elapsed) / 1000 / 60)
        T.alreadyWaitingMessage(client, sender, remaining)
        return
    }
    if (isInQueue(sender)) {
        const pos = getQueuePosition(sender)
        T.alreadyInQueueMessage(client, sender, pos)
        return
    }

    T.searchingAdminMessage(client, sender)
    await new Promise(resolve => setTimeout(resolve, 2000))
    await broadcastToAdmins(client, sender)
}

// ─── Logika Admin Terima ──────────────────────────────────────────────────────

/**
 * Menangani ketika admin mengetik "terima".
 *
 * Dilindungi mutex (tryLockAccept) agar jika dua admin mengetik "terima"
 * hampir bersamaan, hanya satu yang berhasil — yang lain dapat notif sudah diambil.
 */
async function handleAdminAccept(client: WASocket, adminJid: string, adminConfig: any): Promise<void> {
    const userJid = getPendingUserByAdmin(adminJid)

    if (!userJid) {
        client.sendMessage(adminJid, {
            text: `ℹ️ *[WICIDA BOT]*\n\nTidak ada permintaan yang menunggumu saat ini.`,
        })
        return
    }

    // ── Mutex: cegah dua admin "terima" bersamaan untuk user yang sama ──────
    if (!tryLockAccept(userJid)) {
        // Admin lain sedang dalam proses accept untuk user ini
        client.sendMessage(adminJid, {
            text: `ℹ️ *[WICIDA BOT]*\n\nPermintaan mahasiswa ini sedang diproses oleh admin lain.`,
        })
        return
    }

    try {
        // Double-check: pastikan pending masih ada setelah lock berhasil
        // (bisa saja sudah di-cancel oleh timeout atau admin lain)
        const pending = getPendingRequest(userJid)
        if (!pending) {
            client.sendMessage(adminJid, {
                text: `ℹ️ *[WICIDA BOT]*\n\nPermintaan mahasiswa ini sudah tidak tersedia (mungkin sudah diterima admin lain atau dibatalkan).`,
            })
            return
        }

        const adminStatus = getAdminStatusByJid(adminJid)
        if (!adminStatus) return

        // Batalkan pending (clear timeout + hapus reverse lookup)
        cancelPendingRequest(userJid)

        // Mulai sesi
        startAdminChat(userJid, adminStatus)

        // Beritahu admin lain yang juga dapat notifikasi
        for (const otherJid of pending.notifiedAdminJids) {
            if (canonicalJid(otherJid) !== canonicalJid(adminJid)) {
                T.notifyAdminRequestTaken(client, otherJid, adminConfig.name)
            }
        }

        // Beritahu user
        T.adminConnectedToUserMessage(client, userJid, adminConfig.name)

        // Beritahu admin yang terima
        client.sendMessage(adminJid, {
            text:
                `✅ *[WICIDA BOT]*\n\n` +
                `Kamu berhasil terhubung dengan mahasiswa.\n` +
                `Silakan mulai percakapan. Ketik *selesai* jika sudah selesai.`,
        })

        console.log(`[AdminChat] ${userJid} → ${adminConfig.name} (terima)`)
    } finally {
        // Selalu lepas lock meskipun terjadi error
        unlockAccept(userJid)
    }
}

// ─── Logika Akhiri Sesi ───────────────────────────────────────────────────────

async function handleEndSession(client: WASocket, sender: string): Promise<void> {
    if (isAdminJid(sender)) {
        const userJid = getUserByAdminJid(sender)
        if (!userJid) {
            client.sendMessage(sender, { text: `ℹ️ Tidak ada sesi aktif yang bisa diakhiri.` })
            return
        }
        endAdminChat(userJid)
        clearSession(userJid)
        T.adminChatEndedUserMessage(client, userJid)
        T.notifyAdminChatEnded(client, sender, userJid)
        processNextQueue(client)
        return
    }

    const session = getAdminChatByUser(sender)
    if (!session) {
        client.sendMessage(sender, { text: `Kamu tidak sedang dalam sesi chat dengan admin.` })
        return
    }
    endAdminChat(sender)
    clearSession(sender)
    T.adminChatEndedUserMessage(client, sender)
    T.notifyAdminChatEnded(client, session.adminJid, sender)
    processNextQueue(client)
}

// ─── Proses Antrian Berikutnya ────────────────────────────────────────────────

function processNextQueue(client: WASocket): void {
    const next = peekNextInQueue()
    if (!next) return

    const available = getAvailableAdmins()
    if (available.length === 0) return

    dequeueUser(next.userJid)

    const timeoutMinutes = PENDING_TIMEOUT_MS / 1000 / 60
    const notifiedJids: string[] = []

    for (const admin of available) {
        T.notifyAdminPendingRequest(client, admin.config.jid, next.userJid, admin.config.name, timeoutMinutes)
        notifiedJids.push(admin.config.jid)
    }

    createPendingRequest(next.userJid, notifiedJids, () => {
        console.log(`[AdminQueue] Timeout antrian pending untuk ${next.userJid}`)
        T.allAdminBusyMessage(client, next.userJid)
    })

    T.waitingForAdminMessage(client, next.userJid, timeoutMinutes)
    console.log(`[AdminQueue] Antrian diproses: ${next.userJid}, broadcast ke ${notifiedJids.length} admin`)
}

// ─── Handler Utama ────────────────────────────────────────────────────────────

export default {
    name: 'messages.upsert',

    async execute(client: WASocket, connectWhatsApp: () => Promise<void>, res: any) {
        const message = res.messages[0]
        const isMsg = message?.message
        const isKey = message.key
        if (!isMsg || isKey.fromMe) return

        if (isKey) {
            await client.readMessages([isKey])
        }

        const sender: string = isKey.remoteJidAlt
        if (!sender) return

        const rawText = (
            isMsg.conversation ||
            isMsg.extendedTextMessage?.text ||
            ''
        ).trim()

        if (!rawText) return

        const normalizedText = normalizeText(rawText)
        const normalizedSender = normalizeJid(sender)

        // ═══════════════════════════════════════════════════════════════════
        // BLOK 1: Pengirim adalah Admin
        // Dicek PERTAMA agar admin tidak masuk flow "user baru"
        // ═══════════════════════════════════════════════════════════════════
        if (isAdminJid(normalizedSender)) {
            const adminConfig = getAdminConfigByJid(normalizedSender)
            if (!adminConfig) return

            const userJid = getUserByAdminJid(normalizedSender)
            const pendingUserJid = getPendingUserByAdmin(normalizedSender)

            console.log(`[Admin] ${adminConfig.name} | sesi: ${userJid ?? '-'} | pending: ${pendingUserJid ?? '-'} | pesan: "${normalizedText}"`)

            // ── Admin sedang dalam sesi aktif ────────────────────────────────
            if (userJid) {
                if (normalizedText === 'selesai') {
                    await handleEndSession(client, sender)
                    return
                }
                // Relay pesan ke user
                T.relayToUser(client, userJid, adminConfig.name, rawText)
                return
            }

            // ── Admin ada pending user (menunggu terima/tolak) ───────────────
            if (pendingUserJid) {
                if (normalizedText === 'terima') {
                    await handleAdminAccept(client, normalizedSender, adminConfig)
                    return
                }
                if (normalizedText === 'tolak') {
                    cancelPendingRequest(pendingUserJid)

                    client.sendMessage(sender, { text: `✅ Permintaan ditolak. Kamu kini tidak terdaftar untuk user tersebut.` })

                    // Coba broadcast ulang ke admin lain yang tersedia
                    const others = getAvailableAdmins().filter(
                        a => canonicalJid(a.config.jid) !== canonicalJid(normalizedSender)
                    )
                    if (others.length > 0) {
                        const timeoutMinutes = PENDING_TIMEOUT_MS / 1000 / 60
                        const notifiedJids: string[] = []
                        for (const admin of others) {
                            T.notifyAdminPendingRequest(client, admin.config.jid, pendingUserJid, admin.config.name, timeoutMinutes)
                            notifiedJids.push(admin.config.jid)
                        }
                        createPendingRequest(pendingUserJid, notifiedJids, () => {
                            T.allAdminBusyMessage(client, pendingUserJid)
                        })
                    } else {
                        // Tidak ada admin lain → masuk antrian
                        const pos = addToQueue(pendingUserJid)
                        T.addedToQueueMessage(client, pendingUserJid, pos, pos)
                    }
                    return
                }
                // Admin kirim pesan lain saat ada pending → ingatkan
                client.sendMessage(sender, {
                    text:
                        `💡 *[WICIDA BOT]*\n\n` +
                        `Ada mahasiswa yang menunggumu.\n` +
                        `Ketik *terima* untuk menerima atau *tolak* untuk menolak.`,
                })
                return
            }

            // ── Admin tidak ada sesi maupun pending ──────────────────────────
            client.sendMessage(sender, {
                text:
                    `ℹ️ *[WICIDA BOT]*\n\n` +
                    `Halo ${adminConfig.name}, kamu tidak sedang menangani sesi apapun saat ini.\n` +
                    `Bot akan menghubungimu otomatis saat ada mahasiswa yang membutuhkan bantuan.`,
            })
            return
        }

        // ═══════════════════════════════════════════════════════════════════
        // BLOK 2: Pengirim adalah User
        // ═══════════════════════════════════════════════════════════════════

        // Inisialisasi sesi baru
        if (!userSessions[sender]) {
            userSessions[sender] = { active: true }
            T.welcomeMessage(client, sender)
            resetTimeout(sender, client)
            return
        }

        resetTimeout(sender, client)

        // User sedang dalam sesi chat dengan admin → relay
        if (isInAdminChat(sender)) {
            if (normalizedText === 'selesai') {
                await handleEndSession(client, sender)
                return
            }
            const session = getAdminChatByUser(sender)!
            T.relayToAdmin(client, session.adminJid, sender, rawText)
            return
        }

        // ── Perintah Khusus User ─────────────────────────────────────────────

        // "hubungi admin"
        const contactAdminPatterns = ['hubungi admin', 'admin baak', 'tanya admin', 'bicara admin', 'chat admin', 'admin']
        const wantAdmin =
            contactAdminPatterns.some(p => normalizedText.includes(p)) ||
            matchKeyword('hubungi admin', normalizedText, 0.75) > 0
        if (wantAdmin) {
            await handleContactAdmin(client, sender)
            return
        }

        // "batalkan" — berlaku untuk pending maupun antrian
        const cancelPatterns = ['batalkan', 'batal antrian', 'cancel antrian', 'keluar antrian']
        const wantCancel = cancelPatterns.some(p => normalizedText.includes(p))
        if (wantCancel) {
            if (isInPending(sender)) {
                cancelPendingRequest(sender)
                T.pendingCancelledMessage(client, sender)
            } else if (isInQueue(sender)) {
                removeFromQueue(sender)
                T.queueCancelledMessage(client, sender)
            } else {
                T.notInQueueMessage(client, sender)
            }
            return
        }

        // "selesai" tanpa sesi admin
        if (normalizedText === 'selesai') {
            await handleEndSession(client, sender)
            return
        }

        // ── Pencocokan FAQ (Knowledge Base) ──────────────────────────────────

        let bestEntry: any = null
        let bestScore = 0

        for (const [keyword, kb] of keywordIndex.entries()) {
            const score = matchKeyword(keyword, normalizedText, Config.typoThreshold)
            if (score > bestScore) {
                bestScore = score
                bestEntry = kb
            }
        }

        if (!bestEntry || bestScore < Config.typoThreshold) {
            T.notFoundMessage(client, sender)
            return
        }

        try {
            await bestEntry.execute(client, sender)
        } catch (err) {
            console.error(`[Messages] Error execute knowledge base:`, err)
            T.notFoundMessage(client, sender)
        }

        T.moreQuestion(client, sender)
    },
}