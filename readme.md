# 🤖 Wicida Bot

WhatsApp bot untuk layanan akademik BAAK berbasis [Baileys](https://github.com/WhiskeySockets/Baileys), ditulis dengan TypeScript. Bot ini mampu menjawab pertanyaan berulang secara otomatis dengan toleransi typo, serta menyediakan sistem hubungi admin dengan antrian cerdas.

---

## ✨ Fitur

- **FAQ Otomatis** — Menjawab pertanyaan umum mahasiswa (KRS, transkrip, surat aktif, dll) tanpa perlu memilih menu angka
- **Toleransi Typo** — Menggunakan algoritma Levenshtein Distance untuk mengenali pertanyaan meski ada salah ketik
- **Hubungi Admin** — Mahasiswa bisa terhubung langsung dengan staf BAAK
- **Antrian Cerdas** — Jika semua admin sibuk, mahasiswa masuk antrian dan otomatis dilayani saat admin tersedia
- **Jam Kerja** — Fitur hubungi admin hanya aktif Senin–Jumat 08.00–16.00 (istirahat 12.00–14.00)
- **Anti-Ban** — Typing indicator dan random delay agar perilaku bot terasa natural
- **Modular** — Setiap topik FAQ adalah file terpisah, mudah ditambah atau diubah

---

## 📁 Struktur Proyek

```
wicidabot/
├── config.json              # Konfigurasi utama (admin, jam kerja, dll)
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts              # Entry point, koneksi ke WhatsApp
    ├── Commands/            # Modul FAQ (satu file = satu topik)
    │   ├── krs.ts
    │   ├── transkrip.ts
    │   ├── suratAktif.ts
    │   ├── passwordSiak.ts
    │   └── sertifikatAkreditasi.ts
    ├── Events/              # Handler event Baileys
    │   ├── Messages.ts      # Router utama semua pesan masuk
    │   ├── Connection.ts    # Handle koneksi & QR code
    │   ├── AntiCall.ts      # Tolak panggilan masuk
    │   └── AntiGroup.ts     # Tolak pesan dari grup
    └── Utils/
        ├── adminQueue.ts    # Manajemen antrian & sesi admin
        ├── knowledgeBase.ts # Auto-load semua modul Commands
        ├── sessionManager.ts# Manajemen sesi & timeout user
        ├── textFunction.ts  # Semua teks/pesan yang dikirim bot
        └── typoHandle.ts    # Algoritma pencocokan teks
```

---

## 🚀 Instalasi

**Prasyarat:** Node.js v18+ dan npm

```bash
# 1. Clone / ekstrak project
cd wicidabot

# 2. Install dependensi
npm install

# 3. Build TypeScript ke JavaScript
npm run build

# 4. Jalankan bot
npm start
```

Saat pertama kali dijalankan, QR code akan muncul di terminal. Scan menggunakan WhatsApp di **Linked Devices** dari nomor yang akan dipakai sebagai bot.

> **Penting:** Jangan hapus folder `session/` yang otomatis terbuat. Folder ini menyimpan kredensial agar tidak perlu scan QR ulang setiap restart.

---

## ⚙️ Konfigurasi (`config.json`)

```json
{
    "timeout": 10,
    "typoThreshold": 0.45,
    "baakWebsite": "https://baak.wicida.ac.id/",
    "siakWebsite": "https://siak.wicida.ac.id/",
    "antiBan": {
        "typingDelayMin": 800,
        "typingDelayMax": 2500,
        "readReceiptDelay": 500
    },
    "workingHours": {
        "start": 8,
        "end": 16,
        "breakStart": 12,
        "breakEnd": 14,
        "workDays": [1, 2, 3, 4, 5]
    },
    "admins": [
        {
            "id": "admin1",
            "name": "Admin BAAK 1",
            "jid": "628xxxxxxxxxx@s.whatsapp.net"
        }
    ]
}
```

| Key | Keterangan |
|---|---|
| `timeout` | Menit sebelum sesi user ditutup otomatis karena tidak aktif |
| `typoThreshold` | Batas kemiripan teks (0.0–1.0). Semakin tinggi, semakin ketat |
| `antiBan.typingDelayMin/Max` | Range delay acak (ms) sebelum bot mengirim pesan |
| `workingHours` | Pengaturan jam & hari kerja untuk fitur hubungi admin |
| `admins[].jid` | JID WhatsApp admin (lihat cara mendapatkannya di bawah) |

### Cara Mendapatkan JID Admin

JID adalah nomor WhatsApp dalam format `{kode_negara}{nomor}@s.whatsapp.net`.

Contoh: nomor `0812-3456-7890` → JID `6281234567890@s.whatsapp.net`

> **Catatan:** Pada beberapa perangkat, Baileys menggunakan format `@lid` (misalnya `42215317454881@lid`). Jika terjadi, salin JID persis seperti yang muncul di log terminal saat admin mengirim pesan ke bot, dan masukkan ke `config.json`.

Cara verifikasi JID yang mudah — tambahkan sementara di `Messages.ts`:
```typescript
// Tambahkan di baris awal fungsi execute():
console.log(`[DEBUG] Pesan dari: ${message.key.remoteJid}`)
```
Minta admin kirim pesan ke bot, lalu salin JID dari log terminal.

---

## 💬 Cara Penggunaan

### Untuk Mahasiswa (User)

| Yang diketik | Respons bot |
|---|---|
| Pesan pertama apapun | Bot mengirim salam sambutan |
| `"Apakah bisa cetak KRS?"` | Bot menjawab otomatis |
| `"hubungi admin"` | Bot mencarikan admin yang tersedia |
| `"batalkan"` | Membatalkan posisi dari antrian |
| `"selesai"` | Mengakhiri sesi chat dengan admin |

### Untuk Admin

Admin **tidak perlu membuka chat** dengan nomor mahasiswa secara langsung. Semua komunikasi melalui nomor bot.

| Yang diketik admin | Aksi |
|---|---|
| *(pesan apapun)* | Diteruskan ke mahasiswa yang sedang dilayani |
| `selesai` | Mengakhiri sesi, admin kembali tersedia |
| `tolak` | Menolak sesi *(hanya bisa sebelum membalas pertama kali)* |

**Alur admin menerima chat:**

1. Bot mengirim notifikasi ke nomor admin:
   ```
   🔔 [WICIDA BOT - NOTIFIKASI]
   Halo Admin BAAK 1, ada mahasiswa yang ingin menghubungimu.
   📱 Nomor: +6281234567890
   ```
2. Admin langsung **balas pesan tersebut** di chat dengan bot
3. Bot otomatis meneruskan ke mahasiswa dengan label nama admin
4. Ketik `selesai` saat percakapan selesai

---

## 🗂️ Menambah FAQ Baru

Buat file baru di `src/Commands/`, contoh `src/Commands/jadwalKuliah.ts`:

```typescript
import * as Config from '../../config.json'

module.exports = {
    keywords: [
        "jadwal kuliah",
        "jadwal kelas",
        "lihat jadwal",
        "kapan kuliah"
    ],
    async execute(client: any, sender: string) {
        await client.sendMessage(sender, {
            text:
                `Untuk melihat jadwal kuliah:\n\n` +
                `1. Buka ${Config.siakWebsite}\n` +
                `2. Login dengan NIM dan password SIAK\n` +
                `3. Pilih menu *Jadwal Kuliah*`
        })
    }
}
```

Setelah disimpan, jalankan `npm run build` — bot otomatis memuat modul baru tanpa perlu mengubah file lain.

---

## 🔄 Alur Sistem Hubungi Admin

```
User: "hubungi admin"
         │
         ▼
  [Cek jam kerja]
  Bukan jam kerja ──► Bot info jam kerja, selesai
         │
         ▼ Jam kerja
  [Cari admin tersedia]
  Ada admin ──► Hubungkan langsung ──► Notifikasi ke admin
         │
         │ Semua sibuk
         ▼
  User masuk antrian (diberi nomor posisi)
         │
         ▼ Admin selesai dengan user lain
  User berikutnya otomatis dilayani
```

---

## 🛡️ Anti-Ban

Bot menerapkan beberapa strategi agar tidak mudah diblokir WhatsApp:

- **Typing indicator** — Bot mengirim sinyal "sedang mengetik" sebelum membalas
- **Random delay** — Jeda acak 800ms–2500ms setiap respons
- **Tidak ada broadcast** — Bot hanya merespons pesan masuk, tidak pernah memulai percakapan massal

**Rekomendasi tambahan:**
- Gunakan nomor WhatsApp Business
- Jangan sering restart bot (simpan folder `session/`)
- Lakukan warmup nomor baru selama 1–2 minggu sebelum digunakan sebagai bot

---

## 📜 Scripts

```bash
npm run build   # Compile TypeScript → dist/
npm run dev     # Build + langsung jalankan
npm start       # Jalankan dari dist/ (tanpa compile ulang)
```

---

## 🧩 Dependensi

| Package | Versi | Fungsi |
|---|---|---|
| `baileys` | ^7.0.0-rc.9 | Library WhatsApp Web API |
| `pino` | ^10.1.0 | Logger |
| `qrcode` | ^1.5.4 | Generate QR code di terminal |
| `typescript` | ^5.9.3 | Compiler TypeScript |