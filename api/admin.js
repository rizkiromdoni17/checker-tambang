// POST /api/admin {aksi, ...} — khusus admin
//  aksi: 'pengaturan'    {nilai: {kunci: nilai, ...}}
//        'tambahPengguna' {nama, pin, peran}
//        'gantiPin'       {id, pin}
//        'hapusPengguna'  {id}
//        'tarikSheet'     -> samakan database dengan spreadsheet
//        'kirimSheet'     -> kirim ulang laporan yang tertunda ke spreadsheet
import { api, sql, balas, bodyJson, galat, wajibAdmin, hashPin, garamBaru, idBaru, pinValid, tarikDariSheet, teruskanKeSheet } from './_lib.js';

const KUNCI_PENGATURAN = ['profil', 'alat', 'produk', 'aktivitas', 'cuaca', 'royalti', 'kuotaRit'];

export default api(async (req, res) => {
  if (req.method !== 'POST') throw galat(405, 'Metode tidak didukung');
  const admin = await wajibAdmin(req);
  const b = bodyJson(req);
  const q = sql();
  switch (b.aksi) {
    case 'pengaturan': {
      const nilai = b.nilai || {};
      for (const k of Object.keys(nilai)) {
        if (!KUNCI_PENGATURAN.includes(k)) continue;
        await q`INSERT INTO pengaturan (kunci, nilai) VALUES (${k}, ${JSON.stringify(nilai[k])}::jsonb)
          ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
      }
      return balas(res, 200, { ok: true });
    }
    case 'tambahPengguna': {
      const nama = String(b.nama || '').trim().slice(0, 40);
      if (!nama) throw galat(400, 'Isi nama');
      if (!pinValid(b.pin)) throw galat(400, 'PIN harus 4–6 angka');
      const peran = b.peran === 'admin' ? 'admin' : 'checker';
      const garam = garamBaru();
      const ada = await q`SELECT 1 FROM pengguna WHERE lower(nama) = lower(${nama})`;
      if (ada.length) throw galat(409, 'Nama sudah dipakai');
      await q`INSERT INTO pengguna (id, nama, pin_hash, garam, peran) VALUES (${idBaru('u')}, ${nama}, ${hashPin(b.pin, garam)}, ${garam}, ${peran})`;
      return balas(res, 200, { ok: true });
    }
    case 'gantiPin': {
      if (!pinValid(b.pin)) throw galat(400, 'PIN harus 4–6 angka');
      const garam = garamBaru();
      const r = await q`UPDATE pengguna SET pin_hash = ${hashPin(b.pin, garam)}, garam = ${garam}, gagal = 0, kunci_sampai = null WHERE id = ${String(b.id)} RETURNING id`;
      if (!r.length) throw galat(404, 'Pengguna tidak ditemukan');
      await q`DELETE FROM sesi WHERE pengguna_id = ${String(b.id)} AND pengguna_id <> ${admin.id}`;
      return balas(res, 200, { ok: true });
    }
    case 'hapusPengguna': {
      const id = String(b.id || '');
      if (id === admin.id) throw galat(400, 'Tidak bisa menghapus akun sendiri');
      const t = (await q`SELECT peran FROM pengguna WHERE id = ${id}`)[0];
      if (!t) throw galat(404, 'Pengguna tidak ditemukan');
      if (t.peran === 'admin') {
        const [{ n }] = await q`SELECT count(*)::int AS n FROM pengguna WHERE peran = 'admin'`;
        if (n <= 1) throw galat(400, 'Minimal harus ada satu admin');
      }
      await q`DELETE FROM sesi WHERE pengguna_id = ${id}`;
      await q`DELETE FROM pengguna WHERE id = ${id}`;
      return balas(res, 200, { ok: true });
    }
    case 'tarikSheet': {
      const hasil = await tarikDariSheet();
      return balas(res, 200, { ok: true, ...hasil });
    }
    case 'kirimSheet': {
      let hasil;
      try { hasil = await teruskanKeSheet(100); } catch (e) { throw galat(502, 'Gagal mengirim ke spreadsheet: ' + e.message); }
      return balas(res, 200, { ok: true, ...hasil });
    }
    default: throw galat(400, 'Aksi tidak dikenal');
  }
});
