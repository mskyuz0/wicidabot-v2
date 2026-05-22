import {
    DisconnectReason,
    WASocket,
    ConnectionState
} from "baileys";
import * as QRCode from "qrcode";
import { Boom } from "@hapi/boom";

export default {
    name: 'connection.update',
    async execute(baileysSock: WASocket, ConnectWhatsApp: () => Promise<void>, update: Partial<ConnectionState>) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("[SYSTEM] Please Scan QRCode for below to login:\n");
            console.log(await QRCode.toString(qr, {type: 'terminal', small: true}));
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error instanceof Boom && (lastDisconnect.error as Boom).output?.statusCode !== DisconnectReason.loggedOut;
            const isError: Boom<any> = lastDisconnect?.error as Boom

            console.log(`[SYSTEM] Connection closed (${isError?.output?.statusCode}): ${isError?.message}`);

            if (shouldReconnect) {
                console.log("[SYSTEM] Reconnecting...");
                await new Promise((res) => setTimeout(res, 2000));
                ConnectWhatsApp();
            } else {
                console.log("Logged out. Delete session folder if needed.");
            }
        } else if (connection === 'open') {
            console.log('[SYSTEM] WhatsApp Bot Connected!');
        }
    }
}