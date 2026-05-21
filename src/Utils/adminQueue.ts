/**
 * adminQueue.ts
 * Mengelola antrian pengguna yang ingin dihubungkan ke admin,
 * status ketersediaan admin, dan sesi chat admin-user.
 */

import * as Config from '../../config.json'

// ─── Tipe Data ───────────────────────────────────────────────────────────────

export interface AdminConfig {
    id: string
    name: string
    jid: string
}

export interface AdminStatus {
    config: AdminConfig
    isBusy: boolean
    currentUser: string | null   // JID user yang sedang dilayani
    busySince: number | null
}

export interface QueueEntry {
    userJid: string
    requestedAt: number
    notified: boolean            // sudah diberitahu posisi antrian?
}

export interface ActiveAdminChat {
    userJid: string
    adminJid: string
    adminId: string
    startedAt: number
}

// ─── State ───────────────────────────────────────────────────────────────────

// Status setiap admin
const adminStatusMap = new Map<string, AdminStatus>()

// Antrian user yang menunggu
const queue: QueueEntry[] = []

// Sesi chat yang sedang aktif (user ↔ admin)
const activeSessions = new Map<string, ActiveAdminChat>()  // key = userJid
const adminToUser = new Map<string, string>()              // adminJid → userJid

// ─── Inisialisasi ─────────────────────────────────────────────────────────────

export function initAdminQueue(): void {
    for (const admin of Config.admins as AdminConfig[]) {
        adminStatusMap.set(admin.id, {
            config: admin,
            isBusy: false,
            currentUser: null,
            busySince: null,
        })
    }
    console.log(`[AdminQueue] Inisialisasi dengan ${Config.admins.length} admin.`)
}

// ─── Jam Kerja ────────────────────────────────────────────────────────────────

export function isWorkingHours(): boolean {
    const now = new Date()
    const day = now.getDay()       // 0 = Minggu, 1–5 = Senin–Jumat, 6 = Sabtu
    const hour = now.getHours()
    const minute = now.getMinutes()
    const timeInMinutes = hour * 60 + minute

    const wh = Config.workingHours
    const workDays: number[] = wh.workDays

    if (!workDays.includes(day)) return false

    const start = wh.start * 60
    const end = wh.end * 60
    const breakStart = wh.breakStart * 60
    const breakEnd = wh.breakEnd * 60

    if (timeInMinutes < start || timeInMinutes >= end) return false
    if (timeInMinutes >= breakStart && timeInMinutes < breakEnd) return false

    return true
}

export function getWorkingHoursInfo(): string {
    const wh = Config.workingHours
    return (
        `Senin – Jumat, pukul ${wh.start}.00–${wh.breakStart}.00 dan ${wh.breakEnd}.00–${wh.end}.00 WIB` +
        ` (istirahat ${wh.breakStart}.00–${wh.breakEnd}.00)`
    )
}

// ─── Manajemen Admin ──────────────────────────────────────────────────────────

export function getAvailableAdmin(): AdminStatus | null {
    for (const status of adminStatusMap.values()) {
        if (!status.isBusy) return status
    }
    return null
}

export function getAllAdminStatus(): AdminStatus[] {
    return Array.from(adminStatusMap.values())
}

export function setAdminBusy(adminId: string, userJid: string): void {
    const status = adminStatusMap.get(adminId)
    if (!status) return
    status.isBusy = true
    status.currentUser = userJid
    status.busySince = Date.now()
}

export function setAdminFree(adminId: string): void {
    const status = adminStatusMap.get(adminId)
    if (!status) return
    status.isBusy = false
    status.currentUser = null
    status.busySince = null
}

// ─── Manajemen Antrian ────────────────────────────────────────────────────────

export function addToQueue(userJid: string): number {
    // Hindari duplikat
    if (queue.some(e => e.userJid === userJid)) {
        return getQueuePosition(userJid)
    }
    queue.push({ userJid, requestedAt: Date.now(), notified: false })
    return queue.length  // posisi (1-based)
}

export function removeFromQueue(userJid: string): void {
    const idx = queue.findIndex(e => e.userJid === userJid)
    if (idx !== -1) queue.splice(idx, 1)
}

export function getQueuePosition(userJid: string): number {
    const idx = queue.findIndex(e => e.userJid === userJid)
    return idx === -1 ? -1 : idx + 1
}

export function getQueueLength(): number {
    return queue.length
}

export function getNextInQueue(): QueueEntry | null {
    return queue[0] ?? null
}

export function isInQueue(userJid: string): boolean {
    return queue.some(e => e.userJid === userJid)
}

// ─── Manajemen Sesi Chat Admin-User ───────────────────────────────────────────

export function startAdminChat(
    userJid: string,
    adminStatus: AdminStatus
): void {
    const session: ActiveAdminChat = {
        userJid,
        adminJid: adminStatus.config.jid,
        adminId: adminStatus.config.id,
        startedAt: Date.now(),
    }
    activeSessions.set(userJid, session)
    adminToUser.set(adminStatus.config.jid, userJid)
    setAdminBusy(adminStatus.config.id, userJid)
}

export function endAdminChat(userJid: string): AdminStatus | null {
    const session = activeSessions.get(userJid)
    if (!session) return null

    activeSessions.delete(userJid)
    adminToUser.delete(session.adminJid)
    setAdminFree(session.adminId)

    return adminStatusMap.get(session.adminId) ?? null
}

export function getAdminChatByUser(userJid: string): ActiveAdminChat | null {
    return activeSessions.get(userJid) ?? null
}

export function getUserByAdminJid(adminJid: string): string | null {
    return adminToUser.get(adminJid) ?? null
}

export function isInAdminChat(userJid: string): boolean {
    return activeSessions.has(userJid)
}

// ─── Proses Antrian Berikutnya ────────────────────────────────────────────────
// Dipanggil setelah sesi chat selesai untuk melayani user berikutnya

export function dequeueNext(): { entry: QueueEntry; admin: AdminStatus } | null {
    const nextEntry = getNextInQueue()
    if (!nextEntry) return null

    const admin = getAvailableAdmin()
    if (!admin) return null

    removeFromQueue(nextEntry.userJid)
    startAdminChat(nextEntry.userJid, admin)

    return { entry: nextEntry, admin }
}