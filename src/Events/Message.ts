/**
 * Messages.ts
 * Handler utama untuk semua pesan masuk.
 * Menangani:
 *  - Relay pesan antara user ↔ admin (sesi aktif)
 *  - Perintah khusus: "hubungi admin", "batalkan", "selesai"
 *  - Pencocokan FAQ berbasis keyword dengan toleransi typo
 */

import { WASocket } from 'baileys'
import Config from '../../config.json' with { type: 'json' }
import { loadKnowledgeBase, keywordIndex } from '../Utils/knowledgeBase.js'
import { resetTimeout, userSessions } from '../Utils/sessionManager.js'
import { matchKeyword } from '../Utils/typoHandle.js'
import {
    initAdminQueue,
    isWorkingHours,
    getWorkingHoursInfo,
    getAvailableAdmin,
    addToQueue,
    removeFromQueue,
    getQueuePosition,
    isInQueue,
    isInAdminChat,
    getAdminChatByUser,
    getUserByAdminJid,
    startAdminChat,
    endAdminChat,
    dequeueNext,
} from '../Utils/adminQueue.js'
import * as T from '../Utils/textFunction.js'

// ─── Inisialisasi ─────────────────────────────────────────────────────────────

await loadKnowledgeBase()
await initAdminQueue()

// ─── Helper ───────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Normalisasi JID WhatsApp.
 *
 * Baileys kadang mengembalikan JID dengan device suffix, contoh:
 *   "628123456789:5@s.whatsapp.net"  (multi-device)
 *   "628123456789@s.whatsapp.net"    (standar)
 *
 * Fungsi ini menghapus bagian ":device_id" agar perbandingan selalu konsisten.
 */
function normalizeJid(jid: string): string {
    return jid.replace(/:\d+@/, '@')
}

/** Cek apakah JID ini adalah salah satu admin yang terdaftar */
function isAdminJid(jid: string): boolean {
    const norm = normalizeJid(jid)
    return (Config.admins as any[]).some((a: any) => normalizeJid(a.jid) === norm)
}

/** Cari AdminConfig berdasarkan JID */
function getAdminConfigByJid(jid: string): any | null {
    const norm = normalizeJid(jid)
    return (Config.admins as any[]).find((a: any) => normalizeJid(a.jid) === norm) ?? null
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
    if (isInQueue(sender)) {
        const pos = getQueuePosition(sender)
        T.alreadyInQueueMessage(client, sender, pos)
        return
    }

    const availableAdmin = getAvailableAdmin()
    if (availableAdmin) {
        startAdminChat(sender, availableAdmin)
        T.adminConnectedToUserMessage(client, sender, availableAdmin.config.name)
        T.notifyAdminNewChat(client, availableAdmin.config.jid, sender, availableAdmin.config.name)
        console.log(`[AdminChat] ${sender} → ${availableAdmin.config.name}`)
    } else {
        const pos = addToQueue(sender)
        T.addedToQueueMessage(client, sender, pos, pos)
        console.log(`[AdminQueue] ${sender} masuk antrian posisi ${pos}`)
    }
}

