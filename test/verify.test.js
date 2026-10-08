'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Verify = require('../public/js/verify.js');

const SUMBER = `[00:10] Menteri Siti Aminah: Anggaran program ini mencapai Rp1.500.000.000 untuk 120 sekolah. Kami tidak akan menambah pungutan apa pun kepada orang tua murid.
[00:55] Kami menargetkan selesai pada Desember 2026 di Bandung.`;

const MODES = { quotes: true, numbers: true, names: true, leak: true, cliche: true };

test('kutipan persis ditandai exact dan membawa penanda waktu', () => {
  const r = Verify.run({
    output: 'Ia menegaskan “Kami tidak akan menambah pungutan apa pun kepada orang tua murid.”',
    source: SUMBER, modes: MODES,
  });
  assert.strictEqual(r.quotes[0].status, 'exact');
  assert.strictEqual(r.quotes[0].time, '00:10');
});

test('kutipan yang diubah ditandai missing atau similar, bukan exact', () => {
  const r = Verify.run({
    output: 'Ia berkata “Kami pasti tidak akan pernah menambah pungutan kepada semua orang tua”',
    source: SUMBER, modes: MODES,
  });
  assert.notStrictEqual(r.quotes[0].status, 'exact');
});

test('kutipan karangan ditandai missing', () => {
  const r = Verify.run({ output: 'Ia mengaku “program ini gagal total dan harus dihentikan”', source: SUMBER, modes: MODES });
  assert.strictEqual(r.quotes[0].status, 'missing');
  assert.strictEqual(r.summary.level, 'bad');
});

test('angka yang tidak ada di sumber ditandai, angka sah tidak', () => {
  const r = Verify.run({
    output: 'Anggaran Rp1.500.000.000 untuk 120 sekolah, dengan 45 guru dan target Desember 2026.',
    source: SUMBER, modes: MODES,
  });
  const flagged = r.numbers.map((n) => n.token);
  assert.ok(flagged.includes('45'));
  assert.ok(!flagged.includes('120'));
  assert.ok(!flagged.includes('1.500.000.000'));
  assert.ok(!flagged.includes('2026'));
});

test('label nomor urut dan hitungan karakter tidak dianggap angka', () => {
  const r = Verify.run({
    output: '1. [Lugas] Anggaran 120 sekolah | clickbait: rendah\nSlide 2 (Isi): 120 sekolah\n(54 karakter)',
    source: SUMBER, modes: MODES,
  });
  assert.strictEqual(r.numbers.length, 0);
});

test('nama yang tidak ada di sumber ditandai, awal kalimat tidak', () => {
  const r = Verify.run({
    output: 'Kemarin Menteri Siti Aminah bertemu Budi Santoso di Bandung. Anggaran naik.',
    source: SUMBER, modes: MODES,
  });
  const names = r.names.map((n) => n.word);
  assert.ok(names.includes('Budi'));
  assert.ok(names.includes('Santoso'));
  assert.ok(!names.includes('Bandung'));
  assert.ok(!names.includes('Kemarin'));
});

test('kebocoran dari contoh tulisan terdeteksi', () => {
  const contoh = 'Gubernur Jawa Barat menyebut pembangunan jembatan itu akan rampung tahun depan menurut jadwal yang disusun dinas.';
  const r = Verify.run({
    output: 'Ia menyebut pembangunan jembatan itu akan rampung tahun depan menurut jadwal yang disusun dinas.',
    source: SUMBER, styleSamples: [contoh], modes: MODES,
  });
  assert.ok(r.leaks.length >= 1);
  assert.strictEqual(r.summary.level, 'bad');
});

test('nama dan angka dari contoh yang bocor ditandai sebagai leak', () => {
  const r = Verify.run({
    output: 'Proyek bernilai 777 miliar dipimpin Hartono.',
    source: SUMBER, styleSamples: ['Hartono menyebut nilai proyek 777 miliar rupiah.'], modes: MODES,
  });
  assert.ok(r.numbers.some((n) => n.leak));
  assert.ok(r.names.some((n) => n.leak));
});

test('klise dan tanda pisah panjang terdeteksi', () => {
  const r = Verify.run({
    output: 'Di era digital ini, tidak dapat dipungkiri bahwa program itu — menurut banyak pihak — penting.',
    source: SUMBER, modes: MODES,
  });
  const labels = r.cliches.map((c) => c.label);
  assert.ok(labels.includes('di era digital'));
  assert.ok(labels.includes('tidak dapat dipungkiri'));
  assert.ok(labels.some((l) => l.includes('tanda pisah')));
});

test('pemisah kalimat menjaga singkatan', () => {
  const s = Verify.splitSentences('Dr. Budi hadir di Jl. Merdeka No. 5. Acara dimulai pukul 10.00. Semua tertib.');
  assert.strictEqual(s.length, 3);
});

test('statistik gaya menghitung rata-rata kata per kalimat', () => {
  const st = Verify.styleStats('Ini kalimat satu. Ini kalimat yang sedikit lebih panjang dari yang pertama tadi.\n\nSingkat.');
  assert.strictEqual(st.sentences, 3);
  assert.ok(st.avg > 2);
});
