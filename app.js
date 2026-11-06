/* Checker Tambang — laporan progres harian tambang pasir, offline.
   Pola dasar (PWA + localStorage + PIN) mengikuti Kasir UMKM (Lisensi MIT). */
(function () {
  'use strict';

  // ================= Penyimpanan =================
  var KUNCI = 'checker-tambang-v1';
  var KUNCI_DRAF = 'checker-tambang-draf';

  function dataAwal() {
    return {
      profil: { nama: 'PT. Trass Multi Guna', lokasi: ['iqbal'] },
      pengguna: [
        { id: 'u1', nama: 'Admin', pin: '1234', peran: 'admin' },
        { id: 'u2', nama: 'Iqbal', pin: '1111', peran: 'checker' }
      ],
      // tarif/jam diturunkan dari contoh laporan: Kobelco 2.040.000/12 jam, CAT 1.280.000/8 jam
      alat: [
        { id: 'a1', nama: 'Kobelco', jenis: 'Eksavator', tarif: 170000 },
        { id: 'a2', nama: 'CAT', jenis: 'Eksavator', tarif: 160000 }
      ],
      produk: [
        { id: 'p1', nama: 'Pasir Ayak', harga: 1200000, satuan: 'rit' },
        { id: 'p2', nama: 'Pasir Bahan', harga: 750000, satuan: 'rit' }
      ],
      aktivitas: ['Pengayakan', 'Pengupasan', 'Penggalian', 'Pemuatan', 'Perataan', 'Perawatan alat'],
      cuaca: ['Cerah', 'Panas', 'Berawan', 'Mendung', 'Gerimis', 'Hujan', 'Hujan deras'],
      laporan: []
    };
  }

  var D;
  function muat() {
    try { D = JSON.parse(localStorage.getItem(KUNCI)); } catch (e) { D = null; }
    if (!D || !Array.isArray(D.laporan)) { D = dataAwal(); simpan(); }
  }
  function simpan() {
    try { localStorage.setItem(KUNCI, JSON.stringify(D)); return true; }
    catch (e) { toast('Gagal menyimpan: memori penuh'); return false; }
  }

  // ================= Utilitas =================
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function dua(n) { return (n < 10 ? '0' : '') + n; }
  function hariIni() { var d = new Date(); return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()); }
  function bulanIni() { return hariIni().slice(0, 7); }
  function n(v) { return v === '' || v == null || isNaN(+v) ? 0 : +v; }
  function kosong(v) { return v === '' || v == null; }
  function ribu(x) { return Math.round(n(x)).toLocaleString('id-ID'); }
  function rp(x) { return 'Rp ' + ribu(x); }
  function desimal(x) { return (+n(x).toFixed(2)).toLocaleString('id-ID'); }
  function parseUang(s) { var d = String(s).replace(/[^\d]/g, ''); return d === '' ? '' : +d; }
  function parseDesimal(s) { s = String(s).replace(/\s/g, '').replace(',', '.'); if (s === '') return ''; var v = parseFloat(s); return isNaN(v) ? '' : v; }
  function nilaiUang(v) { return kosong(v) ? '' : ribu(v); }
  function nilaiDes(v) { return kosong(v) ? '' : String(v).replace('.', ','); }
  function fmtTgl(iso) { var p = iso.split('-'); return (+p[2]) + '-' + (+p[1]) + '-' + p[0]; }
  function fmtTglPanjang(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtBulan(ym) { var p = ym.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); }
  function salinObj(o) { return JSON.parse(JSON.stringify(o)); }
  function gabungKata(arr) { arr = arr.filter(Boolean); if (arr.length <= 1) return arr.join(''); return arr.slice(0, -1).join(', ') + ' dan ' + arr[arr.length - 1]; }
  var tTimer;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('tampil'); clearTimeout(tTimer); tTimer = setTimeout(function () { t.classList.remove('tampil'); }, 2400); }
  function unduh(nama, isi, tipe) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: tipe }));
    a.download = nama; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function salinTeks(teks) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(teks).then(function () { return true; }, function () { return salinLama(teks); });
    }
    return Promise.resolve(salinLama(teks));
  }
  function salinLama(teks) {
    var ta = document.createElement('textarea'); ta.value = teks; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  }

  // ================= Dialog =================
  function bukaDialog(html, pasang) {
    var dlg = $('#dlg'); $('#dlgIsi').innerHTML = html;
    $$('[data-tutup]', dlg).forEach(function (b) { b.onclick = function () { dlg.close(); }; });
    if (pasang) pasang(dlg);
    if (!dlg.open) dlg.showModal();
  }

  // ================= Sesi =================
  var pengguna = null, pinBuffer = '', dipilih = null;
  function isAdmin() { return pengguna && pengguna.peran === 'admin'; }

  function tampilMasuk() {
    $('#aplikasi').hidden = true; $('#layarMasuk').hidden = false;
    dipilih = dipilih && D.pengguna.find(function (u) { return u.id === dipilih.id; }) || D.pengguna[0];
    pinBuffer = '';
    $('#daftarPengguna').innerHTML = D.pengguna.map(function (u) { return '<button type="button" data-id="' + u.id + '">' + esc(u.nama) + '</button>'; }).join('');
    $$('#daftarPengguna button').forEach(function (b) {
      b.classList.toggle('aktif', b.dataset.id === dipilih.id);
      b.onclick = function () {
        dipilih = D.pengguna.find(function (u) { return u.id === b.dataset.id; }); pinBuffer = ''; titik();
        $$('#daftarPengguna button').forEach(function (x) { x.classList.toggle('aktif', x === b); });
      };
    });
    titik();
  }
  function titik() { $$('#pinTitik i').forEach(function (i, k) { i.classList.toggle('isi', k < pinBuffer.length); }); }
  function ketikPin(k) {
    if (k === 'hapus') pinBuffer = pinBuffer.slice(0, -1);
    else if (pinBuffer.length < 4) pinBuffer += k;
    titik();
    if (pinBuffer.length === 4) {
      if (dipilih && dipilih.pin === pinBuffer) masuk(dipilih);
      else { var t = $('#pinTitik'); t.classList.add('salah'); setTimeout(function () { t.classList.remove('salah'); pinBuffer = ''; titik(); }, 350); }
    }
  }
  function masuk(u) {
    pengguna = u; try { sessionStorage.setItem('checker-sesi', u.id); } catch (e) {}
    $('#layarMasuk').hidden = true; $('#aplikasi').hidden = false;
    $('#namaPengguna').textContent = u.nama + (u.peran === 'admin' ? ' · admin' : '');
    $('#namaUsaha').textContent = D.profil.nama;
    $('[data-hal="atur"]').hidden = !isAdmin();
    isiDatalist();
    muatDraf();
    buka('input');
  }
  function keluar() {
    pengguna = null; try { sessionStorage.removeItem('checker-sesi'); } catch (e) {}
    tampilMasuk();
  }

  // ================= Navigasi =================
  var halAktif = 'input';
  function buka(hal) {
    if (hal === 'atur' && !isAdmin()) return;
    halAktif = hal;
    $$('.hal').forEach(function (s) { s.classList.toggle('aktif', s.id === 'hal-' + hal); });
    $$('.nav').forEach(function (b) { b.classList.toggle('aktif', b.dataset.hal === hal); });
    ({ input: renderForm, riwayat: renderRiwayat, rekap: renderRekap, atur: renderAtur })[hal]();
    window.scrollTo(0, 0);
  }

  function isiDatalist() {
    var opsi = function (arr) { return arr.map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); };
    var lokasi = D.profil.lokasi.slice();
    D.laporan.forEach(function (l) { if (l.lokasi && lokasi.indexOf(l.lokasi) < 0) lokasi.push(l.lokasi); });
    $('#dlLokasi').innerHTML = opsi(lokasi);
    $('#dlAlat').innerHTML = opsi(D.alat.map(function (a) { return a.nama; }));
    $('#dlProduk').innerHTML = opsi(D.produk.map(function (p) { return p.nama; }));
  }

  // ================= Model laporan =================
  function laporanBaru() {
    return {
      id: null, tanggal: hariIni(), lokasi: D.profil.lokasi[0] || '', pic: pengguna ? pengguna.nama : '',
      cuaca: '', kondisi: '', aktivitas: [], aktivitasLain: '',
      alat: D.alat.map(function (a) { return { nama: a.nama, jenis: a.jenis || '', jam: '', tarif: a.tarif, sewa: '', manual: false }; }),
      volume: '', ritase: '', progres: '',
      solar: '', solarLiter: '', upah: '', makan: '', transport: '',
      lain: [{ ket: '', nominal: '' }],
      jual: D.produk.map(function (p) { return { nama: p.nama, harga: p.harga, qty: '', satuan: p.satuan || 'rit' }; }),
      kendala: '', rencana: ''
    };
  }

  function hitung(L) {
    var sewa = 0, jam = 0, lain = 0, jual = 0, qty = 0;
    L.alat.forEach(function (a) { sewa += n(a.sewa); jam += n(a.jam); });
    L.lain.forEach(function (x) { lain += n(x.nominal); });
    L.jual.forEach(function (j) { jual += n(j.harga) * n(j.qty); qty += n(j.qty); });
    var keluar = n(L.solar) + n(L.upah) + sewa + n(L.makan) + n(L.transport) + lain;
    return { sewa: sewa, jamAlat: jam, lain: lain, keluar: keluar, jual: jual, qtyJual: qty, selisih: jual - keluar };
  }

  function alatTerpakai(L) { return L.alat.filter(function (a) { return a.nama && (n(a.jam) > 0 || n(a.sewa) > 0); }); }
  function semuaAktivitas(L) {
    var a = L.aktivitas.slice();
    if (L.aktivitasLain) L.aktivitasLain.split(',').forEach(function (x) { x = x.trim(); if (x) a.push(x); });
    return a;
  }

  // ================= Teks WhatsApp =================
  function teksWA(L) {
    var t = hitung(L);
    var kos = '___';
    var alat = alatTerpakai(L);
    var jenis = [];
    alat.forEach(function (a) { var j = (a.jenis || '').toLowerCase(); if (j && jenis.indexOf(j) < 0) jenis.push(j); });
    var lain = L.lain.filter(function (x) { return x.ket || n(x.nominal); });
    var huruf = 'abcdefghijklmnopqrstuvwxyz';
    var jual = L.jual.filter(function (j) { return j.nama; });

    var s = [];
    s.push('*⛏️ LAPORAN PROGRES HARIAN*', '');
    s.push('📅 Tanggal: ' + fmtTgl(L.tanggal));
    s.push('📍 Lokasi/Blok: ' + (L.lokasi || kos), '');
    s.push('_1. Kondisi Hari Ini_', '');
    s.push('* Cuaca: ' + (L.cuaca ? L.cuaca.toLowerCase() : kos));
    s.push('* Kondisi area: ' + (L.kondisi || kos), '');
    s.push('_2. Pekerjaan_', '');
    s.push('* Aktivitas: ' + (gabungKata(semuaAktivitas(L).map(function (x) { return x.toLowerCase(); })) || kos));
    s.push('* Jam kerja: ' + (alat.length ? alat.map(function (a) { return a.nama + ' ' + desimal(a.jam) + ' jam'; }).join(', ') : kos));
    s.push('* Alat yang digunakan: ' + (alat.length ? (jenis.length ? jenis.join(', ') + ' (' : '') + alat.map(function (a) { return a.nama; }).join(', ') + (jenis.length ? ')' : '') : kos), '');
    s.push('_3. Hasil/Progres_', '');
    s.push('* Volume pasir: ± ' + (kosong(L.volume) ? kos : desimal(L.volume)) + ' m³');
    s.push('* Ritase: ' + (kosong(L.ritase) ? kos : desimal(L.ritase)) + ' rit');
    s.push('* Progres hari ini: ' + (kosong(L.progres) ? kos : desimal(L.progres)) + '%', '');
    s.push('_4. Pengeluaran Harian_', '');
    var uang = function (v) { return kosong(v) ? 'Rp ' + kos : rp(v); };
    s.push('* Solar/BBM: ' + uang(L.solar) + (kosong(L.solarLiter) ? '' : ' (' + desimal(L.solarLiter) + ' liter)'));
    s.push('* Upah operator/tenaga kerja: ' + uang(L.upah));
    s.push('* Sewa alat: ' + (alat.filter(function (a) { return n(a.sewa); }).length ? alat.filter(function (a) { return n(a.sewa); }).map(function (a) { return a.nama + ' ' + rp(a.sewa); }).join(', ') : 'Rp ' + kos));
    s.push('* Makan dan minum: ' + uang(L.makan));
    s.push('* Transportasi: ' + uang(L.transport));
    s.push('* Lain-lain: ' + (lain.length ? lain.map(function (x) { return (x.ket ? x.ket + ' ' : '') + rp(x.nominal); }).join(', ') : 'Rp ' + kos), '');
    s.push('Total pengeluaran: ' + rp(t.keluar), '');
    s.push('Penjualan :', '');
    jual.forEach(function (j, i) {
      var sat = j.satuan || 'rit';
      s.push(huruf[i] + '. ' + j.nama + ' (harga/kuantiti) = ' + ribu(j.harga) + '/' + desimal(j.qty) + ' ' + sat + ' = ' + ribu(n(j.harga) * n(j.qty)));
    });
    s.push('', 'Total penjualan: ' + rp(t.jual));
    s.push('Selisih (penjualan − pengeluaran): ' + (t.selisih < 0 ? '-' : '') + rp(Math.abs(t.selisih)), '');
    s.push('_5. Kendala_', '');
    s.push(L.kendala ? L.kendala : '-', '');
    s.push('_6. Rencana Besok_', '');
    s.push(L.rencana ? L.rencana : '-', '');
    s.push('_👷 PIC:_');
    s.push('Nama: ' + (L.pic || kos));
    return s.join('\n');
  }

  // ================= Form input =================
  var F = null; // laporan yang sedang diisi

  function muatDraf() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(KUNCI_DRAF)); } catch (e) {}
    F = d && d.tanggal ? d : laporanBaru();
  }
  function simpanDraf() { try { localStorage.setItem(KUNCI_DRAF, JSON.stringify(F)); } catch (e) {} }
  function hapusDraf() { try { localStorage.removeItem(KUNCI_DRAF); } catch (e) {} }

  function inUang(attr, v, ph) { return '<input ' + attr + ' class="uang" inputmode="numeric" placeholder="' + (ph || '0') + '" value="' + nilaiUang(v) + '">'; }
  function inDes(attr, v, ph) { return '<input ' + attr + ' class="des" inputmode="decimal" placeholder="' + (ph || '0') + '" value="' + nilaiDes(v) + '">'; }

  function renderForm() {
    if (!F) muatDraf();
    var L = F;
    $('#judulInput').textContent = L.id ? 'Ubah Laporan ' + fmtTgl(L.tanggal) : 'Laporan Progres Harian';
    $('#btnBatalUbah').hidden = !L.id;
    var chip = function (grup, daftar, pilih) {
      return '<div class="chips" data-chip="' + grup + '">' + daftar.map(function (c) {
        var on = Array.isArray(pilih) ? pilih.indexOf(c) >= 0 : pilih === c;
        return '<button type="button" class="chip' + (on ? ' aktif' : '') + '" data-v="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>';
    };
    var h = '';
    h += '<div class="panel"><div class="grid2">' +
      '<label>📅 Tanggal<input type="date" data-f="tanggal" value="' + esc(L.tanggal) + '"></label>' +
      '<label>📍 Lokasi/Blok<input data-f="lokasi" list="dlLokasi" value="' + esc(L.lokasi) + '" placeholder="nama blok/lokasi"></label>' +
      '<label>👷 PIC<input data-f="pic" value="' + esc(L.pic) + '"></label>' +
      '</div></div>';

    h += '<div class="panel"><h3>1. Kondisi Hari Ini</h3><div class="lbl">Cuaca</div>' + chip('cuaca', D.cuaca, L.cuaca) +
      '<label>Kondisi area<input data-f="kondisi" list="dlKondisi" value="' + esc(L.kondisi) + '" placeholder="mis. berdebu, becek"></label></div>';

    h += '<div class="panel"><h3>2. Pekerjaan</h3><div class="lbl">Aktivitas (boleh lebih dari satu)</div>' + chip('aktivitas', D.aktivitas, L.aktivitas) +
      '<label>Aktivitas lain (pisahkan dengan koma)<input data-f="aktivitasLain" value="' + esc(L.aktivitasLain) + '"></label>' +
      '<div class="lbl" style="margin-top:14px">Alat: jam kerja &amp; sewa</div>' +
      L.alat.map(function (a, i) {
        return '<div class="baris-dinamis" data-baris="alat" data-i="' + i + '">' +
          '<div class="atas-baris"><input data-k="nama" list="dlAlat" value="' + esc(a.nama) + '" placeholder="nama alat"><button type="button" class="btn-hapus" data-hapus="alat" data-i="' + i + '" aria-label="Hapus alat">×</button></div>' +
          '<div class="tiga"><label>Jam kerja' + inDes('data-k="jam"', a.jam) + '</label>' +
          '<label>Tarif/jam (Rp)' + inUang('data-k="tarif"', a.tarif) + '</label>' +
          '<label>Sewa (Rp)' + inUang('data-k="sewa"', a.sewa) + '</label></div>' +
          '<div class="subtotal">' + (a.manual ? 'Sewa diisi manual' : 'Sewa = jam × tarif') + '</div></div>';
      }).join('') +
      '<button type="button" class="tautan" data-tambah="alat">+ Tambah alat</button></div>';

    h += '<div class="panel"><h3>3. Hasil/Progres</h3><div class="grid2">' +
      '<label>Volume pasir (± m³)' + inDes('data-f="volume"', L.volume, 'kosongkan jika tidak diukur') + '</label>' +
      '<label>Ritase (rit)' + inDes('data-f="ritase"', L.ritase) + '</label>' +
      '<label>Progres hari ini (%)' + inDes('data-f="progres"', L.progres) + '</label>' +
      '</div><div class="subtotal" id="infoRit" style="margin-top:8px"></div></div>';

    h += '<div class="panel"><h3>4. Pengeluaran Harian</h3><div class="grid2">' +
      '<label>Solar/BBM (Rp)' + inUang('data-f="solar" data-t="uang"', L.solar) + '</label>' +
      '<label>Solar (liter, opsional)' + inDes('data-f="solarLiter"', L.solarLiter) + '</label>' +
      '<label>Upah operator/tenaga kerja (Rp)' + inUang('data-f="upah" data-t="uang"', L.upah) + '</label>' +
      '<label>Makan dan minum (Rp)' + inUang('data-f="makan" data-t="uang"', L.makan) + '</label>' +
      '<label>Transportasi (Rp)' + inUang('data-f="transport" data-t="uang"', L.transport) + '</label>' +
      '<label>Sewa alat (Rp, dari bagian Alat)<input id="tampilSewa" disabled></label>' +
      '</div><div class="lbl" style="margin-top:14px">Lain-lain</div>' +
      L.lain.map(function (x, i) {
        return '<div class="baris-dinamis" data-baris="lain" data-i="' + i + '"><div class="atas-baris">' +
          '<input data-k="ket" value="' + esc(x.ket) + '" placeholder="keterangan, mis. checker malam">' +
          '<button type="button" class="btn-hapus" data-hapus="lain" data-i="' + i + '" aria-label="Hapus">×</button></div>' +
          inUang('data-k="nominal"', x.nominal, 'Rp') + '</div>';
      }).join('') +
      '<button type="button" class="tautan" data-tambah="lain">+ Tambah lain-lain</button>' +
      '<div class="total-baris"><span>Total pengeluaran</span><span id="totKeluar">Rp 0</span></div></div>';

    h += '<div class="panel"><h3>Penjualan</h3>' +
      L.jual.map(function (j, i) {
        return '<div class="baris-dinamis" data-baris="jual" data-i="' + i + '">' +
          '<div class="atas-baris"><input data-k="nama" list="dlProduk" value="' + esc(j.nama) + '" placeholder="nama produk"><button type="button" class="btn-hapus" data-hapus="jual" data-i="' + i + '" aria-label="Hapus">×</button></div>' +
          '<div class="dua"><label>Harga per ' + esc(j.satuan || 'rit') + ' (Rp)' + inUang('data-k="harga"', j.harga) + '</label>' +
          '<label>Kuantiti (' + esc(j.satuan || 'rit') + ')' + inDes('data-k="qty"', j.qty) + '</label></div>' +
          '<div class="subtotal">Jumlah: <b data-subjual="' + i + '">' + rp(n(j.harga) * n(j.qty)) + '</b></div></div>';
      }).join('') +
      '<button type="button" class="tautan" data-tambah="jual">+ Tambah produk</button>' +
      '<div class="total-baris"><span>Total penjualan</span><span id="totJual">Rp 0</span></div></div>';

    h += '<div class="panel"><h3>5. Kendala</h3><textarea data-f="kendala" placeholder="kosongkan jika tidak ada">' + esc(L.kendala) + '</textarea></div>';
    h += '<div class="panel"><h3>6. Rencana Besok</h3><textarea data-f="rencana">' + esc(L.rencana) + '</textarea></div>';

    $('#formLaporan').innerHTML = h;
    perbaruiRingkas();
  }

  function perbaruiRingkas() {
    var t = hitung(F);
    $('#totKeluar').textContent = rp(t.keluar);
    $('#totJual').textContent = rp(t.jual);
    $('#tampilSewa').value = ribu(t.sewa);
    var info = $('#infoRit');
    if (t.qtyJual && !kosong(F.ritase) && n(F.ritase) !== t.qtyJual) {
      info.innerHTML = '<span class="merah">Ritase (' + desimal(F.ritase) + ') berbeda dengan total kuantiti penjualan (' + desimal(t.qtyJual) + ').</span>';
    } else if (t.qtyJual && kosong(F.ritase)) {
      info.innerHTML = 'Total kuantiti penjualan: ' + desimal(t.qtyJual) + ' rit. <button type="button" class="tautan kecil" id="btnIsiRit">Pakai sebagai ritase</button>';
    } else info.textContent = '';
    $('#ringkasLengket').innerHTML =
      '<div><small>Pengeluaran</small><b>' + rp(t.keluar) + '</b></div>' +
      '<div><small>Penjualan</small><b>' + rp(t.jual) + '</b></div>' +
      '<div><small>Selisih</small><b class="' + (t.selisih < 0 ? 'merah' : '') + '" style="' + (t.selisih < 0 ? 'color:#ff9ea5' : '') + '">' + (t.selisih < 0 ? '-' : '') + rp(Math.abs(t.selisih)) + '</b></div>';
  }

  function formatUangInput(el) {
    var v = parseUang(el.value);
    el.value = v === '' ? '' : ribu(v);
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
    return v;
  }

  function onInput(e) {
    var el = e.target;
    var nilai;
    if (el.classList.contains('uang')) nilai = formatUangInput(el);
    else if (el.classList.contains('des')) nilai = parseDesimal(el.value);
    else nilai = el.value;

    if (el.dataset.f) {
      F[el.dataset.f] = nilai;
    } else if (el.dataset.k) {
      var b = el.closest('[data-baris]'); if (!b) return;
      var arr = F[b.dataset.baris], i = +b.dataset.i, row = arr[i], k = el.dataset.k;
      row[k] = nilai;
      if (b.dataset.baris === 'alat') {
        if (k === 'nama') {
          var m = D.alat.find(function (a) { return a.nama.toLowerCase() === String(nilai).trim().toLowerCase(); });
          if (m) { row.jenis = m.jenis || ''; if (kosong(row.tarif)) { row.tarif = m.tarif; $('[data-k="tarif"]', b).value = nilaiUang(m.tarif); } }
        }
        if (k === 'sewa') row.manual = !kosong(nilai);
        if ((k === 'jam' || k === 'tarif' || (k === 'sewa' && kosong(nilai))) && !row.manual) {
          row.sewa = kosong(row.jam) || kosong(row.tarif) ? '' : Math.round(n(row.jam) * n(row.tarif));
          var s = $('[data-k="sewa"]', b); if (document.activeElement !== s) s.value = nilaiUang(row.sewa);
        }
        $('.subtotal', b).textContent = row.manual ? 'Sewa diisi manual (kosongkan untuk hitung otomatis)' : 'Sewa = jam × tarif';
      }
      if (b.dataset.baris === 'jual') {
        if (k === 'nama') {
          var p = D.produk.find(function (x) { return x.nama.toLowerCase() === String(nilai).trim().toLowerCase(); });
          if (p && kosong(row.harga)) { row.harga = p.harga; row.satuan = p.satuan || 'rit'; $('[data-k="harga"]', b).value = nilaiUang(p.harga); }
        }
        $('[data-subjual="' + i + '"]').textContent = rp(n(row.harga) * n(row.qty));
      }
    }
    perbaruiRingkas();
    simpanDraf();
  }

  function onKlikForm(e) {
    var c = e.target.closest('.chip');
    if (c) {
      var grup = c.parentNode.dataset.chip, v = c.dataset.v;
      if (grup === 'aktivitas') {
        var i = F.aktivitas.indexOf(v);
        if (i >= 0) F.aktivitas.splice(i, 1); else F.aktivitas.push(v);
        c.classList.toggle('aktif', i < 0);
      } else {
        F.cuaca = F.cuaca === v ? '' : v;
        $$('.chip', c.parentNode).forEach(function (x) { x.classList.toggle('aktif', x.dataset.v === F.cuaca); });
      }
      simpanDraf(); return;
    }
    var t = e.target.closest('[data-tambah]');
    if (t) {
      var jenis = t.dataset.tambah;
      if (jenis === 'alat') F.alat.push({ nama: '', jenis: '', jam: '', tarif: '', sewa: '', manual: false });
      if (jenis === 'lain') F.lain.push({ ket: '', nominal: '' });
      if (jenis === 'jual') F.jual.push({ nama: '', harga: '', qty: '', satuan: 'rit' });
      renderForm(); simpanDraf();
      var baris = $$('[data-baris="' + jenis + '"]'); var akhir = baris[baris.length - 1];
      if (akhir) { var inp = $('input', akhir); inp.focus(); }
      return;
    }
    var h = e.target.closest('[data-hapus]');
    if (h) {
      F[h.dataset.hapus].splice(+h.dataset.i, 1);
      renderForm(); simpanDraf(); return;
    }
    if (e.target.id === 'btnIsiRit') {
      F.ritase = hitung(F).qtyJual; renderForm(); simpanDraf();
    }
  }

  function periksa(L) {
    var wajib = [], cek = [];
    if (!L.tanggal) wajib.push('Tanggal belum diisi.');
    if (!String(L.lokasi).trim()) wajib.push('Lokasi/Blok belum diisi.');
    if (!String(L.pic).trim()) wajib.push('Nama PIC belum diisi.');
    var t = hitung(L);
    L.alat.forEach(function (a) {
      if (n(a.jam) > 24) cek.push('Jam kerja ' + (a.nama || 'alat') + ' lebih dari 24 jam.');
      if (n(a.jam) > 0 && !a.nama) cek.push('Ada alat dengan jam kerja tetapi tanpa nama.');
    });
    if (!kosong(L.progres) && (n(L.progres) < 0 || n(L.progres) > 100)) cek.push('Progres di luar 0–100%.');
    if (t.qtyJual && !kosong(L.ritase) && n(L.ritase) !== t.qtyJual) cek.push('Ritase (' + desimal(L.ritase) + ') ≠ total kuantiti penjualan (' + desimal(t.qtyJual) + ').');
    if (!kosong(L.solar) && n(L.solar) > 0 && t.jamAlat === 0) cek.push('Ada biaya solar tetapi jam kerja alat kosong.');
    L.lain.forEach(function (x) { if (n(x.nominal) && !String(x.ket).trim()) cek.push('Ada biaya lain-lain tanpa keterangan.'); });
    if (t.keluar === 0) cek.push('Total pengeluaran Rp 0.');
    var ganda = D.laporan.find(function (x) { return x.id !== L.id && x.tanggal === L.tanggal && String(x.lokasi).trim().toLowerCase() === String(L.lokasi).trim().toLowerCase(); });
    if (ganda) cek.push('Sudah ada laporan tanggal ' + fmtTgl(L.tanggal) + ' untuk lokasi "' + L.lokasi + '". Laporan ini akan menjadi laporan terpisah.');
    return { wajib: wajib, cek: cek };
  }

  function bersihkan(L) {
    var x = salinObj(L);
    x.lokasi = String(x.lokasi).trim(); x.pic = String(x.pic).trim();
    x.alat = x.alat.filter(function (a) { return a.nama || n(a.jam) || n(a.sewa); });
    x.lain = x.lain.filter(function (l) { return l.ket || n(l.nominal); });
    x.jual = x.jual.filter(function (j) { return j.nama; });
    return x;
  }

  function simpanLaporan() {
    var p = periksa(F);
    if (p.wajib.length) { toast(p.wajib[0]); return; }
    var lanjut = function () {
      var L = bersihkan(F);
      var waktu = new Date().toISOString();
      if (L.id) {
        var i = D.laporan.findIndex(function (x) { return x.id === L.id; });
        L.diubah = waktu; L.diubahOleh = pengguna.nama;
        if (i >= 0) D.laporan[i] = L; else D.laporan.push(L);
      } else {
        L.id = uid('L'); L.dibuat = waktu; L.oleh = pengguna.nama;
        D.laporan.push(L);
      }
      if (!simpan()) return;
      hapusDraf(); F = laporanBaru(); isiDatalist(); renderForm();
      toast('Laporan tersimpan');
      tampilTeks(L, true);
    };
    if (p.cek.length) {
      bukaDialog('<h3>Periksa dulu</h3><div class="peringatan">Hal berikut perlu dicek:<ul>' +
        p.cek.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="dlg-aksi"><button class="tombol" data-tutup>Perbaiki</button><button class="tombol utama" id="btnTetap">Tetap simpan</button></div>',
        function (dlg) { $('#btnTetap').onclick = function () { dlg.close(); lanjut(); }; });
    } else lanjut();
  }

  function tampilTeks(L, baru) {
    var teks = teksWA(L);
    bukaDialog('<h3>' + (baru ? 'Tersimpan ✓ — ' : '') + 'Teks laporan ' + fmtTgl(L.tanggal) + '</h3>' +
      '<pre class="teks-wa">' + esc(teks) + '</pre>' +
      '<div class="dlg-aksi"><button class="tombol" data-tutup>Tutup</button>' +
      (navigator.share ? '<button class="tombol" id="btnBagi">Bagikan</button>' : '') +
      '<button class="tombol utama" id="btnSalinWA">Salin teks</button></div>',
      function () {
        $('#btnSalinWA').onclick = function () { salinTeks(teks).then(function (ok) { toast(ok ? 'Teks disalin, tempel di WhatsApp' : 'Gagal menyalin'); }); };
        var b = $('#btnBagi'); if (b) b.onclick = function () { navigator.share({ text: teks }).catch(function () {}); };
      });
  }

  // ================= Riwayat =================
  function renderRiwayat() {
    var bln = $('#bulanRiwayat'); if (!bln.value) bln.value = bulanIni();
    var daftar = D.laporan.filter(function (l) { return l.tanggal.slice(0, 7) === bln.value; })
      .sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (a.dibuat < b.dibuat ? 1 : -1); });
    if (!daftar.length) { $('#daftarLaporan').innerHTML = '<div class="kosong">Belum ada laporan di ' + esc(fmtBulan(bln.value)) + '.</div>'; return; }
    $('#daftarLaporan').innerHTML = daftar.map(function (l) {
      var t = hitung(l);
      return '<div class="lap"><div class="kepala"><b>' + esc(fmtTglPanjang(l.tanggal)) + '</b><span class="meta">📍 ' + esc(l.lokasi) + '</span></div>' +
        '<div class="meta">PIC: ' + esc(l.pic) + (l.cuaca ? ' · ' + esc(l.cuaca) : '') + ' · Ritase: ' + (kosong(l.ritase) ? '-' : desimal(l.ritase)) + '</div>' +
        '<div class="angka3"><div><span class="meta">Pengeluaran</span><b>' + rp(t.keluar) + '</b></div><div><span class="meta">Penjualan</span><b>' + rp(t.jual) + '</b></div>' +
        '<div><span class="meta">Selisih</span><b class="' + (t.selisih < 0 ? 'merah' : 'hijau') + '">' + (t.selisih < 0 ? '-' : '') + rp(Math.abs(t.selisih)) + '</b></div></div>' +
        '<div class="aksi"><button class="tombol kecil" data-teks="' + l.id + '">Teks WA</button><button class="tombol kecil" data-ubah="' + l.id + '">Ubah</button>' +
        (isAdmin() ? '<button class="tombol kecil bahaya" data-hapus-lap="' + l.id + '">Hapus</button>' : '') + '</div></div>';
    }).join('');
  }
  function cariLap(id) { return D.laporan.find(function (l) { return l.id === id; }); }
  function onKlikRiwayat(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.teks) tampilTeks(cariLap(b.dataset.teks));
    if (b.dataset.ubah) {
      var l = salinObj(cariLap(b.dataset.ubah));
      if (!l.lain.length) l.lain.push({ ket: '', nominal: '' });
      F = l; simpanDraf(); buka('input');
    }
    if (b.dataset.hapusLap) {
      var x = cariLap(b.dataset.hapusLap);
      bukaDialog('<h3>Hapus laporan?</h3><p>Laporan ' + esc(fmtTgl(x.tanggal)) + ' – ' + esc(x.lokasi) + ' akan dihapus permanen dari HP ini.</p>' +
        '<div class="dlg-aksi"><button class="tombol" data-tutup>Batal</button><button class="tombol utama" id="btnYaHapus" style="background:var(--bahaya);border-color:var(--bahaya)">Hapus</button></div>',
        function (dlg) { $('#btnYaHapus').onclick = function () { D.laporan = D.laporan.filter(function (l) { return l.id !== x.id; }); simpan(); dlg.close(); renderRiwayat(); toast('Laporan dihapus'); }; });
    }
  }

  // ================= Rekap & ekspor =================
  function laporanBulan(ym) {
    return D.laporan.filter(function (l) { return l.tanggal.slice(0, 7) === ym; })
      .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : (a.dibuat < b.dibuat ? -1 : 1); });
  }

  function renderRekap() {
    var bln = $('#bulanRekap'); if (!bln.value) bln.value = bulanIni();
    var daftar = laporanBulan(bln.value);
    var tot = { rit: 0, jual: 0, keluar: 0, solar: 0, liter: 0, upah: 0, sewa: 0, makan: 0, transport: 0, lain: 0, jamAlat: 0 };
    var perProduk = {}, urutProduk = [];
    daftar.forEach(function (l) {
      var t = hitung(l);
      tot.rit += n(l.ritase); tot.jual += t.jual; tot.keluar += t.keluar; tot.solar += n(l.solar); tot.liter += n(l.solarLiter);
      tot.upah += n(l.upah); tot.sewa += t.sewa; tot.makan += n(l.makan); tot.transport += n(l.transport); tot.lain += t.lain; tot.jamAlat += t.jamAlat;
      l.jual.forEach(function (j) {
        if (!perProduk[j.nama]) { perProduk[j.nama] = { qty: 0, nilai: 0, satuan: j.satuan || 'rit' }; urutProduk.push(j.nama); }
        perProduk[j.nama].qty += n(j.qty); perProduk[j.nama].nilai += n(j.harga) * n(j.qty);
      });
    });
    var selisih = tot.jual - tot.keluar;
    $('#kartuAngka').innerHTML =
      '<div class="angka"><small>Laporan</small><b>' + daftar.length + '</b></div>' +
      '<div class="angka"><small>Total ritase</small><b>' + desimal(tot.rit) + ' rit</b></div>' +
      '<div class="angka"><small>Penjualan</small><b>' + rp(tot.jual) + '</b></div>' +
      '<div class="angka sorot"><small>Selisih</small><b>' + (selisih < 0 ? '-' : '') + rp(Math.abs(selisih)) + '</b></div>';
    var baris = function (a, b) { return '<div><span>' + a + '</span><b>' + b + '</b></div>'; };
    $('#rekapBiaya').innerHTML = '<div class="daftar-nilai">' +
      baris('Solar/BBM' + (tot.liter ? ' (' + desimal(tot.liter) + ' L)' : ''), rp(tot.solar)) + baris('Upah', rp(tot.upah)) +
      baris('Sewa alat (' + desimal(tot.jamAlat) + ' jam)', rp(tot.sewa)) + baris('Makan & minum', rp(tot.makan)) +
      baris('Transportasi', rp(tot.transport)) + baris('Lain-lain', rp(tot.lain)) + baris('Total pengeluaran', rp(tot.keluar)) + '</div>';
    $('#rekapJual').innerHTML = '<div class="daftar-nilai">' + urutProduk.map(function (k) {
      return baris(esc(k) + ' (' + desimal(perProduk[k].qty) + ' ' + esc(perProduk[k].satuan) + ')', rp(perProduk[k].nilai));
    }).join('') + baris('Total penjualan', rp(tot.jual)) + '</div>';
    if (!daftar.length) { $('#tabelRekap').innerHTML = '<tr><td class="kosong">Belum ada laporan di ' + esc(fmtBulan(bln.value)) + '.</td></tr>'; return; }
    $('#tabelRekap').innerHTML = '<thead><tr><th>Tanggal</th><th>Lokasi</th><th class="k">Rit</th><th class="k">Penjualan</th><th class="k">Pengeluaran</th><th class="k">Selisih</th></tr></thead><tbody>' +
      daftar.map(function (l) {
        var t = hitung(l);
        return '<tr><td>' + fmtTgl(l.tanggal) + '</td><td>' + esc(l.lokasi) + '</td><td class="k">' + (kosong(l.ritase) ? '-' : desimal(l.ritase)) + '</td><td class="k">' + ribu(t.jual) + '</td><td class="k">' + ribu(t.keluar) + '</td><td class="k ' + (t.selisih < 0 ? 'merah' : '') + '">' + ribu(t.selisih) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="2">Total</td><td class="k">' + desimal(tot.rit) + '</td><td class="k">' + ribu(tot.jual) + '</td><td class="k">' + ribu(tot.keluar) + '</td><td class="k">' + ribu(selisih) + '</td></tr></tfoot>';
  }

  // Tabel datar untuk spreadsheet keuangan: satu baris per laporan.
  function tabelEkspor(daftar, desimalKoma) {
    var namaAlat = D.alat.map(function (a) { return a.nama; });
    var namaProduk = D.produk.map(function (p) { return p.nama; });
    daftar.forEach(function (l) {
      l.alat.forEach(function (a) { if (a.nama && namaAlat.indexOf(a.nama) < 0) namaAlat.push(a.nama); });
      l.jual.forEach(function (j) { if (j.nama && namaProduk.indexOf(j.nama) < 0) namaProduk.push(j.nama); });
    });
    var angka = function (v) { if (kosong(v)) return ''; var s = String(+(+v).toFixed(2)); return desimalKoma ? s.replace('.', ',') : s; };
    var kepala = ['Tanggal', 'Lokasi/Blok', 'PIC', 'Cuaca', 'Kondisi Area', 'Aktivitas'];
    namaAlat.forEach(function (a) { kepala.push('Jam ' + a); });
    kepala.push('Total Jam Alat', 'Volume (m3)', 'Ritase (rit)', 'Progres (%)', 'Solar/BBM (Rp)', 'Solar (L)', 'Upah (Rp)');
    namaAlat.forEach(function (a) { kepala.push('Sewa ' + a + ' (Rp)'); });
    kepala.push('Sewa Alat (Rp)', 'Makan & Minum (Rp)', 'Transportasi (Rp)', 'Lain-lain (Rp)', 'Ket. Lain-lain', 'Total Pengeluaran (Rp)');
    namaProduk.forEach(function (p) { kepala.push('Qty ' + p, 'Harga ' + p + ' (Rp)', 'Penjualan ' + p + ' (Rp)'); });
    kepala.push('Total Penjualan (Rp)', 'Selisih (Rp)', 'Kendala', 'Rencana Besok');
    var baris = daftar.map(function (l) {
      var t = hitung(l);
      var r = [l.tanggal, l.lokasi, l.pic, l.cuaca, l.kondisi, semuaAktivitas(l).join(', ')];
      var cariAlat = function (nm) { return l.alat.filter(function (a) { return a.nama === nm; }); };
      namaAlat.forEach(function (nm) { var x = cariAlat(nm); r.push(x.length ? angka(x.reduce(function (s, a) { return s + n(a.jam); }, 0)) : ''); });
      r.push(angka(t.jamAlat), angka(l.volume), angka(l.ritase), angka(l.progres), angka(l.solar), angka(l.solarLiter), angka(l.upah));
      namaAlat.forEach(function (nm) { var x = cariAlat(nm); r.push(x.length ? angka(x.reduce(function (s, a) { return s + n(a.sewa); }, 0)) : ''); });
      r.push(angka(t.sewa), angka(l.makan), angka(l.transport), angka(t.lain),
        l.lain.map(function (x) { return (x.ket || '-') + ' ' + ribu(x.nominal); }).join('; '), angka(t.keluar));
      namaProduk.forEach(function (nm) {
        var j = l.jual.filter(function (x) { return x.nama === nm; });
        if (!j.length) { r.push('', '', ''); return; }
        var q = j.reduce(function (s, x) { return s + n(x.qty); }, 0), v = j.reduce(function (s, x) { return s + n(x.qty) * n(x.harga); }, 0);
        r.push(angka(q), angka(j[0].harga), angka(v));
      });
      r.push(angka(t.jual), angka(t.selisih), l.kendala, l.rencana);
      return r;
    });
    return [kepala].concat(baris);
  }

  function ekspor(jenis) {
    var ym = $('#bulanRekap').value || bulanIni();
    var daftar = laporanBulan(ym);
    if (!daftar.length) { toast('Belum ada laporan di bulan ini'); return; }
    if (jenis === 'tsv') {
      var tsv = tabelEkspor(daftar, false).map(function (r) {
        return r.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t');
      }).join('\n');
      salinTeks(tsv).then(function (ok) { toast(ok ? daftar.length + ' baris disalin. Tempel di sel A1 spreadsheet.' : 'Gagal menyalin, pakai Unduh CSV'); });
      return;
    }
    var sep = $('#pemisahCSV').value;
    var csv = tabelEkspor(daftar, sep === ';').map(function (r) {
      return r.map(function (v) { v = String(v == null ? '' : v); return (v.indexOf(sep) >= 0 || /["\n\r]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(sep);
    }).join('\r\n');
    unduh('laporan-harian-' + ym + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  }

  // ================= Pengaturan =================
  function renderAtur() {
    if (!isAdmin()) return;
    var h = '';
    h += '<div class="panel"><h3>Usaha &amp; lokasi</h3><div class="isian">' +
      '<label>Nama usaha<input id="atNama" value="' + esc(D.profil.nama) + '"></label>' +
      '<label>Lokasi/blok (satu per baris)<textarea id="atLokasi">' + esc(D.profil.lokasi.join('\n')) + '</textarea></label>' +
      '<label>Pilihan aktivitas (satu per baris)<textarea id="atAktivitas">' + esc(D.aktivitas.join('\n')) + '</textarea></label>' +
      '<label>Pilihan cuaca (satu per baris)<textarea id="atCuaca">' + esc(D.cuaca.join('\n')) + '</textarea></label>' +
      '</div></div>';
    h += '<div class="panel"><h3>Alat berat (nama · jenis · tarif sewa/jam)</h3><ul class="daftar-atur" id="atAlat">' +
      D.alat.map(function (a) { return barisAlat(a); }).join('') + '</ul><button type="button" class="tautan" id="tambahAlat">+ Tambah alat</button>' +
      '<p class="redup kecil">Tarif awal dihitung dari contoh laporan (Kobelco Rp2.040.000 ÷ 12 jam, CAT Rp1.280.000 ÷ 8 jam). Sesuaikan dengan kontrak sewa sebenarnya.</p></div>';
    h += '<div class="panel"><h3>Produk penjualan (nama · harga default · satuan)</h3><ul class="daftar-atur" id="atProduk">' +
      D.produk.map(function (p) { return barisProduk(p); }).join('') + '</ul><button type="button" class="tautan" id="tambahProduk">+ Tambah produk</button>' +
      '<p class="redup kecil">Harga default otomatis terisi di form, tetapi checker tetap bisa mengubahnya per laporan.</p></div>';
    h += '<div class="aksi" style="margin-bottom:14px"><button class="tombol utama" id="btnSimpanAtur">Simpan pengaturan</button></div>';
    h += '<div class="panel"><h3>Pengguna &amp; PIN</h3><ul class="daftar-atur">' + D.pengguna.map(function (u) {
      return '<li><span><b>' + esc(u.nama) + '</b> <span class="redup kecil">· ' + (u.peran === 'admin' ? 'admin' : 'checker') + '</span></span>' +
        '<span class="aksi"><button class="tombol kecil" data-pin="' + u.id + '">Ganti PIN</button>' + (u.id !== pengguna.id ? '<button class="tombol kecil bahaya" data-hapus-user="' + u.id + '">Hapus</button>' : '') + '</span></li>';
    }).join('') + '</ul>' +
      '<div class="grid2"><input id="uNama" placeholder="Nama"><input id="uPin" placeholder="PIN 4 angka" inputmode="numeric" maxlength="4">' +
      '<select id="uPeran"><option value="checker">Checker</option><option value="admin">Admin</option></select><button class="tombol" id="btnTambahUser">Tambah pengguna</button></div>' +
      '<p class="redup kecil">Checker bisa mengisi &amp; mengubah laporan. Hanya admin yang bisa menghapus laporan dan membuka pengaturan.</p></div>';
    h += '<div class="panel"><h3>Data</h3><div class="aksi wrap">' +
      '<button class="tombol" id="btnBackup">Backup JSON</button>' +
      '<label class="tombol" style="display:inline-flex;color:var(--teks)">Pulihkan JSON<input type="file" id="fileBackup" accept=".json,application/json" hidden></label>' +
      '<button class="tombol bahaya" id="btnReset">Hapus semua data</button></div>' +
      '<p class="redup kecil">Semua data hanya tersimpan di HP/perangkat ini. Lakukan backup rutin (mis. seminggu sekali) dan simpan filenya di tempat lain.</p></div>';
    $('#isiAtur').innerHTML = h;
  }
  function barisAlat(a) {
    return '<li data-id="' + esc(a.id) + '"><div class="tiga"><input data-a="nama" value="' + esc(a.nama) + '" placeholder="Nama alat"><input data-a="jenis" value="' + esc(a.jenis || '') + '" placeholder="Jenis, mis. Eksavator">' +
      '<input data-a="tarif" class="uang" inputmode="numeric" value="' + nilaiUang(a.tarif) + '" placeholder="Tarif/jam"></div><button type="button" class="btn-hapus" data-hapus-baris>×</button></li>';
  }
  function barisProduk(p) {
    return '<li data-id="' + esc(p.id) + '"><div class="tiga"><input data-a="nama" value="' + esc(p.nama) + '" placeholder="Nama produk"><input data-a="harga" class="uang" inputmode="numeric" value="' + nilaiUang(p.harga) + '" placeholder="Harga">' +
      '<input data-a="satuan" value="' + esc(p.satuan || 'rit') + '" placeholder="Satuan"></div><button type="button" class="btn-hapus" data-hapus-baris>×</button></li>';
  }
  function baris(teks) { return teks.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }

  function simpanAtur() {
    D.profil.nama = $('#atNama').value.trim() || 'Usaha Tambang';
    D.profil.lokasi = baris($('#atLokasi').value);
    D.aktivitas = baris($('#atAktivitas').value);
    D.cuaca = baris($('#atCuaca').value);
    D.alat = $$('#atAlat li').map(function (li) {
      return { id: li.dataset.id, nama: $('[data-a="nama"]', li).value.trim(), jenis: $('[data-a="jenis"]', li).value.trim(), tarif: parseUang($('[data-a="tarif"]', li).value) };
    }).filter(function (a) { return a.nama; });
    D.produk = $$('#atProduk li').map(function (li) {
      return { id: li.dataset.id, nama: $('[data-a="nama"]', li).value.trim(), harga: parseUang($('[data-a="harga"]', li).value), satuan: $('[data-a="satuan"]', li).value.trim() || 'rit' };
    }).filter(function (p) { return p.nama; });
    simpan(); isiDatalist();
    $('#namaUsaha').textContent = D.profil.nama;
    toast('Pengaturan disimpan. Berlaku untuk laporan baru.');
    renderAtur();
  }

  function onKlikAtur(e) {
    var el = e.target;
    if (el.id === 'tambahAlat') { $('#atAlat').insertAdjacentHTML('beforeend', barisAlat({ id: uid('a'), nama: '', jenis: '', tarif: '' })); return; }
    if (el.id === 'tambahProduk') { $('#atProduk').insertAdjacentHTML('beforeend', barisProduk({ id: uid('p'), nama: '', harga: '', satuan: 'rit' })); return; }
    if (el.hasAttribute('data-hapus-baris')) { el.closest('li').remove(); return; }
    if (el.id === 'btnSimpanAtur') { simpanAtur(); return; }
    if (el.id === 'btnTambahUser') {
      var nm = $('#uNama').value.trim(), pin = $('#uPin').value.trim();
      if (!nm) { toast('Isi nama'); return; }
      if (!/^\d{4}$/.test(pin)) { toast('PIN harus 4 angka'); return; }
      D.pengguna.push({ id: uid('u'), nama: nm, pin: pin, peran: $('#uPeran').value }); simpan(); renderAtur(); toast('Pengguna ditambahkan'); return;
    }
    if (el.dataset.pin) {
      var u = D.pengguna.find(function (x) { return x.id === el.dataset.pin; });
      bukaDialog('<h3>Ganti PIN ' + esc(u.nama) + '</h3><label>PIN baru (4 angka)<input id="pinBaru" inputmode="numeric" maxlength="4"></label>' +
        '<div class="dlg-aksi"><button class="tombol" data-tutup>Batal</button><button class="tombol utama" id="btnPinOk">Simpan</button></div>',
        function (dlg) {
          $('#btnPinOk').onclick = function () {
            var p = $('#pinBaru').value.trim();
            if (!/^\d{4}$/.test(p)) { toast('PIN harus 4 angka'); return; }
            u.pin = p; simpan(); dlg.close(); toast('PIN diganti');
          };
        });
      return;
    }
    if (el.dataset.hapusUser) {
      var target = D.pengguna.find(function (x) { return x.id === el.dataset.hapusUser; });
      var sisaAdmin = D.pengguna.filter(function (x) { return x.peran === 'admin' && x.id !== target.id; }).length;
      if (target.peran === 'admin' && !sisaAdmin) { toast('Minimal harus ada satu admin'); return; }
      D.pengguna = D.pengguna.filter(function (x) { return x.id !== target.id; }); simpan(); renderAtur(); return;
    }
    if (el.id === 'btnBackup') {
      unduh('backup-checker-tambang-' + hariIni() + '.json', JSON.stringify(D, null, 1), 'application/json'); return;
    }
    if (el.id === 'btnReset') {
      bukaDialog('<h3>Hapus semua data?</h3><p>Semua laporan, pengguna, dan pengaturan di HP ini akan hilang. Lakukan backup dulu. PIN admin kembali ke 1234.</p>' +
        '<label>Ketik HAPUS untuk konfirmasi<input id="konfHapus"></label>' +
        '<div class="dlg-aksi"><button class="tombol" data-tutup>Batal</button><button class="tombol utama" id="btnYaReset" style="background:var(--bahaya);border-color:var(--bahaya)">Hapus semua</button></div>',
        function (dlg) {
          $('#btnYaReset').onclick = function () {
            if ($('#konfHapus').value.trim().toUpperCase() !== 'HAPUS') { toast('Ketik HAPUS dulu'); return; }
            D = dataAwal(); simpan(); hapusDraf(); dlg.close(); keluar(); toast('Semua data dihapus');
          };
        });
    }
  }

  function pulihkan(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var x = JSON.parse(r.result);
        if (!x || !Array.isArray(x.laporan) || !Array.isArray(x.pengguna)) throw new Error('format');
        bukaDialog('<h3>Pulihkan backup?</h3><p>Data di HP ini akan diganti dengan isi backup (' + x.laporan.length + ' laporan).</p>' +
          '<div class="dlg-aksi"><button class="tombol" data-tutup>Batal</button><button class="tombol utama" id="btnYaPulih">Pulihkan</button></div>',
          function (dlg) { $('#btnYaPulih').onclick = function () { D = x; simpan(); dlg.close(); toast('Backup dipulihkan, silakan masuk lagi'); keluar(); }; });
      } catch (e) { toast('File backup tidak valid'); }
    };
    r.readAsText(file);
  }

  // ================= Mulai =================
  function mulai() {
    muat();
    $('#padPin').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'hapus'].map(function (k) {
      return k === '' ? '<span></span>' : '<button type="button" data-k="' + k + '">' + (k === 'hapus' ? '⌫' : k) + '</button>';
    }).join('');
    $('#padPin').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ketikPin(b.dataset.k); });
    document.addEventListener('keydown', function (e) {
      if ($('#layarMasuk').hidden) return;
      if (/^\d$/.test(e.key)) ketikPin(e.key); else if (e.key === 'Backspace') ketikPin('hapus');
    });
    $$('.nav').forEach(function (b) { b.addEventListener('click', function () { buka(b.dataset.hal); }); });
    $('#btnKeluar').addEventListener('click', keluar);

    var form = $('#formLaporan');
    form.addEventListener('input', onInput);
    form.addEventListener('click', onKlikForm);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    $('#btnSimpan').addEventListener('click', simpanLaporan);
    $('#btnPratinjau').addEventListener('click', function () { tampilTeks(F); });
    $('#btnKosongkan').addEventListener('click', function () {
      bukaDialog('<h3>Kosongkan form?</h3><p>Isian yang belum disimpan akan hilang.</p><div class="dlg-aksi"><button class="tombol" data-tutup>Batal</button><button class="tombol utama" id="btnYaKosong">Kosongkan</button></div>',
        function (dlg) { $('#btnYaKosong').onclick = function () { F = laporanBaru(); hapusDraf(); renderForm(); dlg.close(); }; });
    });
    $('#btnBatalUbah').addEventListener('click', function () { F = laporanBaru(); hapusDraf(); renderForm(); toast('Perubahan dibatalkan'); });

    $('#bulanRiwayat').addEventListener('change', renderRiwayat);
    $('#daftarLaporan').addEventListener('click', onKlikRiwayat);
    $('#bulanRekap').addEventListener('change', renderRekap);
    $('#btnSalinTSV').addEventListener('click', function () { ekspor('tsv'); });
    $('#btnEksporCSV').addEventListener('click', function () { ekspor('csv'); });

    var atur = $('#isiAtur');
    atur.addEventListener('click', onKlikAtur);
    atur.addEventListener('input', function (e) { if (e.target.classList.contains('uang')) formatUangInput(e.target); });
    atur.addEventListener('change', function (e) { if (e.target.id === 'fileBackup' && e.target.files[0]) { pulihkan(e.target.files[0]); e.target.value = ''; } });

    var sesi = null; try { sesi = sessionStorage.getItem('checker-sesi'); } catch (e) {}
    var u = sesi && D.pengguna.find(function (x) { return x.id === sesi; });
    if (u) masuk(u); else tampilMasuk();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  // untuk pengujian di luar browser
  if (typeof window.__CT_TEST__ !== 'undefined') {
    window.__CT_TEST__ = { teksWA: teksWA, hitung: hitung, tabelEkspor: tabelEkspor, setD: function (x) { D = x; }, dataAwal: dataAwal };
    return;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else mulai();
})();
