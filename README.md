# Checker Tambang (offline)

Aplikasi untuk checker mengisi **Laporan Progres Harian** tambang pasir dari HP, tanpa internet. Dibuat dengan HTML/CSS/JS murni (pola sama dengan Kasir UMKM). Data tersimpan di perangkat masing-masing.

## Fitur
- **Form laporan** mengikuti format WhatsApp yang biasa dipakai: tanggal, lokasi/blok, cuaca, kondisi area, aktivitas, jam kerja tiap alat, volume, ritase, progres, pengeluaran, penjualan, kendala, rencana besok, PIC. Tanpa dokumentasi foto.
- **Hitung otomatis**: sewa alat = jam × tarif/jam (bisa diisi manual), total pengeluaran, penjualan per produk (harga × kuantiti), total penjualan, selisih.
- **Teks WhatsApp** otomatis sesuai format lama → tombol *Salin teks* / *Bagikan*.
- **Draf otomatis**: isian tidak hilang walau aplikasi tertutup.
- **Pengecekan** sebelum simpan: jam alat > 24, ritase ≠ total kuantiti penjualan, solar ada tapi jam alat kosong, lain-lain tanpa keterangan, laporan ganda (tanggal + lokasi sama).
- **Riwayat** per bulan: lihat teks WA, ubah, hapus (admin).
- **Rekap bulanan**: total ritase, penjualan, pengeluaran per pos, penjualan per produk, selisih.
- **Ke spreadsheet keuangan**: *Salin ke spreadsheet* (tempel di sel A1 Google Sheets/Excel) atau *Unduh CSV* (pilih `;` untuk Excel Indonesia, `,` untuk Google Sheets). Satu baris per laporan.
- **Pengguna & PIN**: admin (kelola pengaturan, hapus laporan) dan checker (isi/ubah laporan).
- **PIN Laporan**: menu Rekap (grafik, total, nett, ekspor) terkunci untuk checker. Checker hanya melihat laporan buatannya sendiri, tanpa royalti/nett. Admin mengatur PIN Laporan di menu Atur.
- **Royalti otomatis** (rit terjual × tarif per rit) dan **grafik** penjualan vs biaya, nett harian, komposisi pengeluaran.
- **Impor laporan (gabung)** dari file JSON tanpa mengubah PIN/pengguna/laporan lain.
- **Backup/pulihkan JSON**.

## Cara menjalankan
### Coba di komputer
1. Buka terminal di folder `checker-tambang`, jalankan `python3 -m http.server 8000`.
2. Buka `http://localhost:8000` di Chrome.
3. Masuk: **Admin** PIN **1234**, atau **Iqbal** PIN **1111**.

### Pakai di HP checker
1. Unggah isi folder `checker-tambang` ke hosting statis HTTPS gratis (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
2. Buka alamatnya di Chrome HP → menu ⋮ → **Install aplikasi / Tambahkan ke layar utama**.
3. Setelah dibuka sekali, aplikasi jalan walau tanpa sinyal.

## Langkah awal
1. Masuk sebagai Admin → **Atur**:
   - cek nama usaha, daftar lokasi/blok, aktivitas, cuaca;
   - cek **alat & tarif sewa/jam** (awal: Kobelco Rp170.000, CAT Rp160.000 — dihitung dari contoh laporan 3-11-2026);
   - cek **produk & harga** (awal: Pasir Ayak Rp1.200.000/rit, Pasir Bahan Rp750.000/rit);
   - ganti PIN Admin & Iqbal, tambah checker lain.
2. Lakukan **Backup JSON** rutin. Data hanya ada di HP itu; jika HP hilang/reset atau data browser dihapus, laporan ikut hilang.

## Sinkron dua arah dengan Google Sheets
Kode server ada di `apps-script/Code.gs` (proyek Apps Script "Sinkron Checker Tambang"). Isi `KODE_KIRIM` dan `KODE_BACA` di sana sebelum dipakai; jangan simpan kode asli di repo publik ini.
- **Aplikasi → Sheet**: laporan yang disimpan di aplikasi dikirim ke tab *Laporan Checker*, lalu otomatis ditulis ke *Input Harian*, *Log Produksi*, *Log Alat & BBM* dan *Log Tenaga Kerja* (blok tanggal itu diganti, jadi tidak dobel). Ubah/hapus laporan di aplikasi ikut mengubah/menghapus blok tanggal itu.
- **Sheet → Aplikasi**: saat HP admin membuka Rekap (atau tombol *Ambil dari spreadsheet*), setiap tanggal di *Input Harian* dicek. Jika angkanya berbeda dari laporan aplikasi atau tanggalnya belum ada, laporan dibuat ulang dari *Input Harian* (detail lapangan seperti lokasi/PIC tetap dipakai).
- Peta alat: Kobelco → *Sewa Alat* → Alat Berat 1; CAT → *Sewa Alat 2* → Alat Berat 2 (atur di `PETA_ALAT`).
- Setelah mengganti kode Apps Script: *Terapkan → Kelola penerapan → ✎ → Versi baru → Terapkan* (URL tetap).

## Kolom ekspor ke spreadsheet
Tanggal, Lokasi/Blok, PIC, Cuaca, Kondisi Area, Aktivitas, Jam <tiap alat>, Total Jam Alat, Volume (m3), Ritase, Progres (%), Solar/BBM, Solar (L), Upah, Sewa <tiap alat>, Sewa Alat, Makan & Minum, Transportasi, Lain-lain, Ket. Lain-lain, Total Pengeluaran, Qty/Harga/Penjualan <tiap produk>, Total Penjualan, Selisih, Kendala, Rencana Besok.

## Struktur
```
checker-tambang/
├── index.html
├── style.css
├── app.js               # semua logika
├── sw.js                # service worker (offline)
├── manifest.webmanifest
├── logo.png           # logo PT. Trass Multi Guna (layar masuk)
├── ikon-192.png / ikon-512.png  # ikon aplikasi di HP
└── favicon.png, apple-touch-icon.png
```
