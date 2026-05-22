export default {
    keywords: ["lupa password siak", "ganti password siak", "ubah password siak", "lupa sandi siak", "ganti sandi siak", "ubah password siak", "ubah sandi siak"],
    async execute(WhatsAppClient: any, sender: any){
        await WhatsAppClient.sendMessage(sender, { text: `Jika kamu ingin mengubah atau lupa kata sandi akun SIAK kamu, kamu bisa kunjungi loket BAAK pada saat jam kerja!` })
    }
}