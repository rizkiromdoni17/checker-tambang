/**
 * Sinkron DUA ARAH Aplikasi Checker Tambang <-> Google Sheets (PT. Trass Multi Guna)
 *
 * Aplikasi -> Sheet : laporan yang dikirim aplikasi disimpan di tab "Laporan Checker"
 *                     DAN otomatis ditulis ke "Input Harian", "Log Produksi",
 *                     "Log Alat & BBM" dan "Log Tenaga Kerja" (blok tanggal itu diganti).
 * Sheet -> Aplikasi : saat HP admin mengambil data, setiap tanggal di "Input Harian"
 *                     dibandingkan dengan laporan aplikasi. Jika angkanya beda / tanggalnya
 *                     belum ada di aplikasi, laporan dibuat ulang dari Input Harian.
 *
 * Deploy sebagai Aplikasi Web: Jalankan sebagai "Saya", Akses "Siapa saja".
 * Setelah mengganti kode: Terapkan > Kelola penerapan > ✎ Edit > Versi: "Versi baru" > Terapkan
 * (URL tetap sama, tidak perlu diganti di aplikasi).
 *
 * KODE_KIRIM : dipasang di SEMUA HP (hanya bisa mengirim/menambah laporan).
 * KODE_BACA  : hanya untuk HP admin (bisa mengambil semua laporan). Jangan dibagikan ke checker.
 */
var KODE_KIRIM = 'ISI_KODE_KIRIM';
var KODE_BACA = 'ISI_KODE_BACA';
var NAMA_SHEET = 'Laporan Checker';
var ID_SPREADSHEET = '1Ak9PzA8rzaCW0Qd7legeUfN_Tk7IFoHjqMuHEwVtJ-Y';

// Alat di aplikasi -> item sewa di "Daftar Harga" -> unit di "Log Alat & BBM"
var PETA_ALAT = [
  { nama: 'Kobelco', item: 'Sewa Alat', unit: 'Alat Berat 1', jenis: 'Eksavator' },
  { nama: 'CAT', item: 'Sewa Alat 2', unit: 'Alat Berat 2', jenis: 'Eksavator' }
];
var ITEM_UPAH = ['Upah Operator 3', 'Upah Operator 2', 'Upah Operator 1']; // dicoba berurutan
var ITEM_MAKAN = ['Makan dan Minum 2', 'Makan dan Minum 1'];
var ITEM_SOLAR = 'Solar', ITEM_ROYALTI = 'Royalti', ITEM_TRANSPORT = 'Transportasi', ITEM_LAIN = 'Lain-lain';

var IH = 'Input Harian', IH_BARIS1 = 6;          // data Input Harian mulai baris 6
var LOG_PROD = 'Log Produksi', LOG_PROD_BARIS1 = 13;
var LOG_ALAT = 'Log Alat & BBM', LOG_ALAT_BARIS1 = 14;
var LOG_TK = 'Log Tenaga Kerja', LOG_TK_BARIS1 = 7;

