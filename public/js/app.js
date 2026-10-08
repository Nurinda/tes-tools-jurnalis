/* Meja Redaksi kumparan - antarmuka dan alur kerja */
(function () {
  'use strict';

  /* ===================================================================
   * Utilitas
   * =================================================================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtNum = (n) => Number(n).toLocaleString('id-ID');

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n && k !== 'list' && k !== 'form') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => {
      if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    });
    return n;
  }

  const LS = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (_) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (_) {
        toast('Gagal menyimpan. Penyimpanan browser mungkin penuh atau sedang dimatikan.');
        return false;
      }
    },
  };

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 3400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px' });
      document.body.append(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (__) {
        /* abaikan */
      }
      ta.remove();
    }
    toast('Sudah disalin.');
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ===================================================================
   * API
   * =================================================================== */
  const state = { audit: LS.get('mra.audit', true), info: null };

  const Api = {
    pw: '',
    headers(extra) {
      return Object.assign({ 'x-app-password': encodeURIComponent(this.pw) }, extra || {});
    },
    async call(path, init) {
      let res;
      try {
        res = await fetch('/api/' + path, init);
      } catch (_) {
        throw new Error('Gagal tersambung ke server. Coba cek koneksi internetmu.');
      }
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (_) {
        /* bukan JSON */
      }
      if (res.status === 401 && path !== 'auth') {
        showLogin('Sesimu sudah habis. Silakan masuk lagi.');
        throw new Error('Kata sandi salah atau sesimu sudah habis.');
      }
      if (!res.ok) {
        let msg = data && data.error;
        if (!msg) {
          msg =
            res.status >= 500
              ? 'Server kelamaan merespons. Coba lagi dengan teks yang lebih pendek.'
              : 'Ada yang tidak beres (kode ' + res.status + '). Coba lagi.';
        }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return data;
    },
    json(path, body) {
      return this.call(path, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    },
    bin(path, blob, extra) {
      return this.call(path, {
        method: 'POST',
        headers: this.headers(Object.assign({ 'Content-Type': 'application/octet-stream' }, extra || {})),
        body: blob,
      });
    },
  };

  /* ===================================================================
   * Profil gaya (disimpan di browser)
   * =================================================================== */
  const Profiles = {
    all() {
      return LS.get('mra.profiles', []);
    },
    save(list) {
      return LS.set('mra.profiles', list);
    },
    get(id) {
      return this.all().find((p) => p.id === id);
    },
    activeId() {
      return LS.get('mra.activeProfile', '');
    },
    setActive(id) {
      LS.set('mra.activeProfile', id || '');
    },
  };

  const styleSelects = [];
  function refreshStyleSelects() {
    styleSelects.forEach((s) => s.fill());
  }

  function makeStyleSelect(idBase) {
    const sel = el('select', { id: idBase + '-style' });
    const info = el('p', { class: 'hint' });
    function describe() {
      const p = Profiles.get(sel.value);
      info.textContent = p
        ? p.samples.length + ' contoh tulisan' + (p.summary ? ', ringkasan gaya terisi.' : '.')
        : 'Kalau tidak pilih profil, hasilnya ditulis dengan gaya berita yang netral. Profil bisa dibuat di menu Profil gaya.';
    }
    function fill() {
      const list = Profiles.all();
      const act = Profiles.activeId();
      sel.replaceChildren(
        el('option', { value: '', text: 'Tanpa profil gaya' }),
        ...list.map((p) => el('option', { value: p.id, text: p.name }))
      );
      sel.value = list.some((p) => p.id === act) ? act : '';
      describe();
    }
    sel.addEventListener('change', () => {
      Profiles.setActive(sel.value);
      refreshStyleSelects();
    });
    styleSelects.push({ fill });
    fill();
    return {
      node: el('div', { class: 'field' }, el('label', { for: sel.id, text: 'Profil gaya' }), sel, info),
      get() {
        const p = Profiles.get(sel.value);
        return p ? { name: p.name, summary: p.summary || '', samples: p.samples || [] } : null;
      },
    };
  }

  /* ===================================================================
   * Markdown mini
   * =================================================================== */
  const Md = {
    inline(s) {
      return esc(s)
        .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>');
    },
    render(md) {
      const lines = String(md).replace(/\r/g, '').split('\n');
      let html = '';
      let list = null;
      let para = [];
      let quote = [];
      const flushPara = () => {
        if (para.length) html += '<p>' + para.map(Md.inline).join('<br>') + '</p>';
        para = [];
      };
      const flushQuote = () => {
        if (quote.length) html += '<blockquote>' + quote.map(Md.inline).join('<br>') + '</blockquote>';
        quote = [];
      };
      const closeList = () => {
        if (list) html += '</' + list + '>';
        list = null;
      };
      const flushAll = () => {
        flushPara();
        flushQuote();
        closeList();
      };
      lines.forEach((raw) => {
        const line = raw.trimEnd();
        let m;
        if (!line.trim()) return flushAll();
        if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
          flushAll();
          const lv = Math.min(m[1].length + 1, 5);
          html += '<h' + lv + '>' + Md.inline(m[2]) + '</h' + lv + '>';
          return;
        }
        if (/^\s*---+\s*$/.test(line)) {
          flushAll();
          html += '<hr>';
          return;
        }
        if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
          flushPara();
          flushQuote();
          if (list !== 'ul') {
            closeList();
            html += '<ul>';
            list = 'ul';
          }
          html += '<li>' + Md.inline(m[1]) + '</li>';
          return;
        }
        if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
          flushPara();
          flushQuote();
          if (list !== 'ol') {
            closeList();
            html += '<ol start="' + m[1] + '">';
            list = 'ol';
          }
          html += '<li>' + Md.inline(m[2]) + '</li>';
          return;
        }
        if ((m = line.match(/^>\s?(.*)$/))) {
          flushPara();
          closeList();
          quote.push(m[1]);
          return;
        }
        flushQuote();
        closeList();
        para.push(line.trim());
      });
      flushAll();
      return html;
    },
  };

  /* Menambah hitungan karakter pada judul dan tweet (untuk tampilan saja). */
  function decorate(raw, tabId) {
    if (tabId === 'headline') {
      return raw.replace(/^(\s*\d+\.\s*\[[^\]]+\]\s*)(.+?)(\s*\|\s*clickbait:.*)$/gim, (m, a, t, c) => {
        const n = t.trim().length;
        return a + t.trim() + ' *(' + n + ' karakter' + (n > 70 ? ', agak panjang' : '') + ')*' + c;
      });
    }
    if (tabId === 'repurpose') {
      return raw.replace(/^(\s*\**Tweet\s*\d+\**\s*[:.]\**\s*)(.+)$/gim, (m, a, t) => {
        const n = t.trim().length;
        return a + t.trim() + ' *(' + n + ' karakter' + (n > 280 ? ', melebihi 280' : '') + ')*';
      });
    }
    return raw;
  }

  /* ===================================================================
   * Konfigurasi fitur
   * =================================================================== */
  const PLATFORMS = [
    { id: 'instagram', label: 'Caption Instagram' },
    { id: 'carousel', label: 'Carousel Instagram' },
    { id: 'xthread', label: 'Thread X' },
    { id: 'video', label: 'Skrip video pendek' },
    { id: 'whatsapp', label: 'WhatsApp Channel' },
    { id: 'newsletter', label: 'Newsletter' },
  ];

  const NOTES_FIELD = {
    id: 'notes',
    type: 'textarea',
    label: 'Konteks dari jurnalis (opsional)',
    rows: 3,
    hint: 'Misalnya nama dan jabatan narasumber, lokasi, tanggal, atau topik. Pastikan isinya benar, karena bagian ini dipakai apa adanya.',
    placeholder: 'Contoh: Wawancara dengan Kepala Dinas Pendidikan Kota X, Selasa 6 Oktober, di Balai Kota.',
  };

  const TABS = [
    {
      id: 'check',
      label: 'Cek naskah',
      title: 'Cek naskah sebelum tayang',
      desc: 'Bantu cari potensi pelanggaran etik, salah bahasa, bagian yang tidak konsisten, dan klaim yang masih perlu dicek. Pengecekan faktanya tetap tugasmu.',
      task: 'check',
      cta: 'Periksa naskah',
      fields: [{ id: 'text', type: 'textarea', label: 'Naskah', rows: 16, required: true, placeholder: 'Tempel naskah berita di sini…' }],
      parts: () => ['etik', 'bahasa'],
      style: false,
      audit: false,
      verify: { quotes: true },
    },
    {
      id: 'headline',
      label: 'Judul dan SEO',
      title: 'Judul dan SEO',
      desc: 'Dapatkan sepuluh pilihan judul dengan gaya berbeda, plus meta description, tag, dan slug. Semua judul tetap berpegang pada isi naskah.',
      task: 'headline',
      cta: 'Buat judul dan SEO',
      fields: [{ id: 'text', type: 'textarea', label: 'Naskah', rows: 14, required: true, placeholder: 'Tempel naskah berita di sini…' }],
      parts: () => ['judul'],
      style: true,
      audit: true,
      verify: { quotes: true, numbers: true, names: true, leak: true, cliche: true },
    },
    {
      id: 'repurpose',
      label: 'Sebar konten',
      title: 'Sebar konten',
      desc: 'Olah satu berita jadi konten media sosial dan newsletter, tanpa menambah klaim yang tidak ada di berita aslinya.',
      task: 'repurpose',
      cta: 'Buat konten',
      fields: [
        { id: 'text', type: 'textarea', label: 'Berita jadi', rows: 12, required: true, placeholder: 'Tempel berita yang sudah tayang atau siap tayang…' },
        { id: 'platforms', type: 'checks', label: 'Platform', options: PLATFORMS },
      ],
      parts: (v) => v.platforms,
      style: true,
      audit: true,
      verify: { quotes: true, numbers: true, names: true, leak: true, cliche: true },
    },
    {
      id: 'transcript',
      label: 'Transkrip ke berita',
      title: 'Transkrip ke bahan berita',
      desc: 'Tempel transkrip wawancara atau konferensi pers, lalu dapatkan ringkasan, kutipan paling kuat beserta konteksnya, pilihan angle, dan kerangka berita.',
      task: 'transcript',
      cta: 'Buat bahan berita',
      fields: [
        { id: 'text', type: 'textarea', label: 'Transkrip', rows: 14, required: true, placeholder: 'Tempel transkrip wawancara di sini. Kalau ada nama pembicara atau penanda waktu seperti [03:25], biarkan saja.' },
        NOTES_FIELD,
        { id: 'withDraft', type: 'check', label: 'Sertakan draf berita lengkap' },
      ],
      parts: (v) => ['ringkasan', 'angle'].concat(v.withDraft ? ['draf'] : []),
      style: true,
      audit: true,
      verify: { quotes: true, numbers: true, names: true, leak: true, cliche: true, rhythm: true },
    },
    {
      id: 'release',
      label: 'Rilis ke berita',
      title: 'Siaran pers ke draf berita',
      desc: 'Ubah rilis jadi draf berita yang netral. Klaim sepihak yang perlu dikonfirmasi ikut ditandai, lengkap dengan usulan pertanyaan untuk narasumber pembanding.',
      task: 'release',
      cta: 'Buat draf dari rilis',
      fields: [
        { id: 'text', type: 'textarea', label: 'Siaran pers', rows: 14, required: true, placeholder: 'Tempel siaran pers di sini…' },
        NOTES_FIELD,
      ],
      parts: () => ['draf', 'konfirmasi'],
      style: true,
      audit: true,
      verify: { quotes: true, numbers: true, names: true, leak: true, cliche: true, rhythm: true },
    },
    {
      id: 'voice',
      label: 'Suara ke berita',
      title: 'Suara ke bahan berita',
      desc: 'Rekam atau unggah audio, cek transkripnya, lalu olah jadi bahan berita. Audionya tidak disimpan di server.',
      task: 'transcript',
      cta: 'Buat bahan berita',
      fromAudio: true,
      fields: [
        { id: 'text', type: 'textarea', label: 'Transkrip (periksa dan koreksi sebelum diolah)', rows: 14, required: true, placeholder: 'Transkrip muncul di sini. Nama, angka, dan istilah sering salah tangkap, jadi cek dulu ya.' },
        NOTES_FIELD,
        { id: 'withDraft', type: 'check', label: 'Sertakan draf berita lengkap' },
      ],
      parts: (v) => ['ringkasan', 'angle'].concat(v.withDraft ? ['draf'] : []),
      style: true,
      audit: true,
      verify: { quotes: true, numbers: true, names: true, leak: true, cliche: true, rhythm: true },
    },
  ];

  /* ===================================================================
   * Pembangun tampilan fitur
   * =================================================================== */
  const views = {}; // id -> {section, ctx}

  function buildTool(tab) {
    const ctx = { tab, fields: {}, last: null, busy: false };
    const section = el('section', { class: 'tool', id: 'tab-' + tab.id, hidden: true, 'aria-label': tab.title });
    const inputs = el('div', { class: 'panel-in' });
    const out = el('div', { class: 'panel-out' });
    const resultEl = el('div', { class: 'result' });
    ctx.resultEl = resultEl;

    inputs.append(el('h1', { text: tab.title }), el('p', { class: 'lead', text: tab.desc }));

    if (tab.pre) inputs.append(tab.pre(ctx));

    tab.fields.forEach((f) => {
      const id = tab.id + '-' + f.id;
      if (f.type === 'textarea') {
        const ta = el('textarea', { id, rows: f.rows || 10, placeholder: f.placeholder || '', spellcheck: true });
        const count = el('span', { class: 'count', text: '0 kata' });
        ta.addEventListener('input', () => {
          const n = (ta.value.trim().match(/\S+/g) || []).length;
          count.textContent = fmtNum(n) + ' kata';
        });
        ctx.fields[f.id] = { ta, get: () => ta.value };
        inputs.append(
          el(
            'div',
            { class: 'field' },
            el('div', { class: 'label-row' }, el('label', { for: id, text: f.label }), count),
            f.hint ? el('p', { class: 'hint', text: f.hint }) : null,
            ta
          )
        );
        if (f.id === 'text' && tab.afterText) inputs.append(tab.afterText(ctx));
      } else if (f.type === 'checks') {
        const boxes = f.options.map((o) => {
          const cb = el('input', { type: 'checkbox', value: o.id, checked: true });
          return { cb, node: el('label', { class: 'check' }, cb, el('span', { text: o.label })) };
        });
        ctx.fields[f.id] = { get: () => boxes.filter((b) => b.cb.checked).map((b) => b.cb.value) };
        inputs.append(el('fieldset', { class: 'field checks' }, el('legend', { text: f.label }), ...boxes.map((b) => b.node)));
      } else if (f.type === 'check') {
        const cb = el('input', { type: 'checkbox', id });
        ctx.fields[f.id] = { get: () => cb.checked };
        inputs.append(el('label', { class: 'check single', for: id }, cb, el('span', { text: f.label })));
      }
    });

    let styleSel = null;
    if (tab.style) {
      styleSel = makeStyleSelect(tab.id);
      inputs.append(styleSel.node);
    }

    const status = el('p', { class: 'status', role: 'status' });
    const runBtn = el('button', { class: 'btn primary', type: 'button', text: tab.cta });
    ctx.status = (msg, kind) => {
      status.textContent = msg || '';
      status.className = 'status' + (kind ? ' ' + kind : '') + (msg && kind === 'busy' ? ' busy' : '');
    };
    ctx.setBusy = (b) => {
      ctx.busy = b;
      runBtn.disabled = b;
    };
    ctx.values = () => {
      const v = { notes: '', platforms: [], withDraft: false };
      Object.keys(ctx.fields).forEach((k) => {
        v[k] = ctx.fields[k].get();
      });
      v.text = v.text || '';
      v.notes = v.notes || '';
      v.style = styleSel ? styleSel.get() : null;
      return v;
    };
    runBtn.addEventListener('click', () => runTool(tab, ctx));

    inputs.append(
      el('div', { class: 'actions' }, runBtn, status),
      el('p', { class: 'fine', text: 'Teks yang kamu tempel dikirim ke layanan pihak ketiga untuk diolah dan tidak kami simpan. Hindari memasukkan materi embargo atau data pribadi narasumber.' })
    );

    resultEl.append(
      el('div', { class: 'empty' }, el('p', { class: 'empty-title', text: 'Hasilnya nanti muncul di sini' }), el('p', { text: 'Kutipan, angka, dan nama di hasil langsung dicocokkan dengan bahanmu. Yang tidak cocok akan ditandai.' }))
    );
    out.append(resultEl);
    section.append(inputs, out);
    views[tab.id] = { section, ctx };
    return section;
  }

  /* ===================================================================
   * Alur menjalankan tugas
   * =================================================================== */
  async function runTool(tab, ctx, onlyFailed) {
    if (ctx.busy) return;
    const v = onlyFailed && ctx.last ? ctx.last.v : ctx.values();
    if (!v.text.trim()) {
      toast('Tempel bahannya dulu.');
      ctx.fields.text.ta.focus();
      return;
    }
    const order = onlyFailed && ctx.last ? ctx.last.order : tab.parts(v);
    if (!order.length) {
      toast('Pilih setidaknya satu platform.');
      return;
    }

    const outputs = onlyFailed && ctx.last ? ctx.last.outputs : {};
    const todo = order.filter((p) => !outputs[p] || outputs[p].error);

    ctx.setBusy(true);
    ctx.status('Sedang menulis… 0 dari ' + todo.length + ' bagian', 'busy');
    if (!onlyFailed) {
      ctx.resultEl.replaceChildren(
        el('div', { class: 'empty' }, el('p', { class: 'empty-title', text: 'Sebentar, sedang disiapkan…' }), el('p', { text: 'Biasanya cuma butuh beberapa detik.' }))
      );
    }

    try {
      let done = 0;
      const queue = todo.slice();
      const worker = async () => {
        while (queue.length) {
          const part = queue.shift();
          try {
            const r = await Api.json('generate', {
              task: tab.task,
              part,
              payload: { text: v.text, notes: v.notes, style: v.style, fromAudio: !!tab.fromAudio },
            });
            if (!r.text) throw new Error('Hasilnya kosong. Coba ulangi.');
            outputs[part] = { text: r.text, truncated: !!r.truncated };
          } catch (e) {
            outputs[part] = { error: e.message };
          }
          done++;
          ctx.status('Sedang menulis… ' + done + ' dari ' + todo.length + ' bagian', 'busy');
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));

      const L = { v, order, outputs, editing: false, audit: null };
      L.raw = assemble(L);
      ctx.last = L;

      if (!L.raw) {
        const firstErr = order.map((p) => outputs[p] && outputs[p].error).find(Boolean) || 'Belum ada hasil.';
        ctx.resultEl.replaceChildren(el('div', { class: 'error-box' }, el('strong', { text: 'Hasilnya belum berhasil dibuat. ' }), firstErr));
        ctx.status('');
        return;
      }

      verifyLocal(tab, L);
      renderSheet(tab, ctx);

      if (state.audit && tab.audit) {
        ctx.status('Mengecek ulang draf dengan bahan sumber…', 'busy');
        await runAudit(tab, ctx);
      }
      ctx.status('Beres.', 'ok');
    } catch (e) {
      ctx.status('');
      toast(e.message);
    } finally {
      ctx.setBusy(false);
    }
  }

  function assemble(L) {
    return L.order
      .map((p) => L.outputs[p] && L.outputs[p].text)
      .filter(Boolean)
      .join('\n\n');
  }

  function verifyLocal(tab, L) {
    const samples = L.v.style ? L.v.style.samples || [] : [];
    const sStats = samples.length ? Verify.styleStats(samples.join('\n\n')) : null;
    L.report = Verify.run({
      output: L.raw,
      source: L.v.text + '\n' + (L.v.notes || ''),
      styleSamples: samples,
      styleStats: sStats,
      modes: tab.verify,
    });
  }

  async function runAudit(tab, ctx) {
    const L = ctx.last;
    if (!L || !L.raw) return;
    L.audit = { status: 'running' };
    renderSheet(tab, ctx);
    try {
      const r = await Api.json('generate', {
        task: 'audit',
        part: 'audit',
        payload: { text: L.v.text + (L.v.notes ? '\n\n[Catatan jurnalis]\n' + L.v.notes : ''), draft: L.raw },
      });
      if (r.data && Array.isArray(r.data.temuan)) {
        L.audit = { status: 'ok', items: r.data.temuan.filter((t) => t && t.klaim), note: r.data.catatan || '' };
      } else {
        L.audit = { status: 'error', error: 'Hasil cek ulang tidak bisa dibaca. Coba jalankan lagi.' };
      }
    } catch (e) {
      L.audit = { status: 'error', error: e.message };
    }
    renderSheet(tab, ctx);
  }

  /* ===================================================================
   * Tampilan hasil dan laporan verifikasi
   * =================================================================== */
  function chip(text, kind) {
    return el('span', { class: 'chip chip-' + kind, text });
  }

  function verdictBar(tab, L) {
    const r = L.report;
    const s = r.summary;
    const m = tab.verify;
    const chips = [];
    if (m.quotes) {
      if (r.quotes.length) {
        chips.push(chip('Kutipan: ' + s.quotesExact + ' cocok', s.quotesExact ? 'ok' : 'muted'));
        if (s.quotesSimilar) chips.push(chip(s.quotesSimilar + ' mirip', 'warn'));
        if (s.quotesMissing) chips.push(chip(s.quotesMissing + ' tidak ditemukan', 'bad'));
      } else {
        chips.push(chip('Tanpa kutipan langsung', 'muted'));
      }
    }
    if (m.numbers) chips.push(s.numbers ? chip(s.numbers + ' angka tak ada di sumber', 'warn') : chip('Semua angka ada di sumber', 'ok'));
    if (m.names) chips.push(s.names ? chip(s.names + ' nama tak ada di sumber', 'warn') : chip('Semua nama ada di sumber', 'ok'));
    if (m.leak && L.v.style && (L.v.style.samples || []).length) {
      chips.push(s.leaks ? chip(s.leaks + ' bagian terbawa dari contoh', 'bad') : chip('Tidak ada yang terbawa dari contoh', 'ok'));
    }
    if (m.cliche) chips.push(s.cliches ? chip(s.cliches + ' frasa klise', 'cliche') : chip('Tidak ada frasa klise', 'ok'));
    if (tab.audit) {
      const a = L.audit;
      if (!a) chips.push(chip('Belum dicek ulang', 'muted'));
      else if (a.status === 'running') chips.push(chip('Sedang dicek ulang…', 'muted'));
      else if (a.status === 'ok') chips.push(a.items.length ? chip('Cek ulang: ' + a.items.length + ' temuan', 'bad') : chip('Cek ulang: aman', 'ok'));
      else chips.push(chip('Cek ulang gagal', 'muted'));
    }
    return el('div', { class: 'verdict' }, ...chips);
  }

  function reportBlock(title, hint, body, open) {
    const d = el('details', { class: 'rep', open: !!open }, el('summary', { text: title }), el('p', { class: 'hint', text: hint }), body);
    return d;
  }

  function buildReport(tab, ctx) {
    const L = ctx.last;
    const r = L.report;
    const m = tab.verify;
    const blocks = [];

    if (m.quotes) {
      const body = r.quotes.length
        ? el(
            'ul',
            { class: 'rows' },
            ...r.quotes.map((q) => {
              const label = q.status === 'exact' ? 'cocok' : q.status === 'similar' ? 'mirip' : 'tidak ditemukan';
              const kind = q.status === 'exact' ? 'ok' : q.status === 'similar' ? 'warn' : 'bad';
              const extra = [];
              if (q.time) extra.push('sekitar menit ' + q.time + ' di rekaman/transkrip');
              if (q.note) extra.push(q.note);
              if (q.status === 'similar') extra.push('kemiripan ' + q.score + '%');
              return el('li', {}, chip(label, kind), el('span', { class: 'row-text', text: '“' + q.text + '”' }), extra.length ? el('span', { class: 'row-meta', text: extra.join(', ') }) : null);
            })
          )
        : el('p', { class: 'muted', text: 'Hasil ini tidak memuat kutipan langsung.' });
      blocks.push(reportBlock('Kutipan langsung', tab.id === 'check' ? 'Bagian yang dikutip dicocokkan lagi ke naskahmu. Kalau tidak ketemu, berarti kutipannya keliru.' : 'Dicocokkan otomatis kata per kata dengan sumber. “Mirip” artinya ada sedikit kata yang berubah.', body, r.summary.quotesMissing || r.summary.quotesSimilar));
    }

    if (m.numbers || m.names) {
      const rows = [];
      r.numbers.forEach((n) => rows.push(el('li', {}, chip('angka', n.leak ? 'bad' : 'warn'), el('span', { class: 'row-text', text: n.raws.join(', ') }), el('span', { class: 'row-meta', text: n.leak ? 'ada di contoh tulisan, bukan di sumber' : 'tidak ada di sumber' }))));
      r.names.forEach((n) => rows.push(el('li', {}, chip('nama', n.leak ? 'bad' : 'warn'), el('span', { class: 'row-text', text: n.word }), el('span', { class: 'row-meta', text: (n.leak ? 'ada di contoh tulisan, bukan di sumber' : 'tidak ada di sumber') + (n.count > 1 ? ', muncul ' + n.count + 'x' : '') }))));
      const body = rows.length ? el('ul', { class: 'rows' }, ...rows) : el('p', { class: 'muted', text: 'Semua angka dan nama yang ditemukan ada di sumber.' });
      blocks.push(reportBlock('Angka dan nama yang tidak ada di sumber', 'Belum tentu salah, misalnya nama tempat yang umum. Tetap cek satu per satu, ya. Angka yang ditulis dengan huruf tidak ikut dicek.', body, rows.length));
    }

    if (m.leak && L.v.style && (L.v.style.samples || []).length) {
      const body = r.leaks.length
        ? el('ul', { class: 'rows' }, ...r.leaks.map((l) => el('li', {}, chip('mirip contoh', 'bad'), el('span', { class: 'row-text', text: '“' + l.phrase + '”' }))))
        : el('p', { class: 'muted', text: 'Tidak ada kalimat yang menjiplak contoh tulisan.' });
      blocks.push(reportBlock('Kemiripan dengan contoh tulisan', 'Contoh tulisan cuma dipakai sebagai acuan gaya. Kalau ada kalimat yang sama persis, sebaiknya ditulis ulang.', body, r.leaks.length));
    }

    if (m.cliche) {
      const rows = r.cliches.map((c) => el('li', {}, chip('klise', 'cliche'), el('span', { class: 'row-text', text: c.label }), el('span', { class: 'row-meta', text: c.count + 'x' })));
      const body = el('div', {}, rows.length ? el('ul', { class: 'rows' }, ...rows) : el('p', { class: 'muted', text: 'Tidak ada frasa klise.' }));
      if (r.rhythm) {
        const st = r.rhythm.stats;
        body.append(
          el('p', { class: 'stat', text: 'Ritme kalimat: rata-rata ' + st.avg + ' kata per kalimat, ' + st.shortShare + '% kalimat pendek, ' + st.longShare + '% kalimat panjang' + (r.rhythm.sample ? ' (contoh tulisan: rata-rata ' + r.rhythm.sample.avg + ' kata, ' + r.rhythm.sample.shortShare + '% pendek, ' + r.rhythm.sample.longShare + '% panjang).' : '.') })
        );
        r.rhythm.hints.forEach((h) => body.append(el('p', { class: 'warn-text', text: h })));
      }
      blocks.push(reportBlock('Klise dan ritme kalimat', 'Frasa yang terasa klise atau kaku ditandai supaya gampang disunting. Ini bukan detektor AI.', body, rows.length || (r.rhythm && r.rhythm.hints.length)));
    }

    if (tab.audit) {
      const a = L.audit;
      let body;
      if (!a) {
        body = el('div', {}, el('p', { class: 'muted', text: 'Draf dibandingkan lagi dengan bahan sumber untuk mencari klaim yang tidak ada dasarnya.' }), el('button', { class: 'btn', type: 'button', text: 'Cek ulang sekarang', onclick: () => runAudit(tab, ctx) }));
      } else if (a.status === 'running') {
        body = el('p', { class: 'status busy', text: 'Sedang dicek ulang…' });
      } else if (a.status === 'error') {
        body = el('div', {}, el('p', { class: 'warn-text', text: a.error }), el('button', { class: 'btn', type: 'button', text: 'Coba lagi', onclick: () => runAudit(tab, ctx) }));
      } else if (!a.items.length) {
        body = el('p', { class: 'muted', text: 'Tidak ada klaim yang melenceng dari sumber. Meski begitu, kutipan dan angka tetap perlu kamu cek sendiri.' });
      } else {
        body = el(
          'ul',
          { class: 'rows audit' },
          ...a.items.map((t) => el('li', {}, chip(t.tingkat || 'periksa', t.tingkat === 'tinggi' ? 'bad' : 'warn'), el('span', { class: 'row-text', text: t.klaim }), el('span', { class: 'row-meta', text: t.alasan || '' })))
        );
      }
      blocks.push(reportBlock('Cek ulang terhadap sumber', 'Pemeriksaan kedua yang khusus mencari klaim tanpa dasar di bahan sumber. Bisa saja meleset, jadi anggap sebagai petunjuk.', body, a && a.status === 'ok' && a.items.length));
    }
    return el('div', { class: 'report' }, el('h3', { text: 'Catatan pengecekan' }), ...blocks);
  }

  function renderSheet(tab, ctx) {
    const L = ctx.last;
    const box = ctx.resultEl;
    box.replaceChildren();
    if (!L) return;

    const copyBtn = el('button', { class: 'btn small', type: 'button', text: 'Salin teks', onclick: () => copyText(L.raw) });
    const editBtn = el('button', {
      class: 'btn small',
      type: 'button',
      text: L.editing ? 'Selesai, periksa ulang' : 'Edit teks',
      onclick: () => {
        if (L.editing) {
          L.raw = ctx.editor.value;
          L.editing = false;
          verifyLocal(tab, L);
          if (L.audit && L.audit.status === 'ok') L.audit = null; // sudah tidak sesuai dengan teks
        } else {
          L.editing = true;
        }
        renderSheet(tab, ctx);
      },
    });

    box.append(
      el(
        'div',
        { class: 'sheet-head' },
        el('div', {}, el('h2', { text: 'Hasil' }), el('p', { class: 'stamp', text: 'Ini masih draf. Wajib dibaca dan disunting editor sebelum tayang.' })),
        el('div', { class: 'sheet-actions' }, copyBtn, editBtn)
      )
    );

    box.append(verdictBar(tab, L));

    const failed = L.order.filter((p) => L.outputs[p] && L.outputs[p].error);
    if (failed.length) {
      box.append(
        el(
          'div',
          { class: 'error-box' },
          el('strong', { text: failed.length + ' bagian belum berhasil dibuat. ' }),
          failed.map((p) => L.outputs[p].error).filter((x, i, a) => a.indexOf(x) === i).join(' '),
          ' ',
          el('button', { class: 'btn small', type: 'button', text: 'Ulangi bagian yang gagal', onclick: () => runTool(tab, ctx, true) })
        )
      );
    }
    const trunc = L.order.filter((p) => L.outputs[p] && L.outputs[p].truncated);
    if (trunc.length) box.append(el('div', { class: 'error-box soft' }, 'Sebagian hasil terpotong karena terlalu panjang. Coba pecah bahannya jadi lebih pendek, atau lengkapi sendiri.'));

    if (L.editing) {
      ctx.editor = el('textarea', { class: 'editor', rows: 22, value: L.raw, spellcheck: true });
      box.append(ctx.editor);
    } else {
      const art = el('article', { class: 'prose' });
      art.innerHTML = Md.render(decorate(L.raw, tab.id));
      Verify.highlight(art, L.report, L.audit && L.audit.status === 'ok' ? L.audit.items : []);
      Verify.mark(art, [{ re: /\[PERLU DIISI:[^\]]*\]/g, cls: 'm-todo', title: 'Lengkapi dari sumber atau konfirmasi narasumber' }]);
      box.append(art);
      box.append(legend());
    }
    box.append(buildReport(tab, ctx));
  }

  function legend() {
    return el(
      'p',
      { class: 'legend' },
      el('mark', { class: 'm-ok', text: 'cocok' }), ' ',
      el('mark', { class: 'm-warn', text: 'periksa' }), ' ',
      el('mark', { class: 'm-bad', text: 'bermasalah' }), ' ',
      el('mark', { class: 'm-cliche', text: 'klise' }), ' ',
      el('mark', { class: 'm-audit', text: 'temuan cek ulang' }), ' ',
      el('mark', { class: 'm-todo', text: 'perlu diisi' }),
      ' Arahkan kursor ke tanda untuk lihat alasannya.'
    );
  }

  /* ===================================================================
   * Panel suara
   * =================================================================== */
  function buildVoicePanel(ctx) {
    let blob = null;
    let objectUrl = null;
    let recorder = null;
    let stream = null;
    let parts = [];
    let startedAt = 0;
    let ticker = null;
    let wake = null;
    let cancelled = false;
    let working = false;
    let mode = 'record';

    const timerEl = el('span', { class: 'timer', text: '00:00' });
    const recBtn = el('button', { class: 'btn rec', type: 'button', text: 'Mulai merekam' });
    const fileInp = el('input', { type: 'file', id: 'voice-file', accept: 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.opus,.aac,.mp4' });
    const audioEl = el('audio', { controls: true, hidden: true, class: 'player' });
    const info = el('p', { class: 'hint' });
    const gloss = el('input', { type: 'text', id: 'voice-gloss', placeholder: 'Contoh: Kemendikbudristek, Prof. Dr. Siti Aminah, APBD, Gedebage' });
    const prog = el('progress', { class: 'prog', value: 0, max: 1, hidden: true });
    const status = el('p', { class: 'status', role: 'status' });
    const goBtn = el('button', { class: 'btn primary', type: 'button', text: 'Transkripsikan audio' });
    const cancelBtn = el('button', { class: 'btn', type: 'button', text: 'Batalkan', hidden: true });

    const recPane = el('div', { class: 'pane' }, recBtn, timerEl, el('p', { class: 'hint', text: 'Kalau merekam dari ponsel, jangan kunci layar atau pindah aplikasi. Untuk wawancara penting, lebih aman pakai perekam bawaan ponsel lalu unggah filenya.' }));
    const upPane = el('div', { class: 'pane', hidden: true }, el('label', { for: 'voice-file', text: 'Pilih file audio' }), fileInp, el('p', { class: 'hint', text: 'Paling aman pakai m4a, mp3, atau wav. File .opus/.ogg (seperti voice note WhatsApp) tidak bisa dibuka di Safari.' }));
    const bRec = el('button', { class: 'seg-btn on', type: 'button', text: 'Rekam langsung', 'aria-pressed': 'true' });
    const bUp = el('button', { class: 'seg-btn', type: 'button', text: 'Unggah file', 'aria-pressed': 'false' });
    function setMode(m) {
      mode = m;
      bRec.classList.toggle('on', m === 'record');
      bUp.classList.toggle('on', m === 'upload');
      bRec.setAttribute('aria-pressed', String(m === 'record'));
      bUp.setAttribute('aria-pressed', String(m === 'upload'));
      recPane.hidden = m !== 'record';
      upPane.hidden = m !== 'upload';
    }
    bRec.addEventListener('click', () => setMode('record'));
    bUp.addEventListener('click', () => setMode('upload'));

    function setBlob(b, label) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      blob = b;
      objectUrl = URL.createObjectURL(b);
      audioEl.src = objectUrl;
      audioEl.hidden = false;
      info.textContent = label + ' (' + (b.size / 1048576).toFixed(1) + ' MB). Dengarkan dulu kalau perlu, lalu klik Transkripsikan.';
      if (b.size > 300 * 1048576) toast('Filenya besar sekali, jadi prosesnya bisa lambat atau gagal.');
    }

    async function releaseWake() {
      try {
        if (wake) await wake.release();
      } catch (_) {
        /* abaikan */
      }
      wake = null;
    }

    async function toggleRec() {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
      }
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        toast('Browser ini tidak bisa merekam. Pakai Unggah file saja.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (_) {
        toast('Mikrofon tidak bisa dipakai. Cek izin mikrofon di browser.');
        return;
      }
      const mime = MRAAudio.pickRecorderMime();
      parts = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) parts.push(e.data);
      };
      recorder.onstop = () => {
        clearInterval(ticker);
        stream.getTracks().forEach((t) => t.stop());
        releaseWake();
        setBlob(new Blob(parts, { type: recorder.mimeType || mime || 'audio/webm' }), 'Rekaman ' + timerEl.textContent);
        recBtn.textContent = 'Rekam ulang';
        recBtn.classList.remove('on');
      };
      recorder.start(1000);
      startedAt = Date.now();
      timerEl.textContent = '00:00';
      ticker = setInterval(() => {
        timerEl.textContent = MRAAudio.formatTime((Date.now() - startedAt) / 1000);
      }, 500);
      recBtn.textContent = 'Berhenti merekam';
      recBtn.classList.add('on');
      try {
        wake = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null;
      } catch (_) {
        wake = null;
      }
    }
    recBtn.addEventListener('click', toggleRec);
    fileInp.addEventListener('change', () => {
      const f = fileInp.files && fileInp.files[0];
      if (f) setBlob(f, f.name);
    });

    function setWorking(b) {
      working = b;
      goBtn.disabled = b;
      cancelBtn.hidden = !b;
      prog.hidden = !b;
    }

    async function send(wav, prompt) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await Api.bin('transcribe', wav, { 'x-prompt': encodeURIComponent(prompt || '') });
          return r.text || '';
        } catch (e) {
          const retryable = !e.status || e.status >= 500 || e.status === 429;
          if (!retryable || attempt === 2) throw e;
          await sleep(1500 * (attempt + 1));
        }
      }
      return '';
    }

    goBtn.addEventListener('click', async () => {
      if (working) return;
      if (!blob) return toast('Rekam atau pilih file audionya dulu.');
      if (state.info && !state.info.voice) return toast('Fitur suara belum aktif. Minta admin mengaturnya dulu.');
      const ta = ctx.fields.text.ta;
      if (ta.value.trim() && !confirm('Transkrip yang sekarang bakal diganti. Lanjut?')) return;
      ta.value = '';
      ta.dispatchEvent(new Event('input'));
      cancelled = false;
      setWorking(true);
      try {
        const res = await MRAAudio.transcribe(blob, {
          glossary: gloss.value.trim(),
          send,
          isCancelled: () => cancelled,
          onStatus: (m) => {
            status.textContent = m;
            status.className = 'status busy';
          },
          onProgress: (i, n) => {
            prog.max = n;
            prog.value = i;
          },
          onChunk: (line) => {
            ta.value += (ta.value ? '\n\n' : '') + line;
            ta.dispatchEvent(new Event('input'));
            ta.scrollTop = ta.scrollHeight;
          },
        });
        status.textContent = 'Beres (' + MRAAudio.formatTime(res.duration) + '). Cek dan rapikan transkripnya dulu sebelum diolah.';
        status.className = 'status ok';
      } catch (e) {
        status.textContent = e.message;
        status.className = 'status err';
      } finally {
        setWorking(false);
      }
    });
    cancelBtn.addEventListener('click', () => {
      cancelled = true;
    });

    const panel = el(
      'div',
      { class: 'voice' },
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Sumber audio' }, bRec, bUp),
      recPane,
      upPane,
      audioEl,
      info,
      el('div', { class: 'field' }, el('label', { for: 'voice-gloss', text: 'Nama dan istilah (opsional)' }), el('p', { class: 'hint', text: 'Supaya nama, jabatan, dan singkatan ditulis dengan ejaan yang benar.' }), gloss),
      el('div', { class: 'actions' }, goBtn, cancelBtn),
      prog,
      status
    );
    return panel;
  }

  function buildSpeakerTools(ctx) {
    const labelBtn = el('button', { class: 'btn small', type: 'button', text: 'Tandai pembicara (perkiraan)' });
    const undoBtn = el('button', { class: 'btn small', type: 'button', text: 'Urungkan', hidden: true });
    const copyBtn = el('button', { class: 'btn small', type: 'button', text: 'Salin transkrip' });
    const status = el('p', { class: 'status' });
    let prev = null;

    const stripLabels = (t) => t.replace(/(?:^|\s)(?:Narasumber [A-Z0-9]+|Pewawancara|Moderator)\s*:\s*/gi, ' ');
    const same = (a, b) => {
      const x = Verify.words(a);
      const y = Verify.words(b);
      return x.length === y.length && x.every((w, i) => w === y[i]);
    };

    labelBtn.addEventListener('click', async () => {
      const ta = ctx.fields.text.ta;
      const src = ta.value.trim();
      if (!src) return toast('Transkripnya masih kosong.');
      if (src.length > 24000) return toast('Transkripnya terlalu panjang untuk ditandai otomatis. Beri label sendiri, misalnya “A:” dan “B:”.');
      labelBtn.disabled = true;
      const paras = src.split(/\n\s*\n/);
      const groups = [];
      let cur = '';
      paras.forEach((p) => {
        if (cur && (cur + '\n\n' + p).length > 3000) {
          groups.push(cur);
          cur = p;
        } else cur = cur ? cur + '\n\n' + p : p;
      });
      if (cur) groups.push(cur);

      const out = [];
      let rejected = 0;
      let carry = '';
      try {
        for (let i = 0; i < groups.length; i++) {
          status.textContent = 'Menandai bagian ' + (i + 1) + ' dari ' + groups.length + '…';
          status.className = 'status busy';
          const r = await Api.json('generate', { task: 'diarize', part: 'label', payload: { text: groups[i], notes: carry } });
          const text = (r.text || '').trim();
          if (text && same(stripLabels(text), groups[i])) {
            out.push(text);
            const labels = text.match(/(Narasumber [A-Z0-9]+|Pewawancara|Moderator)\s*:/gi);
            carry = 'Bagian sebelumnya berakhir dengan label: ' + (labels ? labels[labels.length - 1].replace(/:$/, '') : '(belum ada label)') + '.';
          } else {
            out.push(groups[i]);
            rejected++;
          }
        }
        prev = ta.value;
        ta.value = out.join('\n\n');
        ta.dispatchEvent(new Event('input'));
        undoBtn.hidden = false;
        status.textContent = rejected
          ? 'Sudah, tapi ' + rejected + ' bagian dibiarkan tanpa label supaya isi transkrip tidak berubah. Labelnya cuma perkiraan, jadi cocokkan lagi dengan rekaman.'
          : 'Labelnya cuma perkiraan dari isi teks. Cocokkan lagi dengan rekaman dan perbaiki kalau perlu.';
        status.className = rejected ? 'status err' : 'status ok';
      } catch (e) {
        status.textContent = e.message;
        status.className = 'status err';
      } finally {
        labelBtn.disabled = false;
      }
    });
    undoBtn.addEventListener('click', () => {
      if (prev == null) return;
      const ta = ctx.fields.text.ta;
      ta.value = prev;
      ta.dispatchEvent(new Event('input'));
      prev = null;
      undoBtn.hidden = true;
      status.textContent = '';
    });
    copyBtn.addEventListener('click', () => copyText(ctx.fields.text.ta.value));
    return el('div', { class: 'field tools-row' }, el('div', { class: 'btn-row' }, labelBtn, undoBtn, copyBtn), status);
  }

  /* ===================================================================
   * Profil gaya (tampilan)
   * =================================================================== */
  function buildStyleView() {
    const section = el('section', { class: 'tool style-view', id: 'tab-style', hidden: true, 'aria-label': 'Profil gaya' });
    let cur = blank();
    function blank() {
      return { id: '', name: '', samples: [''], summary: '' };
    }

    const listEl = el('ul', { class: 'plist' });
    const nameInp = el('input', { type: 'text', id: 'style-name', placeholder: 'Contoh: Berita lugas' });
    const samplesBox = el('div', { class: 'samples' });
    const addBtn = el('button', { class: 'btn small', type: 'button', text: 'Tambah contoh' });
    const analyzeBtn = el('button', { class: 'btn', type: 'button', text: 'Analisis gaya' });
    const summaryTa = el('textarea', { id: 'style-summary', rows: 13, spellcheck: true, placeholder: 'Klik Analisis gaya, lalu sesuaikan hasilnya. Ringkasan ini dipakai sebagai acuan gaya bersama contoh tulisan.' });
    const status = el('p', { class: 'status', role: 'status' });
    const importInp = el('input', { type: 'file', accept: '.json,application/json', hidden: true });

    function renderList() {
      const list = Profiles.all();
      const act = Profiles.activeId();
      listEl.replaceChildren(
        ...list.map((p) =>
          el(
            'li',
            {},
            el('button', {
              class: 'pitem' + (p.id === cur.id ? ' on' : ''),
              type: 'button',
              onclick: () => {
                cur = JSON.parse(JSON.stringify(p));
                if (!cur.samples.length) cur.samples = [''];
                load();
              },
            }, el('span', { class: 'pname', text: p.name }), p.id === act ? el('span', { class: 'pbadge', text: 'dipakai' }) : null)
          )
        )
      );
      if (!list.length) listEl.append(el('li', { class: 'muted', text: 'Belum ada profil.' }));
    }

    function renderSamples() {
      samplesBox.replaceChildren(
        ...cur.samples.map((s, i) => {
          const ta = el('textarea', { rows: 8, spellcheck: false, value: s, placeholder: 'Tempel satu berita yang gayanya ingin ditiru…' });
          const count = el('span', { class: 'count', text: fmtNum((s.trim().match(/\S+/g) || []).length) + ' kata' });
          ta.addEventListener('input', () => {
            cur.samples[i] = ta.value;
            count.textContent = fmtNum((ta.value.trim().match(/\S+/g) || []).length) + ' kata';
          });
          return el(
            'div',
            { class: 'field sample' },
            el('div', { class: 'label-row' }, el('label', { text: 'Contoh ' + (i + 1) }), el('span', { class: 'label-tools' }, count, cur.samples.length > 1 ? el('button', { class: 'link-btn', type: 'button', text: 'Hapus', onclick: () => { cur.samples.splice(i, 1); renderSamples(); } }) : null)),
            ta
          );
        })
      );
      addBtn.hidden = cur.samples.length >= 5;
    }

    function load() {
      nameInp.value = cur.name;
      summaryTa.value = cur.summary;
      status.textContent = '';
      renderSamples();
      renderList();
    }

    function collect() {
      return {
        name: nameInp.value.trim(),
        samples: cur.samples.map((s) => s.trim()).filter(Boolean).slice(0, 5),
        summary: summaryTa.value.trim(),
      };
    }

    async function analyze() {
      const c = collect();
      if (!c.samples.length) return toast('Tempel setidaknya satu contoh tulisan.');
      if (c.summary && !confirm('Ringkasan gaya yang sekarang bakal diganti. Lanjut?')) return;
      const total = c.samples.join(' ').length;
      if (total < 800) toast('Contohnya masih pendek. Dua atau tiga berita biasanya hasilnya lebih pas.');
      analyzeBtn.disabled = true;
      status.textContent = 'Sedang membaca gaya tulisan…';
      status.className = 'status busy';
      try {
        const st = Verify.styleStats(c.samples.join('\n\n'));
        const joined = c.samples.map((s, i) => '--- Contoh ' + (i + 1) + ' ---\n' + s).join('\n\n').slice(0, 60000);
        const r = await Api.json('generate', { task: 'style', part: 'ringkas', payload: { text: joined } });
        const statLine = st.sentences
          ? 'Statistik terukur dari contoh: rata-rata ' + st.avg + ' kata per kalimat (median ' + st.median + '); ' + st.shortShare + '% kalimat pendek (8 kata atau kurang); ' + st.longShare + '% kalimat panjang (25 kata atau lebih); rata-rata ' + st.perPara + ' kalimat per paragraf; ' + st.quoteShare + '% kalimat memuat kutipan langsung.'
          : '';
        summaryTa.value = (statLine ? statLine + '\n\n' : '') + r.text;
        status.textContent = 'Sudah jadi. Baca dan sesuaikan ringkasannya, lalu simpan profil.';
        status.className = 'status ok';
      } catch (e) {
        status.textContent = e.message;
        status.className = 'status err';
      } finally {
        analyzeBtn.disabled = false;
      }
    }

    function save() {
      const c = collect();
      if (!c.name) return toast('Kasih nama profilnya dulu.');
      if (!c.samples.length && !c.summary) return toast('Isi contoh tulisan atau ringkasan gayanya dulu.');
      const list = Profiles.all();
      let p = list.find((x) => x.id === cur.id);
      if (!p) {
        p = { id: uid() };
        list.push(p);
      }
      Object.assign(p, { name: c.name, samples: c.samples, summary: c.summary, updated: Date.now() });
      if (!Profiles.save(list)) return;
      cur.id = p.id;
      Profiles.setActive(p.id);
      refreshStyleSelects();
      renderList();
      toast('Profil tersimpan dan langsung dipakai.');
    }

    function remove() {
      if (!cur.id) {
        cur = blank();
        return load();
      }
      if (!confirm('Hapus profil "' + cur.name + '"?')) return;
      Profiles.save(Profiles.all().filter((p) => p.id !== cur.id));
      if (Profiles.activeId() === cur.id) Profiles.setActive('');
      cur = blank();
      refreshStyleSelects();
      load();
      toast('Profil dihapus.');
    }

    function exportAll() {
      const list = Profiles.all();
      if (!list.length) return toast('Belum ada profil yang bisa diekspor.');
      download('profil-gaya-meja-redaksi.json', JSON.stringify({ app: 'meja-redaksi-ai', version: 1, profiles: list }, null, 2), 'application/json');
    }

    importInp.addEventListener('change', async () => {
      const f = importInp.files && importInp.files[0];
      importInp.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const incoming = Array.isArray(data.profiles) ? data.profiles : [];
        const list = Profiles.all();
        let added = 0;
        incoming.slice(0, 50).forEach((p) => {
          if (!p || typeof p.name !== 'string') return;
          let name = p.name.trim().slice(0, 80) || 'Profil impor';
          if (list.some((x) => x.name === name)) name += ' (impor)';
          list.push({
            id: uid(),
            name,
            samples: (Array.isArray(p.samples) ? p.samples : []).filter((s) => typeof s === 'string').slice(0, 5).map((s) => s.slice(0, 12000)),
            summary: typeof p.summary === 'string' ? p.summary.slice(0, 6000) : '',
            updated: Date.now(),
          });
          added++;
        });
        if (!added) return toast('Tidak ada profil yang bisa dibaca dari file ini.');
        if (Profiles.save(list)) {
          refreshStyleSelects();
          renderList();
          toast(added + ' profil diimpor.');
        }
      } catch (_) {
        toast('File tidak bisa dibuka. Pastikan itu file hasil ekspor dari aplikasi ini.');
      }
    });

    addBtn.addEventListener('click', () => {
      if (cur.samples.length < 5) {
        cur.samples.push('');
        renderSamples();
      }
    });
    analyzeBtn.addEventListener('click', analyze);

    const left = el(
      'div',
      { class: 'panel-in' },
      el('h1', { text: 'Profil gaya' }),
      el('p', { class: 'lead', text: 'Tempel beberapa tulisan yang paling mewakili gaya redaksimu. Yang ditiru cuma gayanya, seperti ritme, struktur, cara atribusi, dan pilihan kata. Isinya tidak ikut dipakai.' }),
      el('div', { class: 'field' }, el('label', { for: 'style-name', text: 'Nama profil' }), nameInp),
      samplesBox,
      addBtn,
      el('p', { class: 'fine', text: 'Profil cuma tersimpan di browser ini. Kalau mau dibagikan ke tim, pakai Ekspor lalu Impor.' })
    );
    const right = el(
      'div',
      { class: 'panel-out' },
      el('div', { class: 'sheet' },
        el('div', { class: 'sheet-head' }, el('div', {}, el('h2', { text: 'Ringkasan gaya' }), el('p', { class: 'stamp', text: 'Boleh diedit. Ringkasan ini jadi acuan gaya bersama contoh tulisan.' }))),
        el('div', { class: 'actions' }, analyzeBtn, status),
        summaryTa,
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn primary', type: 'button', text: 'Simpan profil', onclick: save }),
          el('button', { class: 'btn', type: 'button', text: 'Profil baru', onclick: () => { cur = blank(); load(); } }),
          el('button', { class: 'btn', type: 'button', text: 'Hapus', onclick: remove })
        )
      ),
      el('div', { class: 'sheet' },
        el('div', { class: 'sheet-head' }, el('h2', { text: 'Profil tersimpan' })),
        listEl,
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn small', type: 'button', text: 'Ekspor semua (.json)', onclick: exportAll }),
          el('button', { class: 'btn small', type: 'button', text: 'Impor (.json)', onclick: () => importInp.click() }),
          importInp
        )
      )
    );
    section.append(left, right);
    load();
    views.style = { section, ctx: null };
    return section;
  }

  /* ===================================================================
   * Navigasi, masuk, dan inisialisasi
   * =================================================================== */
  let activeTab = null;

  function showTab(id) {
    if (!views[id]) id = TABS[0].id;
    activeTab = id;
    Object.keys(views).forEach((k) => {
      views[k].section.hidden = k !== id;
    });
    document.querySelectorAll('#nav button').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === id);
      b.setAttribute('aria-current', b.dataset.tab === id ? 'page' : 'false');
    });
    try {
      history.replaceState(null, '', '#' + id);
    } catch (_) {
      /* abaikan */
    }
    window.scrollTo(0, 0);
  }

  function buildApp() {
    const desk = $('#desk');
    const nav = $('#nav');
    desk.replaceChildren();
    nav.replaceChildren();
    styleSelects.length = 0;

    TABS.forEach((tab) => {
      if (tab.id === 'voice') {
        tab.pre = (ctx) => buildVoicePanel(ctx);
        tab.afterText = (ctx) => buildSpeakerTools(ctx);
      }
      desk.append(buildTool(tab));
      nav.append(el('button', { type: 'button', 'data-tab': tab.id, text: tab.label, onclick: () => showTab(tab.id) }));
    });
    nav.append(el('hr', { class: 'nav-sep' }));
    desk.append(buildStyleView());
    nav.append(el('button', { type: 'button', 'data-tab': 'style', text: 'Profil gaya', onclick: () => showTab('style') }));

    const toggle = $('#audit-toggle');
    toggle.checked = !!state.audit;
    toggle.onchange = () => {
      state.audit = toggle.checked;
      LS.set('mra.audit', state.audit);
    };

    const info = state.info || {};
    $('#engine').textContent = 'Model: ' + (info.provider === 'anthropic' ? 'Claude' : 'OpenAI') + (info.model ? ' (' + info.model + ')' : '') + (info.llmReady ? '' : ' · belum siap dipakai') + (info.voice ? '' : ' · fitur suara belum aktif');

    showTab((location.hash || '').replace('#', '') || TABS[0].id);
  }

  function showLogin(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    sessionStorage.removeItem('mra.pw');
    Api.pw = '';
    const err = $('#login-err');
    err.hidden = !msg;
    err.textContent = msg || '';
    $('#login-pw').focus();
  }

  async function enter(pw) {
    Api.pw = pw;
    const info = await Api.call('auth', { method: 'POST', headers: Api.headers() });
    state.info = info;
    sessionStorage.setItem('mra.pw', pw);
    $('#login').hidden = true;
    $('#app').hidden = false;
    buildApp();
  }

  function init() {
    const yr = $('#yr');
    if (yr) yr.textContent = new Date().getFullYear();
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#login-btn');
      btn.disabled = true;
      try {
        await enter($('#login-pw').value);
        $('#login-pw').value = '';
      } catch (err) {
        showLogin(err.message);
      } finally {
        btn.disabled = false;
      }
    });
    $('#logout').addEventListener('click', () => {
      showLogin('');
    });
    const saved = sessionStorage.getItem('mra.pw');
    if (saved) {
      enter(saved).catch(() => showLogin(''));
    } else {
      showLogin('');
    }
  }

  init();
})();
