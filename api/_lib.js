// Fungsi bersama untuk semua API (file berawalan "_" tidak menjadi endpoint di Vercel).
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

let _sql = null;
export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL belum diatur');
    _sql = neon(url);
  }
  return _sql;
}
// Untuk pengujian: ganti koneksi database
export function _setSql(fn) { _sql = fn; _skemaSiap = null; }

let _skemaSiap = null;
export function siapkanSkema() {
  if (!_skemaSiap) {
    const q = sql();
    _skemaSiap = (async () => {
      await q`CREATE TABLE IF NOT EXISTS pengguna (
        id text PRIMARY KEY, nama text NOT NULL UNIQUE, pin_hash text NOT NULL, garam text NOT NULL,
        peran text NOT NULL DEFAULT 'checker', gagal int NOT NULL DEFAULT 0, kunci_sampai timestamptz,
        dibuat timestamptz NOT NULL DEFAULT now())`;
      await q`CREATE TABLE IF NOT EXISTS sesi (
        token text PRIMARY KEY, pengguna_id text NOT NULL, kadaluarsa timestamptz NOT NULL)`;
      await q`CREATE TABLE IF NOT EXISTS laporan (
        id text PRIMARY KEY, tanggal text NOT NULL, data jsonb NOT NULL, oleh text, oleh_id text,
        diubah timestamptz NOT NULL DEFAULT now(), dihapus boolean NOT NULL DEFAULT false,
        sheet_ok boolean NOT NULL DEFAULT true)`;
      await q`CREATE INDEX IF NOT EXISTS laporan_diubah ON laporan (diubah)`;
      await q`CREATE TABLE IF NOT EXISTS pengaturan (kunci text PRIMARY KEY, nilai jsonb NOT NULL)`;
    })().catch((e) => { _skemaSiap = null; throw e; });
  }
  return _skemaSiap;
}

