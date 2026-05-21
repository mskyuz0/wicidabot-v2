module.exports = {
    keywords: ["transkrip", "transkrip nilai", "transkip", "nilai"],
    async execute(WhatsAppClient: any, sender: any){
        await WhatsAppClient.sendMessage(sender, { text: `Jika kamu ingin cetak Transkrip Nilai kamu bisa datang ke loket BAAK pada saat jam kerja kemudian sebutkan Nama dan NIM kamu.` })
    }
}