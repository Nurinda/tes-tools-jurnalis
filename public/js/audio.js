/*
 * MRAAudio: mengubah rekaman/file audio menjadi potongan WAV mono 16 kHz
 * (±55 detik, dipotong di titik paling sunyi) agar muat dalam batas request
 * dan waktu fungsi Netlify. Seluruh proses ini berjalan di browser.
 */
(function (root) {
  'use strict';

  const OUT_SR = 16000;
  const TARGET_SEC = 55; // panjang potongan yang dituju
  const SEARCH_SEC = 6; // jendela pencarian titik sunyi sebelum batas
  const MIN_SEC = 10; // potongan tidak boleh lebih pendek dari ini (kecuali terakhir)

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  async function decode(blob) {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error('Browser ini tidak bisa memproses audio. Coba pakai Chrome atau Safari versi terbaru.');
    let ctx;
    try {
      ctx = new AC({ sampleRate: OUT_SR }); // memaksa hasil decode 16 kHz bila didukung (hemat memori)
    } catch (_) {
      ctx = new AC();
    }
    const ab = await blob.arrayBuffer();
    try {
      const buf = await new Promise(function (res, rej) {
        const p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.catch) p.catch(rej);
      });
      return buf;
    } catch (e) {
      throw new Error(
        'Format audionya tidak bisa dibuka. Coba ubah ke m4a, mp3, atau wav, atau pakai Chrome (Safari tidak bisa membuka .opus/.ogg).'
      );
    } finally {
      try {
        ctx.close();
      } catch (_) {
        /* abaikan */
      }
    }
  }

  // Mencari potongan: [startSample, endSample] dalam sample rate sumber.
  function planChunks(buf) {
    const sr = buf.sampleRate;
    const ch0 = buf.getChannelData(0);
    const total = buf.length;
    const chunks = [];
    let start = 0;
    while (start < total) {
      let end = Math.min(total, start + Math.floor(TARGET_SEC * sr));
      if (end < total) {
        const lo = Math.max(start + Math.floor(MIN_SEC * sr), end - Math.floor(SEARCH_SEC * sr));
        const frame = Math.floor(0.05 * sr);
        let bestPos = end;
        let bestE = Infinity;
        for (let p = lo; p + frame <= end; p += frame) {
          let e = 0;
          for (let i = p; i < p + frame; i += 4) e += ch0[i] * ch0[i];
          if (e < bestE) {
            bestE = e;
            bestPos = p + (frame >> 1);
          }
        }
        end = bestPos;
      }
      chunks.push([start, end]);
      start = end;
    }
    // Gabungkan potongan terakhir yang terlalu pendek ke potongan sebelumnya.
    if (chunks.length > 1) {
      const last = chunks[chunks.length - 1];
      if ((last[1] - last[0]) / sr < 2) {
        chunks.pop();
        chunks[chunks.length - 1][1] = last[1];
      }
    }
    return chunks;
  }

  function encodeWav(pcm) {
    const bytes = pcm.length * 2;
    const ab = new ArrayBuffer(44 + bytes);
    const dv = new DataView(ab);
    const w = function (o, s) {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, 'RIFF');
    dv.setUint32(4, 36 + bytes, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); // PCM
    dv.setUint16(22, 1, true); // mono
    dv.setUint32(24, OUT_SR, true);
    dv.setUint32(28, OUT_SR * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    w(36, 'data');
    dv.setUint32(40, bytes, true);
    for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
    return new Blob([ab], { type: 'application/octet-stream' });
  }

  // Mengubah sepotong AudioBuffer menjadi WAV mono 16 kHz (rata-rata kanal dan sampel).
  function sliceToWav(buf, a, b) {
    const sr = buf.sampleRate;
    const nch = buf.numberOfChannels;
    const ratio = sr / OUT_SR;
    const n = Math.max(1, Math.floor((b - a) / ratio));
    const pcm = new Int16Array(n);
    const chans = [];
    for (let c = 0; c < nch; c++) chans.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) {
      const s0 = a + Math.floor(i * ratio);
      const s1 = Math.max(s0 + 1, a + Math.floor((i + 1) * ratio));
      let acc = 0;
      let cnt = 0;
      for (let s = s0; s < s1 && s < b; s++) {
        for (let c = 0; c < nch; c++) acc += chans[c][s];
        cnt += nch;
      }
      let v = cnt ? acc / cnt : 0;
      v = Math.max(-1, Math.min(1, v));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return encodeWav(pcm);
  }

  /*
   * opts: {
   *   send(wavBlob, prompt) -> Promise<string>,
   *   onStatus(msg), onProgress(done, total), onChunk(line), isCancelled(),
   *   glossary
   * }
   */
  async function transcribe(blob, opts) {
    opts.onStatus('Menyiapkan audio…');
    const buf = await decode(blob);
    const sr = buf.sampleRate;
    const plan = planChunks(buf);
    const duration = buf.length / sr;
    opts.onStatus('Durasi ' + formatTime(duration) + ', dibagi menjadi ' + plan.length + ' potongan.');
    opts.onProgress(0, plan.length);

    let prevTail = '';
    const lines = [];
    for (let i = 0; i < plan.length; i++) {
      if (opts.isCancelled && opts.isCancelled()) throw new Error('Dibatalkan.');
      const a = plan[i][0];
      const b = plan[i][1];
      opts.onStatus('Mentranskripsi potongan ' + (i + 1) + ' dari ' + plan.length + '…');
      const wav = sliceToWav(buf, a, b);
      const hint = (opts.glossary ? 'Nama dan istilah: ' + opts.glossary + '. ' : '') + prevTail;
      const text = String(await opts.send(wav, hint.slice(-450))).trim();
      if (text) {
        const line = '[' + formatTime(a / sr) + '] ' + text;
        lines.push(line);
        if (opts.onChunk) opts.onChunk(line);
        prevTail = text.slice(-200);
      }
      opts.onProgress(i + 1, plan.length);
    }
    return { text: lines.join('\n\n'), duration: duration, chunks: plan.length };
  }

  function pickRecorderMime() {
    if (!root.MediaRecorder) return '';
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (let i = 0; i < list.length; i++) {
      try {
        if (root.MediaRecorder.isTypeSupported(list[i])) return list[i];
      } catch (_) {
        /* lanjut */
      }
    }
    return '';
  }

  root.MRAAudio = {
    transcribe: transcribe,
    formatTime: formatTime,
    pickRecorderMime: pickRecorderMime,
    _plan: planChunks,
    _slice: sliceToWav,
  };
})(typeof self !== 'undefined' ? self : this);