// ---------- HTTP ----------
const ASAL_BOLEH = ['https://rizkiromdoni17.github.io'];
export function cors(req, res) {
  const asal = req.headers.origin;
  if (asal && ASAL_BOLEH.includes(asal)) {
    res.setHeader('Access-Control-Allow-Origin', asal);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
export function balas(res, kode, obj) { res.status(kode).json(obj); }
export function bodyJson(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  return b;
}
// Bungkus handler: CORS, skema, dan penanganan error
export function api(fn) {
  return async (req, res) => {
    if (cors(req, res)) return;
    try {
      await siapkanSkema();
      await fn(req, res);
    } catch (e) {
      console.error(e);
      balas(res, e.status || 500, { ok: false, error: e.status ? e.message : 'Kesalahan server' });
    }
  };
}
export function galat(status, pesan) { const e = new Error(pesan); e.status = status; return e; }

// ---------- PIN & sesi ----------
export function hashPin(pin, garam) {
  return crypto.scryptSync(String(pin), garam, 32).toString('hex');
}
export function garamBaru() { return crypto.randomBytes(16).toString('hex'); }
export function tokenBaru() { return crypto.randomBytes(32).toString('hex'); }
export function idBaru(p) { return (p || 'x') + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
export function pinValid(pin) { return /^\d{4,6}$/.test(String(pin || '')); }

// Admin pertama dibuat dari env ADMIN_PIN_AWAL bila tabel pengguna masih kosong.
export async function pastikanAdminAwal() {
  const q = sql();
  const [{ jumlah }] = await q`SELECT count(*)::int AS jumlah FROM pengguna`;
  if (jumlah > 0) return;
  const pin = process.env.ADMIN_PIN_AWAL;
  if (!pinValid(pin)) throw galat(503, 'Server belum siap: ADMIN_PIN_AWAL (4–6 angka) belum diatur di Vercel');
  const garam = garamBaru();
  await q`INSERT INTO pengguna (id, nama, pin_hash, garam, peran) VALUES ('u1', 'Admin', ${hashPin(pin, garam)}, ${garam}, 'admin') ON CONFLICT DO NOTHING`;
}

export async function penggunaDariReq(req, wajib = true) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (token) {
    const q = sql();
    const r = await q`SELECT p.id, p.nama, p.peran FROM sesi s JOIN pengguna p ON p.id = s.pengguna_id
      WHERE s.token = ${token} AND s.kadaluarsa > now()`;
    if (r.length) return r[0];
  }
  if (wajib) throw galat(401, 'Sesi berakhir, silakan masuk lagi');
  return null;
}
export async function wajibAdmin(req) {
  const u = await penggunaDariReq(req);
  if (u.peran !== 'admin') throw galat(403, 'Hanya admin');
  return u;
}

// ---------- Google Sheets (Apps Script) ----------
export function sheetSiap() { return !!(process.env.SHEET_URL && process.env.SHEET_KODE_KIRIM); }
async function fetchJson(url, opsi, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 25000);
  try {
    const r = await fetch(url, { ...opsi, redirect: 'follow', signal: ac.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}
// Teruskan laporan yang belum masuk spreadsheet (sheet_ok = false) dan penghapusan.
export async function teruskanKeSheet(maks = 25) {
  if (!sheetSiap()) return { dilewati: true };
  const q = sql();
  const rows = await q`SELECT id, data, dihapus FROM laporan WHERE sheet_ok = false ORDER BY diubah LIMIT ${maks}`;
  if (!rows.length) return { terkirim: 0 };
  const muatan = { kode: process.env.SHEET_KODE_KIRIM, laporan: [], hapus: [] };
  rows.forEach((r) => {
    if (r.dihapus) muatan.hapus.push(r.id);
    else muatan.laporan.push({ id: r.id, baris: (r.data && r.data._baris) || {}, data: tanpaBaris(r.data) });
  });
  const j = await fetchJson(process.env.SHEET_URL, { method: 'POST', body: JSON.stringify(muatan) });
  if (!j || !j.ok) throw new Error('Spreadsheet menolak: ' + (j && j.error));
  const ok = [].concat(j.diterima || [], j.dihapus || []);
  if (ok.length) await q`UPDATE laporan SET sheet_ok = true WHERE id = ANY(${ok})`;
  return { terkirim: ok.length };
}
export function tanpaBaris(d) { if (!d) return d; const x = { ...d }; delete x._baris; return x; }

// Ambil semua laporan dari spreadsheet (Input Harian + Laporan Checker) lalu samakan database.
export async function tarikDariSheet() {
  if (!process.env.SHEET_URL || !process.env.SHEET_KODE_BACA) throw galat(503, 'SHEET_URL / SHEET_KODE_BACA belum diatur di Vercel');
  // Kirim dulu perubahan yang masih tertunda supaya tidak tertimpa
  try { await teruskanKeSheet(100); } catch (e) { throw galat(502, 'Gagal mengirim perubahan tertunda ke spreadsheet'); }
  const u = process.env.SHEET_URL + (process.env.SHEET_URL.includes('?') ? '&' : '?') + 'kode=' + encodeURIComponent(process.env.SHEET_KODE_BACA);
  const j = await fetchJson(u, { method: 'GET' }, 60000);
  if (!j || !j.ok) throw galat(502, 'Spreadsheet menolak: ' + (j && j.error));
  const q = sql();
  const ada = await q`SELECT id, data, dihapus, sheet_ok FROM laporan`;
  const peta = new Map(ada.map((r) => [r.id, r]));
  let baru = 0, ganti = 0, buang = 0;
  const diServer = new Set();
  for (const l of j.laporan || []) {
    if (!l || !l.id || !/^\d{4}-\d{2}-\d{2}$/.test(l.tanggal || '') || !Array.isArray(l.jual)) continue;
    diServer.add(l.id);
    const lama = peta.get(l.id);
    if (lama && !lama.sheet_ok) continue; // perubahan lokal belum terkirim: pertahankan
    const data = { ...l };
    if (lama && !lama.dihapus && JSON.stringify(tanpaBaris(lama.data)) === JSON.stringify(data)) continue;
    await q`INSERT INTO laporan (id, tanggal, data, oleh, oleh_id, diubah, dihapus, sheet_ok)
      VALUES (${l.id}, ${l.tanggal}, ${JSON.stringify(data)}::jsonb, ${l.oleh || null}, ${l.oleh_id || null}, now(), false, true)
      ON CONFLICT (id) DO UPDATE SET tanggal = EXCLUDED.tanggal, data = EXCLUDED.data, diubah = now(), dihapus = false, sheet_ok = true`;
    if (lama && !lama.dihapus) ganti++; else baru++;
  }
  if (j.lengkap) {
    for (const r of ada) {
      if (!r.dihapus && r.sheet_ok && !diServer.has(r.id)) {
        await q`UPDATE laporan SET dihapus = true, diubah = now() WHERE id = ${r.id}`;
        buang++;
      }
    }
  }
  await q`INSERT INTO pengaturan (kunci, nilai) VALUES ('terakhirTarikSheet', ${JSON.stringify(new Date().toISOString())}::jsonb)
    ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
  return { baru, ganti, buang };
}
