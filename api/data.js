// GET /api/data?sejak=<ISO> -> laporan yang berubah sejak waktu itu, pengaturan, (admin: daftar pengguna)
// Checker hanya menerima laporan buatannya sendiri.
import { api, sql, balas, galat, penggunaDariReq, tanpaBaris } from './_lib.js';

export default api(async (req, res) => {
  if (req.method !== 'GET') throw galat(405, 'Metode tidak didukung');
  const u = await penggunaDariReq(req);
  const q = sql();
  const waktu = (await q`SELECT now() AS w`)[0].w;
  let sejak = req.query && req.query.sejak ? new Date(String(req.query.sejak)) : null;
  if (sejak && isNaN(sejak)) sejak = null;
  const admin = u.peran === 'admin';
  let rows;
  if (admin) rows = sejak ? await q`SELECT id, data, dihapus, oleh, oleh_id, diubah FROM laporan WHERE diubah > ${sejak}` : await q`SELECT id, data, dihapus, oleh, oleh_id, diubah FROM laporan WHERE dihapus = false`;
  else rows = sejak ? await q`SELECT id, data, dihapus, oleh, oleh_id, diubah FROM laporan WHERE diubah > ${sejak} AND (oleh_id = ${u.id} OR (oleh_id IS NULL AND oleh = ${u.nama}))` : await q`SELECT id, data, dihapus, oleh, oleh_id, diubah FROM laporan WHERE dihapus = false AND (oleh_id = ${u.id} OR (oleh_id IS NULL AND oleh = ${u.nama}))`;
  const pengaturan = {};
  (await q`SELECT kunci, nilai FROM pengaturan`).forEach((r) => { pengaturan[r.kunci] = r.nilai; });
  const out = {
    ok: true, waktu, lengkap: !sejak, pengguna: { id: u.id, nama: u.nama, peran: u.peran },
    laporan: rows.filter((r) => !r.dihapus).map((r) => ({ ...tanpaBaris(r.data), id: r.id, oleh: r.oleh || r.data.oleh, oleh_id: r.oleh_id })),
    hapus: rows.filter((r) => r.dihapus).map((r) => r.id),
    pengaturan
  };
  if (admin) {
    out.daftarPengguna = await q`SELECT id, nama, peran FROM pengguna ORDER BY (peran = 'admin') DESC, nama`;
    out.tertundaSheet = (await q`SELECT count(*)::int AS n FROM laporan WHERE sheet_ok = false`)[0].n;
  }
  return balas(res, 200, out);
});