/** Tangani perintah "selesai" dari user atau admin */
async function handleEndSession(client: WASocket, sender: string): Promise<void> {
    const normalizedSender = normalizeJid(sender)

    if (isAdminJid(normalizedSender)) {
        const userJid = getUserByAdminJid(normalizedSender)
        if (!userJid) {
            client.sendMessage(sender, { text: `ℹ️ Tidak ada sesi aktif yang bisa diakhiri.` })
            return
        }
        endAdminChat(userJid)
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
    T.adminChatEndedUserMessage(client, sender)
    T.notifyAdminChatEnded(client, session.adminJid, sender)
    processNextQueue(client)
}

/** Proses antrian berikutnya setelah sesi berakhir */
function processNextQueue(client: WASocket): void {
    const next = dequeueNext()
    if (!next) return
    const { entry, admin } = next
    T.adminConnectedToUserMessage(client, entry.userJid, admin.config.name)
    T.notifyAdminFromQueue(client, admin.config.jid, entry.userJid, admin.config.name, 1)
    console.log(`[AdminQueue] Antrian diproses: ${entry.userJid} → ${admin.config.name}`)
}

// ─── Handler Utama ────────────────────────────────────────────────────────────

export default {
    name: 'messages.upsert',

    async execute(client: WASocket, connectWhatsApp: () => Promise<void>, res: any) {
        const message = res.messages[0]
        const isMsg = message?.message
        if (!isMsg || message.key.fromMe) return

        const sender: string = message.key.remoteJidAlt
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
        // Harus dicek PERTAMA sebelum apapun, agar admin tidak masuk
        // ke flow "user baru" dan tidak mendapat welcome message.
        // ═══════════════════════════════════════════════════════════════════
        if (isAdminJid(normalizedSender)) {
            const adminConfig = getAdminConfigByJid(normalizedSender)
            const userJid = getUserByAdminJid(normalizedSender)

            console.log(`[Admin] Pesan dari ${adminConfig?.name ?? normalizedSender}, sesi user: ${userJid ?? '-'}`)

            if (!adminConfig) return  // config tidak ditemukan, abaikan

            // Admin tidak sedang menangani siapapun
            if (!userJid) {
                client.sendMessage(sender, {
                    text:
                        `ℹ️ *[WICIDA BOT]*\n\n` +
                        `Halo ${adminConfig.name}, kamu tidak sedang menangani sesi apapun saat ini.\n` +
                        `Bot akan menghubungimu otomatis saat ada mahasiswa yang membutuhkan bantuan.`,
                })
                return
            }

            // Admin sedang menangani user — cek perintah
            if (normalizedText === 'selesai') {
                await handleEndSession(client, sender)
                return
            }
            if (normalizedText === 'tolak') {
                endAdminChat(userJid)
                client.sendMessage(userJid, {
                    text: `Maaf, admin tidak bisa meladeni kamu saat ini. Ketik *hubungi admin* untuk masuk antrian kembali.`,
                })
                client.sendMessage(sender, { text: `✅ Sesi ditolak. Kamu kini tersedia kembali.` })
                processNextQueue(client)
                return
            }

            // Relay pesan admin → user
            T.relayToUser(client, userJid, adminConfig.name, rawText)
            return
        }

        // ═══════════════════════════════════════════════════════════════════
        // BLOK 2: Pengirim adalah User
        // ═══════════════════════════════════════════════════════════════════

        // Inisialisasi sesi baru untuk user yang belum pernah chat
        if (!userSessions[sender]) {
            userSessions[sender] = { active: true }
            T.welcomeMessage(client, sender)
            resetTimeout(sender, client)
            return
        }

        resetTimeout(sender, client)

        // User sedang dalam sesi chat dengan admin → relay
        if (isInAdminChat(sender)) {
            const session = getAdminChatByUser(sender)!
            if (normalizedText === 'selesai') {
                await handleEndSession(client, sender)
                return
            }
            T.relayToAdmin(client, session.adminJid, sender, rawText)
            return
        }

        // ── Perintah Khusus User ────────────────────────────────────────────

        // "hubungi admin"
        const contactAdminPatterns = ['hubungi admin', 'admin baak', 'tanya admin', 'bicara admin', 'chat admin']
        const wantAdmin =
            contactAdminPatterns.some(p => normalizedText.includes(p)) ||
            matchKeyword('hubungi admin', normalizedText, 0.75) > 0
        if (wantAdmin) {
            await handleContactAdmin(client, sender)
            return
        }

        // "batalkan antrian"
        const cancelPatterns = ['batalkan', 'batal antrian', 'cancel antrian', 'keluar antrian']
        const wantCancel = cancelPatterns.some(p => normalizedText.includes(p))
        if (wantCancel) {
            if (isInQueue(sender)) {
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

        // ── Pencocokan FAQ (Knowledge Base) ─────────────────────────────────

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