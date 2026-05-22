import Config from '../../config.json' with { type: 'json' }

export default {
    keywords: ["validasi krs", "verifikasi krs", "valid krs", "cetak krs"],
    async execute(WhatsAppClient: any, sender: any){
        await WhatsAppClient.sendMessage(sender, { text: `Untuk validasi atau cetak KRS, kamu bisa ikuti prosedur dibawah ini:

1. Kunjugi website SIAK WICIDA (${Config.siakWebsite}).
2. Lakukan input KRS pada menu KRS di sidebar kiri.
3. Temui dosen pembimbing kamu untuk melakukan bimbingan agar KRS kamu di setujui.
4. Kembali kunjungi website SIAK WICIDA lalu download file KRS kamu di menu KRS.
5. Cetak KRS menggunakan kertas Cover A4.
6. Datang ke loket BAAK untuk melakukan validasi.` })
    }
}