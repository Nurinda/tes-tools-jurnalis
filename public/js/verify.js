/*
 * Verify: pemeriksaan hasil AI oleh KODE (bukan AI).
 * - kutipan langsung dicocokkan dengan sumber
 * - angka dan nama yang tidak ada di sumber ditandai
 * - kalimat/angka/nama yang bocor dari contoh tulisan ditandai
 * - frasa klise dan ritme kalimat diperiksa
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Verify = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------- data ---------------------------- */
  const CLICHES = [
    'di era digital', 'di era modern', 'di era globalisasi', 'di zaman sekarang',
    'di tengah derasnya', 'di tengah gempuran', 'di tengah pesatnya',
    'seiring berkembangnya zaman', 'seiring dengan perkembangan zaman',
    'tidak dapat dipungkiri', 'tak dapat dipungkiri', 'tidak bisa dipungkiri',
    'perlu dicatat bahwa', 'penting untuk dicatat', 'penting untuk diingat', 'perlu diingat bahwa',
    'sebagai kesimpulan', 'dapat disimpulkan bahwa', 'kesimpulannya', 'dengan demikian',
    'pada akhirnya', 'secara keseluruhan', 'dalam lanskap', 'lanskap',
    'menjelajahi', 'menyelami', 'mengupas tuntas', 'mengulik',
    'sebuah bukti nyata', 'menjadi bukti bahwa', 'memainkan peran penting', 'memainkan peran krusial',
    'peran krusial', 'game changer', 'tak terelakkan', 'angin segar', 'babak baru',
    'tak hanya itu', 'semoga bermanfaat', 'mari kita', 'yuk simak', 'simak selengkapnya',
    'tentunya', 'sejatinya', 'sebuah langkah besar', 'langkah strategis',
  ];

  const CLICHE_PATTERNS = [
    {
      re: /bukan\s+(?:hanya|sekadar|sekedar|semata)[^.!?\n]{2,70}?,?\s+(?:melainkan|tetapi juga|namun juga|tapi juga)/gi,
      label: 'pola “bukan sekadar X, melainkan Y”',
    },
    { re: /—/g, label: 'tanda pisah panjang (—)' },
  ];

  // Kata berhuruf kapital yang wajar muncul tanpa ada di sumber (label format, platform, hari, bulan).
  const IGNORE_CAPS = new Set([
    'instagram', 'tiktok', 'whatsapp', 'youtube', 'reels', 'shorts', 'threads', 'facebook', 'twitter', 'x',
    'slide', 'tweet', 'visual', 'narasi', 'adegan', 'caption', 'hook', 'judul', 'meta', 'slug', 'tag',
    'catatan', 'subjek', 'pra-tampilan', 'kumparan', 'link', 'perlu', 'diisi', 'tingkat', 'tinggi',
    'sedang', 'rendah', 'ringkasan', 'etik', 'bahasa', 'angle', 'lead', 'rilis', 'draf', 'cover',
    'isi', 'penutup', 'lugas', 'informatif-seo', 'informatif', 'seo', 'rasa', 'data', 'kutipan',
    'pertanyaan', 'dampak', 'naratif', 'singkat', 'konteks', 'newsletter', 'whatsapp', 'channel',
    'nut', 'graf', 'narasumber', 'pewawancara', 'wib', 'wita', 'wit',
    'senin', 'selasa', 'rabu', 'kamis', 'jumat', "jum'at", 'sabtu', 'minggu',
    'januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september',
    'oktober', 'november', 'desember', 'ya', 'rekomendasi', 'tidak', 'ada',
  ]);

  const LABEL_NUM_RE =
    /\b(?:slide|opsi|judul|tweet|bagian|angle|poin|langkah|tahap|nomor|no\.?|variasi|versi|pilihan|adegan|scene|post|utas|thread|kutipan|butir|temuan)\s*#?\s*\d+\b/gi;

  const ABBR = /\b(dr|drs|prof|ir|hj|h|jl|no|rp|st|bpk|sdr|ny|tn|pt|cv|tbk|ltd|inc|dll|dsb|dst|yth|a\.n|u\.p|s\.h|m\.h|s\.e|m\.si|s\.pd|m\.pd|s\.kom)\./gi;

  /* ---------------------------- util ---------------------------- */
  const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

  function normQuotes(s) {
    return String(s).replace(/[“”„‟«»]/g, '"').replace(/[‘’‚‛]/g, "'");
  }
  function foldSpace(s) {
    return normQuotes(s).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function stripPunct(s) {
    return foldSpace(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function words(s) {
    return foldSpace(s).match(WORD_RE) || [];
  }
  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function ngrams(arr, n) {
    const out = [];
    for (let i = 0; i + n <= arr.length; i++) out.push(arr.slice(i, i + n).join(' '));
    return out;
  }
  function ngramSet(arr, n) {
    return new Set(ngrams(arr, n));
  }

  /* --------------------------- kutipan --------------------------- */
  function extractQuotes(output) {
    const qs = [];
    const rest = String(output).replace(/“([^”\n]{4,})”/g, function (_, q) {
      qs.push(q.trim());
      return ' ';
    });
    rest.replace(/"([^"\n]{4,})"/g, function (_, q) {
      qs.push(q.trim());
      return ' ';
    });
    return qs.filter(function (q) {
      return words(q).length >= 2;
    });
  }

  function timeAt(srcFold, idx) {
    const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    let m;
    let last = null;
    while ((m = re.exec(srcFold)) && m.index <= idx) last = m[1];
    return last;
  }

  function matchQuote(q, ctx) {
    const qf = foldSpace(q);
    const pieces = qf
      .split(/\s*(?:\.{3}|…|\[…\]|\[\.\.\.\])\s*/)
      .map(function (p) {
        return p.replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '');
      })
      .filter(function (p) {
        return p.length >= 4;
      });
    if (!pieces.length) return { status: 'missing' };

    // 1) persis (abaikan huruf besar/kecil dan spasi)
    let firstIdx = -1;
    let all = true;
    for (let i = 0; i < pieces.length; i++) {
      const idx = ctx.srcFold.indexOf(pieces[i]);
      if (idx < 0) {
        all = false;
        break;
      }
      if (i === 0) firstIdx = idx;
    }
    if (all) return { status: 'exact', time: timeAt(ctx.srcFold, firstIdx) };

    // 2) persis jika tanda baca diabaikan
    const qp = stripPunct(q.replace(/\s*(?:\.{3}|…)\s*/g, ' '));
    if (qp && (' ' + ctx.srcPunct + ' ').indexOf(' ' + qp + ' ') >= 0) {
      return { status: 'exact', note: 'beda tanda baca' };
    }

    // 3) mirip: sebagian besar trigram kata ada di sumber
    const w = qp.split(' ').filter(Boolean);
    if (w.length >= 4) {
      const grams = ngrams(w, 3);
      let hit = 0;
      grams.forEach(function (g) {
        if (ctx.srcTri.has(g)) hit++;
      });
      const score = hit / grams.length;
      if (score >= 0.75) return { status: 'similar', score: Math.round(score * 100) };
    }
    return { status: 'missing' };
  }

  /* ---------------------------- angka ---------------------------- */
  function stripForNumbers(s, isOutput) {
    let t = String(s)
      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ')
      .replace(/\(≈\s*\d{1,2}:\d{2}(?::\d{2})?\)/g, ' ');
    if (isOutput) {
      t = t
        .replace(/^\s*(?:\d+[.)]|[-*•])\s+/gm, '')
        .replace(LABEL_NUM_RE, ' ')
        .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
        .replace(/\(\s*\d+\s*karakter[^)]*\)/gi, ' ');
    }
    return t;
  }
  function normNum(raw) {
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) return raw.replace(/[.,]/g, '');
    return raw.replace(',', '.');
  }
  function numberMap(text) {
    const m = new Map();
    const re = /\d+(?:[.,]\d+)*/g;
    let x;
    while ((x = re.exec(text))) {
      const n = normNum(x[0]);
      if (!m.has(n)) m.set(n, new Set());
      m.get(n).add(x[0]);
    }
    return m;
  }

  /* ---------------------------- nama ---------------------------- */
  function isUpper(ch) {
    return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  }
  function capitalTokens(text) {
    const t = String(text).replace(/[*_`]/g, ' ');
    const re = /\p{L}[\p{L}\p{N}]*(?:['’-][\p{L}\p{N}]+)*/gu;
    const found = [];
    let m;
    while ((m = re.exec(t))) found.push({ w: m[0], i: m.index, end: m.index + m[0].length });
    const out = [];
    for (let k = 0; k < found.length; k++) {
      const w = found[k].w;
      const i = found[k].i;
      if (w.length < 2 || !isUpper(w[0])) continue;
      const allCaps = w === w.toUpperCase() && /\p{L}{2,}/u.test(w);
      const lineStart = t.lastIndexOf('\n', i - 1) + 1;
      const prefix = t
        .slice(lineStart, i)
        .replace(/^\s*(?:\d+[.)]|[-•]|#+)\s*/, '')
        .replace(/[\s"“”'‘’(\[>]+$/u, '');
      const sentStart = prefix === '' || /[.!?:;]$/.test(prefix);
      // Kata pertama kalimat selalu berhuruf kapital, jadi diabaikan.
      // Nama lengkap di awal kalimat tetap tertangkap lewat kata berikutnya.
      if (sentStart && !allCaps) continue;
      if (IGNORE_CAPS.has(w.toLowerCase())) continue;
      out.push(w);
    }
    return out;
  }

  /* --------------------------- kalimat --------------------------- */
  function splitSentences(text) {
    const protectedText = String(text).replace(ABBR, function (m) {
      return m.slice(0, -1) + '\u2234';
    });
    return protectedText
      .replace(/([.!?…]["”’)]*)\s+(?=["“(\[]?\p{Lu})/gu, '$1\u0001')
      .split('\u0001')
      .map(function (s) {
        return s.replace(/\u2234/g, '.').trim();
      })
      .filter(Boolean);
  }

  function styleStats(text) {
    const paras = String(text)
      .split(/\n\s*\n/)
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);
    const lens = [];
    const perPara = [];
    let quoted = 0;
    paras.forEach(function (p) {
      const ss = splitSentences(p);
      perPara.push(ss.length);
      ss.forEach(function (s) {
        const n = (s.match(WORD_RE) || []).length;
        if (n > 0) {
          lens.push(n);
          if (/[“"][^”"]{6,}[”"]/.test(s)) quoted++;
        }
      });
    });
    if (!lens.length) return { sentences: 0 };
    const sum = lens.reduce(function (a, b) { return a + b; }, 0);
    const avg = sum / lens.length;
    const variance = lens.reduce(function (a, b) { return a + (b - avg) * (b - avg); }, 0) / lens.length;
    const sorted = lens.slice().sort(function (a, b) { return a - b; });
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      sentences: lens.length,
      avg: +avg.toFixed(1),
      median: median,
      cv: +(Math.sqrt(variance) / avg).toFixed(2),
      shortShare: Math.round((100 * lens.filter(function (n) { return n <= 8; }).length) / lens.length),
      longShare: Math.round((100 * lens.filter(function (n) { return n >= 25; }).length) / lens.length),
      perPara: +(perPara.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, perPara.length)).toFixed(1),
      quoteShare: Math.round((100 * quoted) / lens.length),
      emDash: (String(text).match(/—/g) || []).length,
    };
  }

  function proseOnly(text) {
    return String(text)
      .split('\n')
      .filter(function (l) {
        const t = l.trim();
        if (!t) return true;
        if (/^(#|[-*•]\s|\d+[.)]\s|>)/.test(t)) return false;
        return (t.match(WORD_RE) || []).length >= 8;
      })
      .join('\n');
  }

  /* ----------------------------- run ----------------------------- */
  function run(opts) {
    const output = opts.output || '';
    const source = opts.source || '';
    const styleSamples = opts.styleSamples || [];
    const modes = opts.modes || {};
    const styleText = styleSamples.join('\n');

    const srcFold = foldSpace(source);
    const srcPunct = stripPunct(source);
    const ctx = { srcFold: srcFold, srcPunct: srcPunct, srcTri: ngramSet(srcPunct.split(' ').filter(Boolean), 3) };

    const report = { quotes: [], numbers: [], names: [], leaks: [], cliches: [], rhythm: null, modes: modes };

    if (modes.quotes) {
      extractQuotes(output).forEach(function (q) {
        report.quotes.push(Object.assign({ text: q }, matchQuote(q, ctx)));
      });
    }

    if (modes.numbers) {
      const src = numberMap(stripForNumbers(source, false));
      const out = numberMap(stripForNumbers(output, true));
      const sty = numberMap(stripForNumbers(styleText, false));
      out.forEach(function (raws, n) {
        if (!src.has(n)) {
          const list = Array.from(raws);
          report.numbers.push({ token: list[0], raws: list, leak: sty.has(n) });
        }
      });
    }

    if (modes.names) {
      const srcWords = new Set(words(source));
      const styWords = new Set(words(styleText));
      const seen = new Map();
      capitalTokens(output).forEach(function (w) {
        const lw = foldSpace(w);
        if (srcWords.has(lw)) return;
        if (seen.has(lw)) {
          seen.get(lw).count++;
        } else {
          seen.set(lw, { word: w, count: 1, leak: styWords.has(lw) });
        }
      });
      seen.forEach(function (v) {
        report.names.push(v);
      });
    }

    if (modes.leak && styleSamples.length) {
      const N = 7;
      const sw = ngramSet(words(styleText), N);
      const ow = words(output);
      let i = 0;
      while (i + N <= ow.length) {
        if (sw.has(ow.slice(i, i + N).join(' '))) {
          let j = i;
          while (j + 1 + N <= ow.length && sw.has(ow.slice(j + 1, j + 1 + N).join(' '))) j++;
          const phrase = ow.slice(i, j + N).join(' ');
          if ((' ' + srcPunct + ' ').indexOf(' ' + stripPunct(phrase) + ' ') < 0) {
            report.leaks.push({ phrase: phrase });
          }
          i = j + N;
        } else {
          i++;
        }
      }
    }

    if (modes.cliche) {
      const lower = output.toLowerCase();
      CLICHES.forEach(function (c) {
        let count = 0;
        let from = 0;
        for (;;) {
          const k = lower.indexOf(c, from);
          if (k < 0) break;
          count++;
          from = k + c.length;
        }
        if (count) report.cliches.push({ label: c, count: count, found: [c] });
      });
      CLICHE_PATTERNS.forEach(function (p) {
        const ms = output.match(p.re) || [];
        if (ms.length) report.cliches.push({ label: p.label, count: ms.length, found: Array.from(new Set(ms)) });
      });
    }

    if (modes.rhythm) {
      const st = styleStats(proseOnly(output));
      if (st.sentences >= 6) {
        const hints = [];
        if (st.cv < 0.35) hints.push('Panjang kalimat cukup seragam. Selingi kalimat pendek dengan yang lebih panjang.');
        if (opts.styleStats && opts.styleStats.avg) {
          const diff = Math.abs(st.avg - opts.styleStats.avg) / opts.styleStats.avg;
          if (diff > 0.35) {
            hints.push(
              'Rata-rata ' + st.avg + ' kata per kalimat, sedangkan contoh tulisan sekitar ' + opts.styleStats.avg + '.'
            );
          }
        }
        report.rhythm = { stats: st, sample: opts.styleStats || null, hints: hints };
      }
    }

    report.summary = summarize(report);
    return report;
  }

  function summarize(r) {
    const s = {
      quotesExact: r.quotes.filter(function (q) { return q.status === 'exact'; }).length,
      quotesSimilar: r.quotes.filter(function (q) { return q.status === 'similar'; }).length,
      quotesMissing: r.quotes.filter(function (q) { return q.status === 'missing'; }).length,
      numbers: r.numbers.length,
      names: r.names.length,
      leaks: r.leaks.length + r.numbers.filter(function (n) { return n.leak; }).length + r.names.filter(function (n) { return n.leak; }).length,
      cliches: r.cliches.reduce(function (a, c) { return a + c.count; }, 0),
    };
    s.level = s.quotesMissing || s.leaks ? 'bad' : s.quotesSimilar || s.numbers || s.names ? 'warn' : 'ok';
    return s;
  }

  /* -------------------------- penandaan -------------------------- */
  function looseRe(phrase) {
    const ws = words(phrase);
    if (!ws.length) return null;
    return new RegExp(ws.map(escapeRe).join('[^\\p{L}\\p{N}]+'), 'giu');
  }

  function applySpecs(rootEl, specs) {
    const doc = rootEl.ownerDocument;
    const isAl = function (c) {
      return !!c && /[\p{L}\p{N}]/u.test(c);
    };
    specs.forEach(function (spec) {
      if (!spec.re) return;
      const walker = doc.createTreeWalker(rootEl, 4 /* SHOW_TEXT */);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        const text = node.nodeValue;
        spec.re.lastIndex = 0;
        let m;
        let last = 0;
        let frag = null;
        while ((m = spec.re.exec(text))) {
          if (!m[0]) {
            spec.re.lastIndex++;
            continue;
          }
          if (spec.boundary && (isAl(text[m.index - 1]) || isAl(text[m.index + m[0].length]))) continue;
          frag = frag || doc.createDocumentFragment();
          if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
          const mark = doc.createElement('mark');
          mark.className = spec.cls;
          mark.title = spec.title;
          mark.textContent = m[0];
          frag.appendChild(mark);
          last = m.index + m[0].length;
        }
        if (frag) {
          if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
          node.parentNode.replaceChild(frag, node);
        }
      });
    });
  }

  function highlight(rootEl, report, auditItems) {
    const specs = [];
    report.quotes.forEach(function (q) {
      const cls = q.status === 'exact' ? 'm-ok' : q.status === 'similar' ? 'm-warn' : 'm-bad';
      const title =
        q.status === 'exact'
          ? 'Kutipan cocok dengan sumber'
          : q.status === 'similar'
          ? 'Kutipan mirip tetapi tidak persis. Cek ke sumber'
          : 'Kutipan TIDAK ditemukan di sumber';
      specs.push({ re: looseRe(q.text), cls: cls, title: title });
    });
    report.leaks.forEach(function (l) {
      specs.push({ re: looseRe(l.phrase), cls: 'm-bad', title: 'Mirip kalimat dari contoh tulisan' });
    });
    report.numbers.forEach(function (n) {
      n.raws.forEach(function (raw) {
        specs.push({
          re: new RegExp(escapeRe(raw), 'g'),
          boundary: true,
          cls: n.leak ? 'm-bad' : 'm-warn',
          title: n.leak ? 'Angka ini ada di contoh tulisan, bukan di sumber' : 'Angka tidak ditemukan di sumber',
        });
      });
    });
    report.names.forEach(function (n) {
      specs.push({
        re: new RegExp(escapeRe(n.word), 'g'),
        boundary: true,
        cls: n.leak ? 'm-bad' : 'm-warn',
        title: n.leak ? 'Nama/istilah ini ada di contoh tulisan, bukan di sumber' : 'Nama/istilah tidak ditemukan di sumber',
      });
    });
    report.cliches.forEach(function (c) {
      c.found.forEach(function (f) {
        specs.push({ re: new RegExp(escapeRe(f), 'gi'), cls: 'm-cliche', title: 'Frasa klise atau pola khas tulisan mesin' });
      });
    });
    (auditItems || []).forEach(function (a) {
      if (a && a.klaim && words(a.klaim).length >= 3) {
        specs.push({ re: looseRe(a.klaim), cls: 'm-audit', title: 'Auditor AI: ' + (a.alasan || 'tidak didukung sumber') });
      }
    });
    applySpecs(rootEl, specs);
  }

  return {
    run: run,
    highlight: highlight,
    mark: applySpecs,
    styleStats: styleStats,
    extractQuotes: extractQuotes,
    matchQuote: matchQuote,
    capitalTokens: capitalTokens,
    splitSentences: splitSentences,
    foldSpace: foldSpace,
    stripPunct: stripPunct,
    words: words,
    CLICHES: CLICHES,
  };
});
