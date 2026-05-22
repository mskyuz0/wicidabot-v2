/**
 * textFunction.ts
 * Kumpulan semua teks/pesan yang dikirimkan bot ke user maupun admin.
 */

import { AdminConfig } from './adminQueue.js'

// ─── Pesan Umum Bot ───────────────────────────────────────────────────────────

export function welcomeMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text:
            `Hai! 👋 Selamat datang di *WhatsApp Wicida Support*.\n\n` +
            `Saya siap membantu menjawab pertanyaan seputar akademik. ` +
            `Silakan ketik pertanyaanmu secara langsung, misalnya:\n` +
            `_"Apakah saya bisa mencetak KRS?"_\n\n` +
            `Ketik *hubungi admin* jika ingin terhubung langsung dengan staf BAAK.`,
    })
}

export function closingMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text: `Karena tidak ada respon, kami mengakhiri sesi chat ini. Jangan khawatir, kamu bisa memulai percakapan baru kapan saja. 😊`,
    })
    client.sendMessage(sender, {
        text: `Terima kasih sudah menghubungi *WhatsApp Wicida Support*. Semoga harimu menyenangkan! 🙏`,
    })
}

export function notFoundMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text:
            `Sepertinya saya belum memiliki informasi tentang itu. 🤔\n\n` +
            `Kamu bisa coba:\n` +
            `• Menanyakan dengan kata lain\n` +
            `• Ketik *hubungi admin* untuk terhubung langsung dengan staf BAAK`,
    })
}

export function moreQuestion(client: any, sender: string): void {
    client.sendMessage(sender, {
        text: `Ada pertanyaan lain? Silakan langsung ketik, atau abaikan pesan ini jika sudah selesai. 😊`,
    })
}

export function antiGroupMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text:
            `🚫 *Maaf, bot ini tidak melayani grup.*\n\n` +
            `Silakan hubungi melalui chat pribadi. Terima kasih! 🙏`,
    })
}

// ─── Pesan Hubungi Admin ──────────────────────────────────────────────────────

export function outsideWorkingHoursMessage(
    client: any,
    sender: string,
    workingHoursInfo: string
): void {
    client.sendMessage(sender, {
        text:
            `⏰ *Di luar jam kerja*\n\n` +
            `Maaf, fitur hubungi admin hanya tersedia pada:\n` +
            `📅 ${workingHoursInfo}\n\n` +
            `Di luar jam tersebut, kamu tetap bisa bertanya kepada saya dan ` +
            `pesanmu akan kami sampaikan saat jam kerja dimulai.`,
    })
}

export function addedToQueueMessage(
    client: any,
    sender: string,
    position: number,
    queueLength: number
): void {
    client.sendMessage(sender, {
        text:
            `🕐 *Semua admin sedang sibuk*\n\n` +
            `Kamu ada di posisi antrian: *${position} dari ${queueLength}*\n\n` +
            `Mohon tunggu, admin akan segera melayanimu. Kamu juga bisa tetap bertanya kepada saya sambil menunggu.\n\n` +
            `Ketik *batalkan* jika ingin membatalkan antrian.`,
    })
}

export function alreadyInQueueMessage(
    client: any,
    sender: string,
    position: number
): void {
    client.sendMessage(sender, {
        text:
            `🔔 Kamu sudah berada di antrian posisi *${position}*.\n` +
            `Mohon bersabar, admin akan segera meladeni kamu.\n\n` +
            `Ketik *batalkan* untuk membatalkan antrian.`,
    })
}

export function queueCancelledMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text: `✅ Antrianmu telah dibatalkan. Ketik *hubungi admin* kapan saja jika kamu butuh bantuan lagi.`,
    })
}

export function notInQueueMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text: `Kamu tidak sedang berada dalam antrian.`,
    })
}

export function alreadyInAdminChatMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text: `Kamu sudah sedang terhubung dengan admin. Ketik *selesai* jika ingin mengakhiri sesi.`,
    })
}