// ================= Utilitas =================
var SS_ = null;
function ss_() { if (!SS_) SS_ = SpreadsheetApp.openById(ID_SPREADSHEET); return SS_; }
function num_(v) { return v === '' || v === null || v === undefined || isNaN(+v) ? 0 : +v; }
function kosong_(v) { return v === '' || v === null || v === undefined; }
function sama_(a, b) { return Math.abs(num_(a) - num_(b)) < 1; }
function serial_(iso) { var p = iso.split('-'); return (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000; }
function iso_(v) {
  if (kosong_(v)) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  if (typeof v === 'number') { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); }
  var s = String(v).trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function ribu_(x) { return String(Math.round(num_(x))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function balas_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function petaAlat_(nama) {
  var k = String(nama || '').trim().toLowerCase();
  for (var i = 0; i < PETA_ALAT.length; i++) if (PETA_ALAT[i].nama.toLowerCase() === k) return PETA_ALAT[i];
  return null;
}

// ================= Tab "Laporan Checker" =================
function sheet_() {
  var sh = ss_().getSheetByName(NAMA_SHEET);
  if (!sh) {
    sh = ss_().insertSheet(NAMA_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([['ID', 'Data (JSON)']]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#2f3252').setFontColor('#ffffff');
  }
  return sh;
}
function header_(sh) { var c = Math.max(sh.getLastColumn(), 1); return sh.getRange(1, 1, 1, c).getValues()[0].map(String); }
// Kolom "Data (JSON)" selalu paling kanan; kolom baru disisipkan sebelum kolom itu.
function pastikanKolom_(sh, header, keys) {
  keys.forEach(function (k) {
    if (header.indexOf(k) < 0) {
      var posJson = header.indexOf('Data (JSON)') + 1;
      sh.insertColumnBefore(posJson);
      sh.getRange(1, posJson).setValue(k).setFontWeight('bold').setBackground('#2f3252').setFontColor('#ffffff');
      header.splice(posJson - 1, 0, k);
    }
  });
  return header;
}
// Semua laporan JSON: [{baris, lap}]
function bacaChecker_(sh, header) {
  var cj = header.indexOf('Data (JSON)'), n = sh.getLastRow(), out = [];
  if (n < 2 || cj < 0) return out;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  var js = sh.getRange(2, cj + 1, n - 1, 1).getValues();
  for (var i = 0; i < js.length; i++) {
    try { var l = JSON.parse(js[i][0]); if (l && l.id) out.push({ baris: i + 2, lap: l }); } catch (x) {}
  }
  return out;
}
function tulisChecker_(sh, header, id, baris, data) {
  header = pastikanKolom_(sh, header, Object.keys(baris));
  var n = sh.getLastRow();
  var ids = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var idx = ids.indexOf(String(id));
  var row = header.map(function (h) {
    if (h === 'ID') return id;
    if (h === 'Data (JSON)') return JSON.stringify(data || {});
    var v = baris[h]; return v === undefined || v === null ? '' : v;
  });
  var r = idx >= 0 ? idx + 2 : n + 1;
  if (idx >= 0) { // pertahankan kolom tambahan buatan pengguna
    var lama = sh.getRange(r, 1, 1, header.length).getValues()[0];
    row = row.map(function (v, i) { var h = header[i]; return (h in baris || h === 'ID' || h === 'Data (JSON)') ? v : lama[i]; });
  }
  sh.getRange(r, 1, 1, header.length).setValues([row]);
  return header;
}
function hapusChecker_(sh, id) {
  var n = sh.getLastRow(); if (n < 2) return;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var idx = ids.indexOf(String(id));
  if (idx >= 0) sh.deleteRow(idx + 2);
}
function urutChecker_(sh, header) {
  var col = header.indexOf('Tanggal') + 1;
  if (col > 0 && sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).sort({ column: col, ascending: true });
}

// ================= Hitungan laporan (sama dengan aplikasi) =================
function hitung_(l) {
  var sewa = 0, jam = 0, lain = 0, jual = 0, qty = 0;
  (l.alat || []).forEach(function (a) { sewa += num_(a.sewa); jam += num_(a.jam); });
  (l.lain || []).forEach(function (x) { lain += num_(x.nominal); });
  (l.jual || []).forEach(function (j) { jual += num_(j.harga) * num_(j.qty); qty += num_(j.qty); });
  var keluar = num_(l.solar) + num_(l.upah) + sewa + num_(l.makan) + num_(l.transport) + lain;
  var royalti = Math.round(qty * num_(l.royaltiTarif));
  return { sewa: sewa, jamAlat: jam, lain: lain, keluar: keluar, jual: jual, qtyJual: qty, royalti: royalti, nett: jual - keluar - royalti };
}
function semuaAktivitas_(l) {
  var a = (l.aktivitas || []).slice();
  if (l.aktivitasLain) String(l.aktivitasLain).split(',').forEach(function (x) { x = x.trim(); if (x) a.push(x); });
  return a;
}
// Baris ringkas untuk kolom-kolom "Laporan Checker" (dipakai untuk laporan yang dibuat dari sheet)
function barisServer_(l) {
  var t = hitung_(l), b = {};
  b['Tanggal'] = l.tanggal; b['Lokasi/Blok'] = l.lokasi; b['PIC'] = l.pic; b['Cuaca'] = l.cuaca; b['Kondisi Area'] = l.kondisi;
  b['Aktivitas'] = semuaAktivitas_(l).join(', ');
  PETA_ALAT.forEach(function (p) { b['Jam ' + p.nama] = ''; b['Sewa ' + p.nama + ' (Rp)'] = ''; });
  (l.alat || []).forEach(function (a) {
    if (!a.nama) return;
    b['Jam ' + a.nama] = num_(b['Jam ' + a.nama]) + num_(a.jam);
    b['Sewa ' + a.nama + ' (Rp)'] = num_(b['Sewa ' + a.nama + ' (Rp)']) + num_(a.sewa);
  });
  b['Total Jam Alat'] = t.jamAlat; b['Volume (m3)'] = l.volume; b['Ritase (rit)'] = l.ritase; b['Progres (%)'] = l.progres;
  b['Solar/BBM (Rp)'] = num_(l.solar); b['Solar (L)'] = l.solarLiter; b['Upah (Rp)'] = num_(l.upah);
  b['Sewa Alat (Rp)'] = t.sewa; b['Makan & Minum (Rp)'] = num_(l.makan); b['Transportasi (Rp)'] = num_(l.transport);
  b['Lain-lain (Rp)'] = t.lain; b['Ket. Lain-lain'] = (l.lain || []).map(function (x) { return (x.ket || '-') + ' ' + ribu_(x.nominal); }).join('; ');
  b['Total Operasional (Rp)'] = t.keluar;
  (l.jual || []).forEach(function (j) {
    if (!j.nama) return;
    b['Qty ' + j.nama] = num_(b['Qty ' + j.nama]) + num_(j.qty);
    b['Penjualan ' + j.nama + ' (Rp)'] = num_(b['Penjualan ' + j.nama + ' (Rp)']) + num_(j.qty) * num_(j.harga);
  });
  b['Total Penjualan (Rp)'] = t.jual; b['Rit Terjual'] = t.qtyJual; b['Royalti (Rp)'] = t.royalti; b['Nett setelah Royalti (Rp)'] = t.nett;
  b['Kendala'] = l.kendala; b['Rencana Besok'] = l.rencana; b['Dibuat oleh'] = l.oleh || '';
  b['Diubah'] = Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  b['Terkirim'] = b['Diubah'];
  return b;
}

// ================= Daftar Harga & Input Harian =================
function daftarHarga_() {
  var sh = ss_().getSheetByName('Daftar Harga');
  var n = sh.getLastRow(), peta = {};
  if (n >= 6) sh.getRange(6, 2, n - 5, 3).getValues().forEach(function (r) {
    if (r[0] !== '') peta[String(r[0]).trim()] = { jenis: String(r[1]), harga: num_(r[2]) };
  });
  return peta;
}
function pastikanItem_(harga, nama, jenis, standar, satuan) {
  if (harga[nama]) return;
  var sh = ss_().getSheetByName('Daftar Harga');
  var vals = sh.getRange(6, 2, Math.max(sh.getLastRow() - 5, 1), 1).getValues();
  var r = 6; for (var i = 0; i < vals.length; i++) if (vals[i][0] !== '') r = 6 + i + 1;
  sh.getRange(r, 2, 1, 4).setValues([[nama, jenis, standar, satuan]]);
  harga[nama] = { jenis: jenis, harga: standar };
}
// Membaca Input Harian -> { blok: [{tgl, rows:[[A,B,C,D,H]]}], urutan asli }
function bacaIH_() {
  var sh = ss_().getSheetByName(IH);
  var maks = sh.getMaxRows() - IH_BARIS1 + 1;
  var abcd = sh.getRange(IH_BARIS1, 1, maks, 4).getValues();
  var hh = sh.getRange(IH_BARIS1, 8, maks, 1).getValues();
  var akhir = -1;
  for (var i = 0; i < abcd.length; i++) if (abcd[i][1] !== '' || abcd[i][0] !== '') akhir = i;
  var blok = [], cur = null;
  for (var j = 0; j <= akhir; j++) {
    var a = abcd[j][0];
    if (a !== '') { cur = { tgl: iso_(a), rows: [] }; blok.push(cur); }
    if (!cur) { cur = { tgl: '', rows: [] }; blok.push(cur); }
    cur.rows.push({ item: String(abcd[j][1]).trim(), qty: abcd[j][2], hk: abcd[j][3], cat: hh[j][0] });
  }
  // tanggal yang tercatat di dua blok terpisah digabung jadi satu blok
  var gabung = [], pertama = {};
  blok.forEach(function (b) {
    if (b.tgl && pertama[b.tgl]) { pertama[b.tgl].rows = pertama[b.tgl].rows.concat(b.rows); return; }
    if (b.tgl) pertama[b.tgl] = b;
    gabung.push(b);
  });
  return { sh: sh, blok: gabung, jumlahBaris: akhir + 1 };
}
function tulisIH_(ih) {
  var sh = ih.sh, abcd = [], hh = [], merge = [];
  ih.blok.forEach(function (b) {
    if (!b.rows.length) return;
    var mulai = abcd.length;
    b.rows.forEach(function (r, k) {
      abcd.push([k === 0 && b.tgl ? serial_(b.tgl) : '', r.item, kosong_(r.qty) ? '' : r.qty, kosong_(r.hk) ? '' : r.hk]);
      hh.push([kosong_(r.cat) ? '' : r.cat]);
    });
    if (b.rows.length > 1) merge.push([mulai, b.rows.length]);
  });
  var tinggi = Math.max(abcd.length, ih.jumlahBaris);
  while (abcd.length < tinggi) { abcd.push(['', '', '', '']); hh.push(['']); }
  sh.getRange(IH_BARIS1, 1, sh.getMaxRows() - IH_BARIS1 + 1, 1).breakApart();
  sh.getRange(IH_BARIS1, 1, tinggi, 4).setValues(abcd);
  sh.getRange(IH_BARIS1, 8, tinggi, 1).setValues(hh);
  sh.getRange(IH_BARIS1, 1, tinggi, 1).setNumberFormat('dd mmm yyyy').setVerticalAlignment('top');
  sh.getRange(IH_BARIS1, 3, tinggi, 1).setNumberFormat('#,##0.##');
  sh.getRange(IH_BARIS1, 4, tinggi, 1).setNumberFormat('"Rp"#,##0;-"Rp"#,##0;"-"');
  merge.forEach(function (m) { sh.getRange(IH_BARIS1 + m[0], 1, m[1], 1).merge(); });
}
function gantiBlokIH_(ih, tgl, rows) {
  ih.blok = ih.blok.filter(function (b) { return b.tgl !== tgl; });
  if (!rows.length) return;
  var baru = { tgl: tgl, rows: rows }, pos = ih.blok.length;
  for (var i = 0; i < ih.blok.length; i++) if (ih.blok[i].tgl && ih.blok[i].tgl > tgl) { pos = i; break; }
  ih.blok.splice(pos, 0, baru);
}

// Laporan aplikasi (1 atau lebih untuk tanggal yang sama) -> baris Input Harian
function barisIHdariLaporan_(laps, harga) {
  var rows = [], jamAlat = {}, sewaAlat = {}, upah = 0, solar = 0, liter = 0, makan = 0, transport = 0, lain = [], jual = [], qtyJual = 0, royalti = 0;
  var info = [];
  laps.forEach(function (l) {
    (l.alat || []).forEach(function (a) {
      if (!a.nama || (!num_(a.jam) && !num_(a.sewa))) return;
      var p = petaAlat_(a.nama);
      if (!p) { lain.push({ ket: 'Sewa ' + a.nama + (num_(a.jam) ? ' ' + num_(a.jam) + ' jam' : ''), nominal: num_(a.sewa) }); return; }
      jamAlat[p.nama] = num_(jamAlat[p.nama]) + num_(a.jam); sewaAlat[p.nama] = num_(sewaAlat[p.nama]) + num_(a.sewa);
    });
    upah += num_(l.upah); solar += num_(l.solar); liter += num_(l.solarLiter); makan += num_(l.makan); transport += num_(l.transport);
    (l.lain || []).forEach(function (x) { if (num_(x.nominal)) lain.push({ ket: x.ket || '', nominal: num_(x.nominal) }); });
    (l.jual || []).forEach(function (j) {
      if (!j.nama || !num_(j.qty)) return;
      var ada = jual.filter(function (x) { return x.nama === j.nama && sama_(x.harga, j.harga); })[0];
      if (ada) ada.qty += num_(j.qty); else jual.push({ nama: j.nama, harga: num_(j.harga), qty: num_(j.qty) });
      qtyJual += num_(j.qty);
    });
    royalti += hitung_(l).royalti;
    var ket = [];
    if (l.lokasi && l.lokasi !== '-') ket.push('lokasi ' + l.lokasi);
    if (l.pic && l.pic !== '-') ket.push('PIC ' + l.pic);
    if (ket.length) info.push(ket.join(', '));
  });
  var std = function (nama) { return harga[nama] ? harga[nama].harga : 0; };
  // pecah nominal ke item standar (qty bulat) atau pakai harga khusus
  var pecah = function (daftarItem, total, catatan, maksQty) {
    for (var i = 0; i < daftarItem.length; i++) {
      var h = std(daftarItem[i]);
      if (h > 0 && Math.abs(total / h - Math.round(total / h)) < 1e-9 && (!maksQty || Math.round(total / h) <= maksQty)) return { item: daftarItem[i], qty: Math.round(total / h), hk: '', cat: catatan };
    }
    return { item: daftarItem[0], qty: 1, hk: total, cat: catatan };
  };
  var perSatuan = function (item, qty, total, catatan) {
    var h = std(item);
    return { item: item, qty: qty, hk: Math.abs(total - qty * h) < 0.5 ? '' : total / qty, cat: catatan };
  };
  PETA_ALAT.forEach(function (p) {
    var jam = num_(jamAlat[p.nama]), sewa = num_(sewaAlat[p.nama]);
    if (!jam && !sewa) return;
    if (jam > 0) rows.push(perSatuan(p.item, jam, sewa, p.nama + ' ' + jam + ' jam'));
    else rows.push({ item: p.item, qty: 1, hk: sewa, cat: p.nama + ' (jam tidak diisi)' });
  });
  if (upah) rows.push(pecah(ITEM_UPAH, upah, 'Upah Rp' + ribu_(upah), 2)); // maks 2 operator (siang/malam)
  if (solar) {
    if (liter > 0) rows.push(perSatuan(ITEM_SOLAR, liter, solar, 'Solar Rp' + ribu_(solar)));
    else { var hs = std(ITEM_SOLAR); rows.push(hs > 0 && Math.abs(solar / hs - Math.round(solar / hs)) < 1e-9 ? { item: ITEM_SOLAR, qty: Math.round(solar / hs), hk: '', cat: 'Solar Rp' + ribu_(solar) + '; liter dihitung dari harga standar' } : { item: ITEM_SOLAR, qty: 1, hk: solar, cat: 'Solar Rp' + ribu_(solar) + '; liter belum ada data' }); }
  }
  if (makan) rows.push(pecah(ITEM_MAKAN, makan, ''));
  if (transport) { pastikanItem_(harga, ITEM_TRANSPORT, 'Pengeluaran', 0, 'kali'); rows.push({ item: ITEM_TRANSPORT, qty: 1, hk: transport, cat: '' }); }
  if (lain.length) pastikanItem_(harga, ITEM_LAIN, 'Pengeluaran', 0, 'kali');
  lain.forEach(function (x) { rows.push({ item: ITEM_LAIN, qty: 1, hk: x.nominal, cat: x.ket }); });
  if (qtyJual > 0) rows.push(perSatuan(ITEM_ROYALTI, qtyJual, royalti, qtyJual + ' rit terjual'));
  else if (royalti) rows.push({ item: ITEM_ROYALTI, qty: 1, hk: royalti, cat: '' });
  jual.forEach(function (j) {
    pastikanItem_(harga, j.nama, 'Pemasukan', j.harga, 'rit');
    rows.push(perSatuan(j.nama, j.qty, j.qty * j.harga, j.qty + ' rit terjual'));
  });
  if (rows.length) {
    var label = 'Dari aplikasi checker' + (info.length ? ' (' + info.join('; ') + ')' : '');
    rows[0].cat = rows[0].cat ? rows[0].cat + ' · ' + label : label;
  }
  return rows;
}

// Blok Input Harian -> ringkasan angka & laporan aplikasi
function nilaiBaris_(r, harga) {
  var h = harga[r.item] || { jenis: '', harga: 0 };
  var satuan = kosong_(r.hk) ? h.harga : num_(r.hk);
  return { jenis: h.jenis, harga: satuan, total: num_(r.qty) * satuan };
}
function ringkasIH_(rows, harga) {
  var s = { keluar: 0, jual: 0, royalti: 0, jam: 0, qty: 0 };
  rows.forEach(function (r) {
    if (!r.item) return;
    var v = nilaiBaris_(r, harga);
    if (v.jenis === 'Pemasukan') { s.jual += v.total; s.qty += num_(r.qty); }
    else if (r.item === ITEM_ROYALTI) s.royalti += v.total;
    else if (v.jenis === 'Pengeluaran') s.keluar += v.total;
    PETA_ALAT.forEach(function (p) { if (p.item === r.item) s.jam += num_(r.qty); });
  });
  return s;
}
function ringkasLap_(laps) {
  var s = { keluar: 0, jual: 0, royalti: 0, jam: 0, qty: 0 };
  laps.forEach(function (l) {
    var t = hitung_(l);
    s.keluar += t.keluar; s.jual += t.jual; s.royalti += t.royalti; s.qty += t.qtyJual;
    (l.alat || []).forEach(function (a) { if (petaAlat_(a.nama)) s.jam += num_(a.jam); });
  });
  return s;
}
function samaRingkas_(a, b) { return sama_(a.keluar, b.keluar) && sama_(a.jual, b.jual) && sama_(a.royalti, b.royalti) && sama_(a.qty, b.qty) && Math.abs(a.jam - b.jam) < 0.01; }

function laporanDariIH_(tgl, rows, harga, ref) {
  var alat = [], upah = 0, solar = 0, liter = 0, makan = 0, transport = 0, lain = [], jual = [], royalti = 0, royaltiStd = harga[ITEM_ROYALTI] ? harga[ITEM_ROYALTI].harga : 0;
  rows.forEach(function (r) {
    if (!r.item) return;
    var v = nilaiBaris_(r, harga);
    var p = PETA_ALAT.filter(function (x) { return x.item === r.item; })[0];
    if (p) {
      var ada = alat.filter(function (a) { return a.nama === p.nama; })[0];
      if (!ada) { ada = { nama: p.nama, jenis: p.jenis, jam: 0, tarif: 0, sewa: 0, manual: false }; alat.push(ada); }
      ada.jam += num_(r.qty); ada.sewa += v.total; ada.tarif = ada.jam ? ada.sewa / ada.jam : v.harga;
      ada.manual = Math.abs(v.harga - (harga[r.item] ? harga[r.item].harga : 0)) >= 0.5;
      return;
    }
    if (v.jenis === 'Pemasukan') { jual.push({ nama: r.item, harga: v.harga, qty: num_(r.qty), satuan: 'rit' }); return; }
    if (r.item === ITEM_ROYALTI) { royalti += v.total; return; }
    if (r.item.indexOf('Upah') === 0) { upah += v.total; return; }
    if (r.item === ITEM_SOLAR) { solar += v.total; liter += num_(r.qty); return; }
    if (r.item.indexOf('Makan') === 0) { makan += v.total; return; }
    if (r.item === ITEM_TRANSPORT) { transport += v.total; return; }
    if (v.total) lain.push({ ket: r.item === ITEM_LAIN ? String(r.cat || 'Lain-lain') : r.item + (r.cat ? ' - ' + r.cat : ''), nominal: v.total });
  });
  var qtyJual = jual.reduce(function (s, j) { return s + j.qty; }, 0);
  var tarif = royaltiStd;
  if (qtyJual > 0) tarif = royalti / qtyJual;
  else if (royalti) lain.push({ ket: 'Royalti', nominal: royalti });
  ref = ref || {};
  return {
    id: ref.id || 'SHEET-' + tgl, tanggal: tgl,
    lokasi: ref.lokasi || '-', pic: ref.pic || '-', cuaca: ref.cuaca || '', kondisi: ref.kondisi || '',
    aktivitas: ref.aktivitas || [], aktivitasLain: ref.aktivitasLain || '',
    alat: alat.map(function (a) { a.jam = Math.round(a.jam * 100) / 100; a.sewa = Math.round(a.sewa); a.tarif = Math.round(a.tarif * 100) / 100; return a; }),
    volume: ref.volume || '', ritase: qtyJual || ref.ritase || '', progres: ref.progres || '',
    solar: solar ? Math.round(solar) : '', solarLiter: liter || '', upah: upah ? Math.round(upah) : '', makan: makan ? Math.round(makan) : '', transport: transport ? Math.round(transport) : '',
    lain: lain, jual: jual, royaltiTarif: tarif,
    kendala: ref.kendala || '', rencana: ref.rencana || '',
    dibuat: ref.dibuat || new Date().toISOString(), oleh: ref.oleh || 'Spreadsheet',
    diubah: new Date().toISOString(), sumber: 'Input Harian (spreadsheet)'
  };
}

// ================= Log Produksi / Alat & BBM / Tenaga Kerja =================
// kolom = daftar nomor kolom input (bukan kolom rumus); baris baru = array nilai sesuai urutan kolom
function gantiLog_(nama, baris1, kolom, tgl, baru) {
  var sh = ss_().getSheetByName(nama); if (!sh) return;
  var maks = sh.getMaxRows() - baris1 + 1;
  var data = kolom.map(function (c) { return sh.getRange(baris1, c, maks, 1).getValues().map(function (r) { return r[0]; }); });
  var akhir = -1;
  for (var i = 0; i < maks; i++) if (data[0][i] !== '' || data[1][i] !== '') akhir = i;
  var semua = [];
  for (var j = 0; j <= akhir; j++) {
    var row = kolom.map(function (c, k) { return data[k][j]; });
    if (iso_(row[0]) === tgl) continue;
    semua.push(row);
  }
  baru.forEach(function (r) { semua.push(r); });
  semua.forEach(function (r, i) { r._i = i; r._t = iso_(r[0]) || '9999'; });
  semua.sort(function (a, b) { return a._t < b._t ? -1 : a._t > b._t ? 1 : a._i - b._i; });
  var tinggi = Math.max(semua.length, akhir + 1);
  kolom.forEach(function (c, k) {
    var v = [];
    for (var i = 0; i < tinggi; i++) {
      var x = i < semua.length ? semua[i][k] : '';
      if (k === 0 && x !== '') x = serial_(iso_(x));
      v.push([x === undefined || x === null ? '' : x]);
    }
    sh.getRange(baris1, c, tinggi, 1).setValues(v);
  });
}
function perbaruiLog_(tgl, laps, rowsIH, harga) {
  var s = serial_(tgl);
  // Log Produksi: B Tanggal, C Jenis, D Shift, E Produksi, J Keterangan (ritase = rit terjual)
  var prod = {};
  laps.forEach(function (l) { (l.jual || []).forEach(function (j) { if (j.nama && num_(j.qty)) prod[j.nama] = num_(prod[j.nama]) + num_(j.qty); }); });
  gantiLog_(LOG_PROD, LOG_PROD_BARIS1, [2, 3, 4, 5, 10], tgl, Object.keys(prod).map(function (k) { return [s, k, '', prod[k], 'Dari aplikasi checker: ' + prod[k] + ' rit']; }));
  // Log Alat & BBM: B Tanggal, C Unit, D HM awal, E HM akhir, G Solar (L), I Status, J Keterangan
  var jam = {};
  laps.forEach(function (l) { (l.alat || []).forEach(function (a) { var p = petaAlat_(a.nama); if (p && num_(a.jam)) jam[p.unit] = { p: p, jam: num_(jam[p.unit] && jam[p.unit].jam) + num_(a.jam) }; }); });
  gantiLog_(LOG_ALAT, LOG_ALAT_BARIS1, [2, 3, 4, 5, 7, 9, 10], tgl, PETA_ALAT.filter(function (p) { return jam[p.unit]; }).map(function (p) {
    return [s, p.unit, '', '', '', 'Operasi', p.nama + ' ' + jam[p.unit].jam + ' jam (aplikasi checker)'];
  }));
  // Log Tenaga Kerja: B Tanggal, C Shift, D Bagian, E Jumlah, F Hadir, G-K kosong, L Keterangan
  var upahRow = rowsIH.filter(function (r) { return r.item.indexOf('Upah') === 0; })[0];
  var tk = [];
  if (upahRow) {
    var nOrg = kosong_(upahRow.hk) ? num_(upahRow.qty) : '';
    var upah = laps.reduce(function (a, l) { return a + num_(l.upah); }, 0);
    tk.push([s, '', nOrg ? 'Operator (' + upahRow.item + ')' : 'Operator', nOrg, nOrg, '', '', '', '', '', 'Upah Rp' + ribu_(upah) + (nOrg ? '' : '; jumlah operator belum ada data')]);
  }
  gantiLog_(LOG_TK, LOG_TK_BARIS1, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], tgl, tk);
}

// Tulis ulang Input Harian + Log untuk satu tanggal dari semua laporan aplikasi tanggal itu
function sinkronTanggalKeSheet_(tgl, laps, ih, harga) {
  var rows = laps.length ? barisIHdariLaporan_(laps, harga) : [];
  gantiBlokIH_(ih, tgl, rows);
  perbaruiLog_(tgl, laps, rows, harga);
}

// ================= Web App =================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    if (req.kode !== KODE_KIRIM && req.kode !== KODE_BACA) return balas_({ ok: false, error: 'kode salah' });
    lock.waitLock(25000);
    var sh = sheet_(), header = header_(sh);
    var lama = {}; bacaChecker_(sh, header).forEach(function (x) { lama[x.lap.id] = x.lap.tanggal; });
    var diterima = [], dihapus = [], tglTerdampak = {};

    (req.laporan || []).forEach(function (item) {
      if (!item || !item.id || !item.baris) return;
      if (lama[item.id]) tglTerdampak[lama[item.id]] = 1;
      if (item.data && item.data.tanggal) tglTerdampak[item.data.tanggal] = 1;
      header = tulisChecker_(sh, header, item.id, item.baris, item.data);
      diterima.push(item.id);
    });
    (req.hapus || []).forEach(function (id) {
      if (lama[id]) tglTerdampak[lama[id]] = 1;
      hapusChecker_(sh, id);
      dihapus.push(id);
    });
    urutChecker_(sh, header);

    // Teruskan ke Input Harian & Log
    var tgls = Object.keys(tglTerdampak).filter(Boolean);
    if (tgls.length) {
      var semua = bacaChecker_(sh, header), harga = daftarHarga_(), ih = bacaIH_();
      tgls.forEach(function (t) {
        sinkronTanggalKeSheet_(t, semua.filter(function (x) { return x.lap.tanggal === t; }).map(function (x) { return x.lap; }), ih, harga);
      });
      tulisIH_(ih);
    }
    return balas_({ ok: true, diterima: diterima, dihapus: dihapus });
  } catch (err) {
    return balas_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.aksi === 'tes') {
    if (p.kode === KODE_KIRIM || p.kode === KODE_BACA) return balas_({ ok: true, baca: p.kode === KODE_BACA });
    return balas_({ ok: false, error: 'kode salah' });
  }
  if (p.kode !== KODE_BACA) return balas_({ ok: false, error: 'kode baca salah' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    return balas_({ ok: true, lengkap: true, laporan: kumpulkanLaporan_() });
  } catch (err) {
    return balas_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Gabungkan Input Harian (angka resmi) dengan laporan aplikasi (detail lapangan)
function kumpulkanLaporan_() {
  var sh = sheet_(), header = header_(sh), harga = daftarHarga_(), ih = bacaIH_();
  var checker = bacaChecker_(sh, header);
  var perTgl = {};
  checker.forEach(function (x) { (perTgl[x.lap.tanggal] = perTgl[x.lap.tanggal] || []).push(x.lap); });
  var hasil = [], ihBerubah = false, tglIH = {};

  ih.blok.forEach(function (b) {
    if (!b.tgl) return;
    tglIH[b.tgl] = 1;
    var r = ringkasIH_(b.rows, harga);
    var laps = perTgl[b.tgl] || [];
    var kosongIH = !r.keluar && !r.jual && !r.royalti;
    if (kosongIH && !laps.length) return;              // hari tanpa transaksi (mis. libur)
    if (laps.length && samaRingkas_(r, ringkasLap_(laps))) { hasil = hasil.concat(laps); return; }
    // Angka di Input Harian berbeda / belum ada di aplikasi -> buat laporan dari Input Harian
    var ref = laps.length === 1 ? laps[0] : (laps.length ? { id: 'SHEET-' + b.tgl, lokasi: laps[0].lokasi, pic: laps[0].pic } : null);
    var l = laporanDariIH_(b.tgl, b.rows, harga, ref);
    laps.forEach(function (x) { if (x.id !== l.id) hapusChecker_(sh, x.id); });
    header = tulisChecker_(sh, header, l.id, barisServer_(l), l);
    hasil.push(l);
  });

  // Laporan aplikasi yang tanggalnya belum ada di Input Harian -> tulis ke Input Harian
  Object.keys(perTgl).forEach(function (t) {
    if (tglIH[t]) return;
    sinkronTanggalKeSheet_(t, perTgl[t], ih, harga); ihBerubah = true;
    hasil = hasil.concat(perTgl[t]);
  });
  if (ihBerubah) tulisIH_(ih);
  urutChecker_(sh, header);
  return hasil;
}
