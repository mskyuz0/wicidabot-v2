/**
 * adminQueue.ts
 * Mengelola antrian pengguna, status admin, dan sesi chat admin-user.
 *
 * Alur baru "terima dulu":
 *  1. User minta hubungi admin
 *  2. Bot broadcast notifikasi ke SEMUA admin yang tidak sibuk
 *  3. Admin pertama yang balas "terima" → terhubung dengan user
 *  4. Admin lain yang balas "terima" → diberi tahu sudah diambil admin lain
 *  5. Jika tidak ada admin yang terima dalam PENDING_TIMEOUT ms → bot info ke user
 */

import Config from '../../config.json' with { type: 'json' }

// ─── Konstanta ────────────────────────────────────────────────────────────────

export const PENDING_TIMEOUT_MS = 5 * 60 * 1000  // 5 menit

// ─── Mutex (mencegah race condition "terima" bersamaan) ───────────────────────
// Node.js single-threaded, tapi event loop bisa interleave async calls.
// Set ini menyimpan userJid yang sedang dalam proses accept,
// sehingga jika dua admin "terima" hampir bersamaan, hanya yang pertama yang jalan.

const acceptLocks = new Set<string>()

/** Coba kunci proses accept untuk userJid. Return false jika sudah dikunci. */
export function tryLockAccept(userJid: string): boolean {
    if (acceptLocks.has(userJid)) return false
    acceptLocks.add(userJid)
    return true
}

/** Lepaskan kunci accept untuk userJid. */
export function unlockAccept(userJid: string): void {
    acceptLocks.delete(userJid)
}

// ─── Tipe Data ───────────────────────────────────────────────────────────────

export interface AdminConfig {
    id: string
    name: string
    jid: string
}

export interface AdminStatus {
    config: AdminConfig
    isBusy: boolean
    currentUser: string | null
    busySince: number | null
}

export interface QueueEntry {
    userJid: string
    requestedAt: number
    notified: boolean
}

export interface ActiveAdminChat {
    userJid: string
    adminJid: string
    adminId: string
    startedAt: number
}

/**
 * PendingRequest — user sudah minta hubungi admin,
 * notifikasi sudah disebar ke semua admin, menunggu salah satu menerima.
 */
export interface PendingRequest {
    userJid: string
    createdAt: number
    timeoutHandle: NodeJS.Timeout
    notifiedAdminJids: string[]   // admin yang sudah dapat notifikasi
}

// ─── State ───────────────────────────────────────────────────────────────────

const adminStatusMap = new Map<string, AdminStatus>()
const queue: QueueEntry[] = []
const activeSessions = new Map<string, ActiveAdminChat>()   // key = userJid
const adminToUser = new Map<string, string>()                // adminJid canonical → userJid

// Pending requests: user yang menunggu admin terima
const pendingRequests = new Map<string, PendingRequest>()   // key = userJid
// Reverse lookup: admin yang sudah mendapat notifikasi → userJid yang ditunggu
const adminPendingUser = new Map<string, string>()           // adminJid canonical → userJid

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
    const day = now.getDay()
    const timeInMinutes = now.getHours() * 60 + now.getMinutes()

    const wh = Config.workingHours
    if (!(wh.workDays as number[]).includes(day)) return false

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
        `Senin – Jumat, pukul ${wh.start}.00–${wh.breakStart}.00 ` +
        `dan ${wh.breakEnd}.00–${wh.end}.00 WIB ` +
        `(istirahat ${wh.breakStart}.00–${wh.breakEnd}.00)`
    )
}

// ─── Manajemen Admin ──────────────────────────────────────────────────────────

export function getAvailableAdmins(): AdminStatus[] {
    return Array.from(adminStatusMap.values()).filter(s => !s.isBusy)
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

// ─── JID Canonical ───────────────────────────────────────────────────────────

export function canonicalJid(jid: string): string {
    return jid.split('@')[0].replace(/:\d+$/, '') + '@s.whatsapp.net'
}

// ─── Manajemen Pending Request ────────────────────────────────────────────────

/**
 * Buat pending request untuk user.
 * Callback onTimeout dipanggil jika tidak ada admin yang terima dalam PENDING_TIMEOUT_MS.
 */
export function createPendingRequest(
    userJid: string,
    notifiedAdminJids: string[],
    onTimeout: () => void
): PendingRequest {
    // Hapus pending lama jika ada
    cancelPendingRequest(userJid)

    const timeoutHandle = setTimeout(onTimeout, PENDING_TIMEOUT_MS)
    const pending: PendingRequest = {
        userJid,
        createdAt: Date.now(),
        timeoutHandle,
        notifiedAdminJids,
    }
    pendingRequests.set(userJid, pending)

    // Daftarkan reverse lookup untuk setiap admin yang dinotifikasi
    for (const adminJid of notifiedAdminJids) {
        adminPendingUser.set(canonicalJid(adminJid), userJid)
    }

    return pending
}

/** Batalkan pending request (timeout di-clear, data dihapus) */
export function cancelPendingRequest(userJid: string): void {
    const pending = pendingRequests.get(userJid)
    if (!pending) return
    clearTimeout(pending.timeoutHandle)
    for (const adminJid of pending.notifiedAdminJids) {
        adminPendingUser.delete(canonicalJid(adminJid))
    }
    pendingRequests.delete(userJid)
}

export function getPendingRequest(userJid: string): PendingRequest | null {
    return pendingRequests.get(userJid) ?? null
}

export function isInPending(userJid: string): boolean {
    return pendingRequests.has(userJid)
}

/** Cek apakah admin ini memiliki pending user yang menunggu diterima */
export function getPendingUserByAdmin(adminJid: string): string | null {
    return adminPendingUser.get(canonicalJid(adminJid)) ?? null
}

// ─── Manajemen Antrian ────────────────────────────────────────────────────────

export function addToQueue(userJid: string): number {
    if (queue.some(e => e.userJid === userJid)) return getQueuePosition(userJid)
    queue.push({ userJid, requestedAt: Date.now(), notified: false })
    return queue.length
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

export function startAdminChat(userJid: string, adminStatus: AdminStatus): void {
    const cJid = canonicalJid(adminStatus.config.jid)
    const session: ActiveAdminChat = {
        userJid,
        adminJid: cJid,
        adminId: adminStatus.config.id,
        startedAt: Date.now(),
    }
    activeSessions.set(userJid, session)
    adminToUser.set(cJid, userJid)
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
    return adminToUser.get(canonicalJid(adminJid)) ?? null
}

export function isInAdminChat(userJid: string): boolean {
    return activeSessions.has(userJid)
}

export function getAdminStatusById(adminId: string): AdminStatus | null {
    return adminStatusMap.get(adminId) ?? null
}

export function getAdminStatusByJid(adminJid: string): AdminStatus | null {
    const cJid = canonicalJid(adminJid)
    for (const status of adminStatusMap.values()) {
        if (canonicalJid(status.config.jid) === cJid) return status
    }
    return null
}

// ─── Proses Antrian Berikutnya ────────────────────────────────────────────────

/**
 * Dipanggil setelah sesi selesai.
 * Mengembalikan entry antrian berikutnya (tanpa langsung start chat),
 * agar Messages.ts bisa broadcast notifikasi ke admin terlebih dahulu.
 */
export function peekNextInQueue(): QueueEntry | null {
    return queue[0] ?? null
}

export function dequeueUser(userJid: string): void {
    removeFromQueue(userJid)
}