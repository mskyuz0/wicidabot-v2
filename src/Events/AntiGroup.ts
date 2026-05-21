import type { WASocket, GroupMetadata } from "baileys";
import { antiGroups } from '../Utils/textFunction'

module.exports = {
    name: 'groups.upsert',
    async execute(sock: WASocket, ConnectWhatsApp: () => Promise<void>, groups: GroupMetadata[]) {
        for (const group of groups) {
            console.log(
                `[Group] Bot masuk ke grup "${group.subject}" (${group.id}) — keluar otomatis`
            );

            await antiGroups(sock, group.id);

            await sock.groupLeave(group.id);
            console.log(`[Group] Bot berhasil keluar dari grup ${group.id}`);
        }
    }
}