/**
 * sessionManager.ts
 * Mengelola sesi percakapan user dengan bot (timeout, dll).
 */

import * as Config from '../../config.json'
import * as thisText from './textFunction'

export interface UserSession {
    active: boolean
    timeout?: NodeJS.Timeout
}

export const userSessions: Record<string, UserSession> = {}

/**
 * Reset timer timeout sesi user.
 * Jika tidak ada pesan dalam Config.timeout menit, sesi ditutup.
 */
export function resetTimeout(sender: string, WhatsAppClient: any): void {
    if (userSessions[sender]?.timeout) {
        clearTimeout(userSessions[sender].timeout)
    }

    userSessions[sender].timeout = setTimeout(async () => {
        try {
            thisText.closingMessage(WhatsAppClient, sender)
        } catch (err) {
            console.error('[Session] Gagal mengirim pesan timeout:', err)
        }
        userSessions[sender].active = false
        delete userSessions[sender]
    }, Config.timeout * 60 * 1000)
}

/**
 * Hapus sesi user secara manual (misalnya saat selesai chat dengan admin).
 */
export function clearSession(sender: string): void {
    if (userSessions[sender]?.timeout) {
        clearTimeout(userSessions[sender].timeout)
    }
    delete userSessions[sender]
}