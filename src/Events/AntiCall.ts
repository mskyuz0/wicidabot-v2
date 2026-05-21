import type { WASocket, WACallEvent } from "baileys";

module.exports = {
    name: 'call',
    async execute(sock: WASocket, ConnectWhatsApp: () => Promise<void>, calls: WACallEvent[]) {
        for (const call of calls) {
            if (call.status !== "offer") continue;

            const callerJid = call.from;
            console.log(`[Call] Panggilan masuk dari ${callerJid} — ditolak otomatis`);

            await sock.rejectCall(call.id, callerJid);
        }
    }
}