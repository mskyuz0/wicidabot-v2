import Config from '../../config.json' with { type: 'json' }

export default {
    keywords: ["surat aktif", "surat keterangan aktif"],
    async execute(WhatsAppClient: any, sender: any) {
        await WhatsAppClient.sendMessage(sender, {
            text: `Surat Keterangan Aktif Kuliah adalah surat pernyataan yang dikeluarkan oleh STMIK Widya Cipta Dharma kepada Mahasiswa, yang menerangkan status Mahasiswa yang bersangkutan masih aktif dan terdaftar disemester tersebut.
            
*Prosedur Surat Aktif Kuliah:*

1. Mahasiswa mengajukan permohonan surat keterangan aktif kuliah dengan mengisi form melalui laman ${Config.baakWebsite}
2. Setelah mengajukan permohonan, Mahasiswa dapat datang ke loket BAAK untuk mengambil Surat Keterangan Aktif Kuliah.
3. Tunjukan Kwitansi Pembayaran BPP pada staff BAAK sebagai validasi.` })
    }
}