// Dikirim ke user saat admin tersedia
export function adminConnectedToUserMessage(
    client: any,
    sender: string,
    adminName: string
): void {
    client.sendMessage(sender, {
        text:
            `✅ *Terhubung dengan Admin*\n\n` +
            `Hai! Kamu sekarang terhubung dengan *${adminName}*.\n` +
            `Silakan sampaikan keperluanmu.\n\n` +
            `Ketik *selesai* untuk mengakhiri sesi chat dengan admin.`,
    })
}

// Dikirim ke user saat sesi berakhir
export function adminChatEndedUserMessage(client: any, sender: string): void {
    client.sendMessage(sender, {
        text:
            `👋 Sesi chat dengan admin telah berakhir.\n\n` +
            `Terima kasih sudah menghubungi *WhatsApp Wicida Support*! ` +
            `Jika ada pertanyaan lain, jangan ragu untuk menghubungi kami kembali. 🙏`,
    })
}

// ─── Pesan untuk Admin ────────────────────────────────────────────────────────

// Notifikasi ke admin bahwa ada user yang menghubungi
export function notifyAdminNewChat(
    client: any,
    adminJid: string,
    userJid: string,
    adminName: string
): void {
    const userPhone = userJid.replace('@s.whatsapp.net', '')
    client.sendMessage(adminJid, {
        text:
            `🔔 *[WICIDA BOT - NOTIFIKASI]*\n\n` +
            `Halo *${adminName}*, ada mahasiswa yang ingin menghubungimu.\n\n` +
            `📱 Nomor: *+${userPhone}*\n\n` +
            `Balas pesan ini untuk memulai percakapan, atau ketik *tolak* untuk menolak sesi ini.\n` +
            `Ketik *selesai* untuk mengakhiri sesi saat percakapan selesai.`,
    })
}

// Notifikasi ke admin saat user mengakhiri sesi
export function notifyAdminChatEnded(
    client: any,
    adminJid: string,
    userJid: string
): void {
    const userPhone = userJid.replace('@s.whatsapp.net', '')
    client.sendMessage(adminJid, {
        text:
            `Sesi chat dengan *+${userPhone}* telah berakhir.\n` +
            `Kamu sekarang tersedia untuk melayani pengguna lain.`,
    })
}

// Relay pesan dari user ke admin (dengan label)
export function relayToAdmin(
    client: any,
    adminJid: string,
    userJid: string,
    text: string
): void {
    const userPhone = userJid.replace('@s.whatsapp.net', '')
    client.sendMessage(adminJid, {
        text: `💬 *[Dari +${userPhone}]:*\n${text}`,
    })
}

// Relay pesan dari admin ke user
export function relayToUser(
    client: any,
    userJid: string,
    adminName: string,
    text: string
): void {
    client.sendMessage(userJid, {
        text: `💬 *[Admin ${adminName}]:*\n${text}`,
    })
}

// Notifikasi ke admin berikutnya dari antrian
export function notifyAdminFromQueue(
    client: any,
    adminJid: string,
    userJid: string,
    adminName: string,
    position: number
): void {
    const userPhone = userJid.replace('@s.whatsapp.net', '')
    client.sendMessage(adminJid, {
        text:
            `🔔 *[WICIDA BOT - ANTRIAN]*\n\n` +
            `Halo *${adminName}*, ada mahasiswa dari antrian yang menunggumu.\n\n` +
            `📱 Nomor: *+${userPhone}*\n\n` +
            `Balas pesan ini untuk memulai percakapan.\n` +
            `Ketik *selesai* untuk mengakhiri sesi saat selesai.`,
    })
}

export async function antiGroups(WhatsAppClient: any, sender: string){
    await WhatsAppClient.sendMessage(sender, {text: `🚫 *Maaf, kami ini tidak melayani grup.*

Gunakan melalui chat pribadi. Terima kasih! 🙏`})
}