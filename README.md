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
