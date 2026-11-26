// POST /api/laporan {laporan:[{...data, _baris}], hapus:[id]} -> simpan ke database, lalu teruskan ke spreadsheet.
// Checker hanya boleh menyimpan/mengubah laporan miliknya sendiri; hapus hanya admin.
import { api, sql, balas, bodyJson, galat, penggunaDariReq, teruskanKeSheet } from './_lib.js';

const OK_TGL = /^\d{4}-\d{2}-\d{2}$/;
function valid(l) {
  return l && typeof l.id === 'string' && l.id.length <= 80 && OK_TGL.test(l.tanggal || '') &&
    Array.isArray(l.alat) && Array.isArray(l.jual) && Array.isArray(l.lain);
}

export default api(async (req, res) => {
  if (req.method !== 'POST') throw galat(405, 'Metode tidak didukung');
  const u = await penggunaDariReq(req);
  const admin = u.peran === 'admin';
  const b = bodyJson(req);
  const q = sql();
  const diterima = [], ditolak = [], dihapus = [];
  const daftar = Array.isArray(b.laporan) ? b.laporan.slice(0, 200) : [];
  for (const l of daftar) {
    if (!valid(l)) { ditolak.push(l && l.id); continue; }
    if (JSON.stringify(l).length > 200000) { ditolak.push(l.id); continue; }
    const lama = (await q`SELECT oleh, oleh_id, dihapus FROM laporan WHERE id = ${l.id}`)[0];
    const milikSendiri = lama && (lama.oleh_id === u.id || (!lama.oleh_id && lama.oleh === u.nama));
    if (lama && !admin && !milikSendiri) { ditolak.push(l.id); continue; }
    if (lama && lama.dihapus && !admin) { ditolak.push(l.id); continue; }
    // Laporan baru dari admin (mis. impor) tetap atas nama pembuat aslinya bila ada
    const asli = admin && !lama && l.oleh && l.oleh !== u.nama;
    const oleh = lama ? (lama.oleh || u.nama) : (asli ? l.oleh : u.nama);
    const olehId = lama ? (lama.oleh_id || (milikSendiri ? u.id : null)) : (asli ? (l.oleh_id || null) : u.id);
    const data = { ...l, oleh: oleh || l.oleh, oleh_id: olehId };
    await q`INSERT INTO laporan (id, tanggal, data, oleh, oleh_id, diubah, dihapus, sheet_ok)
      VALUES (${l.id}, ${l.tanggal}, ${JSON.stringify(data)}::jsonb, ${oleh}, ${olehId}, now(), false, false)
      ON CONFLICT (id) DO UPDATE SET tanggal = EXCLUDED.tanggal, data = EXCLUDED.data, oleh = EXCLUDED.oleh, oleh_id = EXCLUDED.oleh_id, diubah = now(), dihapus = false, sheet_ok = false`;
    diterima.push(l.id);
  }
  const hapus = Array.isArray(b.hapus) ? b.hapus.slice(0, 200) : [];
  if (hapus.length && !admin) throw galat(403, 'Hanya admin yang bisa menghapus laporan');
  for (const id of hapus) {
    await q`UPDATE laporan SET dihapus = true, diubah = now(), sheet_ok = false WHERE id = ${String(id)}`;
    dihapus.push(id);
  }
  let sheet = null;
  try { sheet = await teruskanKeSheet(50); } catch (e) { sheet = { gagal: true }; console.error('sheet', e.message); }
  return balas(res, 200, { ok: true, diterima, ditolak, dihapus, sheet });
});
