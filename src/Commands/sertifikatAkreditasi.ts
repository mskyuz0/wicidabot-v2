import * as Config from '../../config.json'

module.exports = {
    keywords: ["sertifikat akreditasi", "akreditasi"],
    async execute(WhatsAppClient: any, sender: any){
        await WhatsAppClient.sendMessage(sender, { text: `Untuk Sertifikat Akreditasi, kamu bisa ikuti prosedur dibawah ini:

1. Kunjugi website BAAK WICIDA (${Config.baakWebsite}).
2. Pilih *Info Pelayanan* pada bilah navigasi.
3. Kemudian pilih *Akreditasi Institusi/Prodi*.

Disana kamu dapat meng-unduh sertifikat akreditasi sesuai dengan yang kamu inginkan!` })
    }
}