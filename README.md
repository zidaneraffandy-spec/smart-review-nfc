# Smart Google Review NFC Card

Kartu NFC/QR untuk UMKM yang mengarahkan pelanggan ke Google Review dan menerima kritik-saran lewat WhatsApp.
Stack: HTML/CSS/vanilla JS, Vercel Serverless Functions, Upstash Redis (REST). Tanpa SQL.

## Struktur

```
api/auth/{login,logout,me}.js          autentikasi admin
api/admin/cards/index.js               GET daftar+statistik, POST daftarkan ID
api/admin/cards/[id]/index.js          GET detail, PUT aktivasi/edit
api/admin/cards/[id]/status.js         POST nonaktifkan/aktifkan kembali
api/public/card.js                     GET data publik kartu aktif (tanpa login)
lib/redis.js  auth.js  validation.js  ratelimit.js  responses.js  cards.js
public/index.html + js/app.js + js/wa.js + styles/app.css      halaman pelanggan (/c/:id)
public/admin/index.html + js/admin.js + styles/admin.css       dashboard (/admin)
scripts/hash-password.js  test-redis.js  run-tests.js
vercel.json  .env.example  package.json
```

## 1. Menjalankan di komputer

```bash
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
```

1. Buat database Redis di https://console.upstash.com (region Singapore). Dari tab **REST API**, salin URL dan token (read-write) ke `.env.local`.
2. Buat hash password admin: `npm run hash-password`, lalu salin baris `ADMIN_PASSWORD_HASH=...` ke `.env.local`.
3. Cek koneksi: `npm run test-redis` (harus muncul "Redis terhubung").
4. Tes otomatis (tanpa Upstash): `npm test`.
5. Jalankan: `npx vercel login` (sekali saja), lalu `npm run dev` dan buka http://localhost:3000/admin.
   Saat pertama kali, jawab pertanyaan `vercel dev` (link ke project baru).

## 2. Alur pemakaian

1. Login di `/admin`.
2. **Daftarkan ID** (mis. 10 sekaligus). Salin daftar URL, tulis tiap URL ke chip NFC dan buat QR Code-nya.
3. Saat ada klien: tekan **Aktivasi** pada kartunya, isi data toko, **Aktifkan**.
4. Perubahan data (nama, link review, WA, warna) lewat **Edit**. URL kartu tidak berubah, jadi chip/QR tidak perlu dibuat ulang.

## 3. Deploy ke Vercel

1. Push proyek ke GitHub (pastikan `.env.local` tidak ikut: sudah ada di `.gitignore`).
2. vercel.com → **Add New Project** → pilih repo. Framework: **Other**. Build command dan output directory dibiarkan kosong.
3. **Settings → Environment Variables**, isi: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_TTL_SECONDS`.
   Hash berisi tanda `:` dan itu normal; tempel apa adanya.
4. **Deploy**. Jika mengubah environment variable, lakukan **Redeploy**.
5. Custom domain: **Settings → Domains → Add**, ikuti instruksi DNS (CNAME/A record) dari Vercel.
   Gunakan domain final SEBELUM menulis chip NFC, karena URL di chip memuat domain.

### Uji setelah deploy

```bash
DOMAIN=https://domain-saya.vercel.app
curl -i $DOMAIN/api/public/card?id=KARTU999-ABCDEF      # harus 404 {"status":"not_found"}
curl -i $DOMAIN/api/admin/cards                          # harus 401
curl -i -X POST $DOMAIN/api/auth/login -H "Origin: $DOMAIN" -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"salah"}'        # harus 401
```
Lalu uji lewat browser: login, daftarkan ID, aktivasi, buka `/c/ID` dari HP, ubah WA, muat ulang halaman kartu.

## 4. Pengujian

`npm test` mencakup skenario 1-14 dari daftar Tahap 6 (login, aktivasi, pending/inactive, ID tidak dikenal, update data,
akses tanpa autentikasi, CSRF, Redis down, format pesan WhatsApp).
Skenario **15 (layout HP & desktop)** harus dicek manual: buka `/admin` dan `/c/ID` di HP asli dan desktop.
Tes juga belum mencakup Upstash/Vercel sungguhan: uji manual setelah deploy.

## 5. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| 503 "Layanan penyimpanan bermasalah" | URL/token Upstash salah, atau env belum di-set lalu belum Redeploy. Cek log di Vercel → Deployments → Functions |
| Login selalu "Username atau password salah" | `ADMIN_PASSWORD_HASH` terpotong/berspasi; buat ulang dengan `npm run hash-password` |
| "Terlalu banyak percobaan login" | Tunggu 15 menit, atau hapus key `rl:login:<ip>` di Upstash Data Browser |
| `/c/ID` menampilkan 404 Vercel | `vercel.json` tidak ikut ter-deploy / belum Redeploy |
| Login berhasil tapi langsung keluar (Safari lokal) | Safari menolak cookie `Secure` di `http://localhost`; pakai Chrome/Firefox untuk tes lokal |
| Perubahan tidak muncul | Seharusnya tidak terjadi (API `no-store`). Muat ulang paksa dan cek tab Network |

## 6. Batasan yang perlu Anda ketahui

- Dibuat untuk **satu akun admin**. Belum ada fitur ganti password dari dashboard (ganti `ADMIN_PASSWORD_HASH` lalu Redeploy).
- Aktivasi memakai pemeriksaan status lalu penyimpanan (bukan transaksi atomik). Aman untuk satu admin; jika kelak ada banyak admin bersamaan, perlu penguncian.
- Nomor WhatsApp toko memang terlihat oleh pelanggan (diperlukan untuk `wa.me`).
- Tombol Google Review ditampilkan untuk semua rating agar tidak melanggar aturan review gating Google. Baca kebijakan Google Maps terbaru sebelum berjualan.
- Proyek ini **belum diaudit keamanannya**. Jangan menyebutnya "aman" atau "siap produksi" sebelum diuji dan ditinjau.
