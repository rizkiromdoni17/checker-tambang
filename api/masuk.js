// GET  /api/masuk  -> daftar nama pengguna untuk layar masuk
// POST /api/masuk  {id, pin} -> {token, pengguna}
// POST /api/masuk  {keluar: true} (dengan Authorization) -> hapus sesi
import { api, sql, balas, bodyJson, galat, hashPin, tokenBaru, pastikanAdminAwal, tarikDariSheet } from './_lib.js';

export default api(async (req, res) => {
  const q = sql();
  await pastikanAdminAwal();
  if (req.method === 'GET') {
    // Database baru: isi sekali dari spreadsheet supaya data lama langsung tersedia
    const [{ n }] = await q`SELECT count(*)::int AS n FROM laporan`;
    const sudah = await q`SELECT 1 FROM pengaturan WHERE kunci = 'terakhirTarikSheet'`;
    if (!n && !sudah.length && process.env.SHEET_KODE_BACA) {
      try { await tarikDariSheet(); } catch (e) { console.error('isi awal', e.message); }
    }
    const daftar = await q`SELECT id, nama, peran FROM pengguna ORDER BY (peran = 'admin') DESC, nama`;
    return balas(res, 200, { ok: true, pengguna: daftar });
  }
  if (req.method !== 'POST') throw galat(405, 'Metode tidak didukung');
  const b = bodyJson(req);
  if (b.keluar) {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) await q`DELETE FROM sesi WHERE token = ${h.slice(7)}`;
    return balas(res, 200, { ok: true });
  }
  const r = await q`SELECT * FROM pengguna WHERE id = ${String(b.id || '')}`;
  if (!r.length) throw galat(404, 'Pengguna tidak ditemukan');
  const u = r[0];
  if (u.kunci_sampai && new Date(u.kunci_sampai) > new Date()) {
    const menit = Math.ceil((new Date(u.kunci_sampai) - new Date()) / 60000);
    throw galat(429, 'Terlalu banyak PIN salah. Coba lagi ' + menit + ' menit lagi');
  }
  if (hashPin(String(b.pin || ''), u.garam) !== u.pin_hash) {
    const gagal = u.gagal + 1;
    if (gagal >= 5) await q`UPDATE pengguna SET gagal = 0, kunci_sampai = now() + interval '5 minutes' WHERE id = ${u.id}`;
    else await q`UPDATE pengguna SET gagal = ${gagal} WHERE id = ${u.id}`;
    throw galat(401, 'PIN salah');
  }
  await q`UPDATE pengguna SET gagal = 0, kunci_sampai = null WHERE id = ${u.id}`;
  const token = tokenBaru();
  await q`INSERT INTO sesi (token, pengguna_id, kadaluarsa) VALUES (${token}, ${u.id}, now() + interval '120 days')`;
  await q`DELETE FROM sesi WHERE kadaluarsa < now()`;
  return balas(res, 200, { ok: true, token, pengguna: { id: u.id, nama: u.nama, peran: u.peran } });
});
