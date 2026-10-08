# Meja Redaksi AI

Alat bantu AI untuk jurnalis dan editor. Semua hasil adalah **draf bantuan AI** yang wajib diperiksa editor. Ini bukan produk resmi kumparan.

## Fitur

| Menu | Fungsi |
|---|---|
| Cek naskah | Etik (KEJ dan pedoman Dewan Pers), bahasa, konsistensi internal, daftar klaim yang harus diverifikasi |
| Judul dan SEO | 10 opsi judul bergaya berbeda, meta description, tag, slug, penanda risiko clickbait |
| Sebar konten | Caption IG, carousel, thread X, skrip video, WhatsApp Channel, newsletter |
| Transkrip ke berita | Ringkasan, kutipan terbaik + konteks, angle, kerangka, draf (opsional) |
| Rilis ke berita | Draf netral, klaim sepihak yang perlu dikonfirmasi, pertanyaan untuk pembanding |
| Suara ke berita | Rekam/unggah audio, transkrip yang bisa diedit, penanda pembicara (perkiraan AI), lalu bahan berita |
| Profil gaya | Tempel 1 sampai 5 contoh tulisan, analisis gaya, simpan, ekspor/impor |

### Anti-halusinasi (berlapis)

1. **Aturan sumber tunggal** di prompt: fakta hanya dari bahan yang ditempel; yang tidak ada ditulis `[PERLU DIISI: ...]`.
2. **Cek kutipan oleh kode**: tiap kutipan langsung dicocokkan dengan sumber (cocok / mirip / tidak ditemukan), lengkap dengan perkiraan menit di rekaman.
3. **Cek angka dan nama oleh kode**: yang tidak ada di sumber ditandai.
4. **Cek kebocoran dari contoh tulisan**: kalimat, angka, atau nama dari contoh yang terbawa ke hasil ditandai merah.
5. **Auditor AI** (panggilan terpisah, bisa dimatikan di menu kiri bawah).
6. Setiap hasil diberi label "wajib diperiksa editor".

Tidak ada sistem yang menjamin nol halusinasi. Lapisan di atas menekan dan menampakkan risikonya; keputusan tetap di tangan editor.

### Soal "terdeteksi AI"

Aplikasi **tidak** berusaha mengelabui detektor AI (hasil detektor tidak akurat dan tidak bisa dijamin). Yang dikerjakan: meniru gaya redaksi dari contoh, melarang pola khas tulisan mesin, dan **Pemeriksa Klise** yang menandai frasa dan ritme yang terdengar seperti mesin agar editor bisa menyuntingnya. Pastikan pemakaian AI sesuai kebijakan internal redaksi.

---

## Isi proyek

```
meja-redaksi-ai/
├── public/                 # situs statis (HTML, CSS, JS, font)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js           # antarmuka dan alur kerja
│   ├── js/verify.js        # pemeriksa kutipan, angka, nama, klise (tanpa AI)
│   ├── js/audio.js         # pemotong audio di browser
│   └── fonts/
├── netlify/
│   ├── functions/          # auth.js, generate.js, transcribe.js
│   └── lib/                # common.js, llm.js, prompts.js
├── test/verify.test.js     # uji unit pemeriksa
├── netlify.toml
├── package.json
├── .env.example
└── .gitignore
```

---

## Cara upload ke GitHub

Siapkan akun di https://github.com. Ekstrak file .zip lebih dulu, sehingga kamu punya folder `meja-redaksi-ai`.

### Cara A: lewat browser (tanpa install apa pun)

1. Login ke GitHub, klik tanda **+** di kanan atas, lalu **New repository**.
2. Isi **Repository name** (misalnya `meja-redaksi-ai`). Pilih **Private** (disarankan, karena ini alat internal). **Jangan** centang "Add a README" atau opsi lain. Klik **Create repository**.
3. Di halaman repo kosong, klik tautan **uploading an existing file**.
4. Buka folder `meja-redaksi-ai` hasil ekstrak, **pilih semua isinya** (folder `public`, `netlify`, `test`, serta file `netlify.toml`, `package.json`, `README.md`, `.env.example`, `.gitignore`), lalu seret ke halaman GitHub. Yang diseret adalah **isi** folder, bukan file .zip dan bukan folder pembungkusnya.
5. Tunggu semua file terunggah. Pastikan folder `netlify/functions` dan `public/js` terlihat di daftar. Jika file yang namanya diawali titik (`.gitignore`, `.env.example`) tidak ikut terseret, klik **Add file > Create new file**, ketik namanya, dan tempel isinya (opsional; aplikasi tetap jalan tanpa keduanya).
6. Di bawah, isi pesan commit (misalnya `Versi pertama`), lalu klik **Commit changes**.

### Cara B: lewat Git (terminal)

```bash
cd meja-redaksi-ai
git init
git add .
git commit -m "Versi pertama"
git branch -M main
git remote add origin https://github.com/NAMA-AKUN/meja-redaksi-ai.git
git push -u origin main
```

Ganti `NAMA-AKUN` dengan username GitHub-mu (repo kosongnya dibuat dulu seperti langkah 1 sampai 2 di atas).

> **Penting:** jangan pernah mengunggah API key ke GitHub. Key hanya dimasukkan di Netlify (langkah di bawah). File `.env` sudah dikecualikan oleh `.gitignore`.

---

## Cara publikasi di Netlify

1. Login ke https://app.netlify.com (bisa memakai akun GitHub).
2. Klik **Add new site > Import an existing project > GitHub**. Izinkan akses ke repo, lalu pilih `meja-redaksi-ai`.
3. Pengaturan build terbaca dari `netlify.toml`: **Build command** dikosongkan, **Publish directory** `public`, **Functions directory** `netlify/functions`. Klik **Deploy**.
4. Setelah deploy pertama selesai, buka **Site configuration > Environment variables > Add a variable** dan isi:

   | Variabel | Isi | Wajib |
   |---|---|---|
   | `APP_PASSWORD` | kata sandi akses untuk tim (buat panjang) | ya |
   | `LLM_PROVIDER` | `anthropic` (Claude) atau `openai` (ChatGPT) | ya |
   | `ANTHROPIC_API_KEY` | key dari console.anthropic.com | jika memakai Claude |
   | `OPENAI_API_KEY` | key dari platform.openai.com | jika memakai OpenAI, **dan wajib untuk menu Suara** |
   | `ANTHROPIC_MODEL` | nama model Claude | tidak (bawaan `claude-sonnet-5-5`) |
   | `OPENAI_MODEL` | nama model OpenAI | tidak (bawaan `gpt-4.1`) |
   | `TRANSCRIBE_MODEL` | model transkripsi | tidak (bawaan `gpt-4o-transcribe`, cadangan `whisper-1`) |

5. **Wajib deploy ulang** agar variabel terbaca: **Deploys > Trigger deploy > Deploy site**.
6. Buka alamat `https://nama-situs.netlify.app`, masuk dengan `APP_PASSWORD`. Di kiri bawah harus tertulis mesin yang aktif tanpa peringatan "API key belum diatur".
7. (Opsional) Ganti nama situs di **Site configuration > Change site name**, atau pasang domain sendiri.

Setiap `git push` ke GitHub akan men-deploy ulang otomatis.

---

## Mencoba di komputer sendiri (opsional)

```bash
npm install -g netlify-cli
cp .env.example .env      # isi nilainya
netlify dev               # buka http://localhost:8888
npm test                  # uji unit pemeriksa
```

---

## Catatan penting

- **Waktu fungsi.** Batas waktu fungsi Netlify berbeda antar akun (dokumentasi dan sumber lain menyebut antara 10 sampai 60 detik). Karena itu setiap hasil dibuat per bagian dan paralel, dengan batas tunggu 25 detik per panggilan (`LLM_TIMEOUT_MS`). Jika sering muncul "Server terlalu lama merespons", pecah bahan menjadi lebih pendek atau cek pengaturan Functions di Netlify.
- **Suara.** Audio dipotong ±55 detik di titik sunyi di browser, diubah ke WAV 16 kHz, dan dikirim bertahap ke `/api/transcribe`, yang meneruskannya ke OpenAI. Audio tidak disimpan di server aplikasi, tetapi dikirim ke OpenAI. Jangan dipakai untuk narasumber yang identitasnya harus dirahasiakan atau materi embargo. Rekaman panjang memakai memori browser (1 jam sebaiknya lewat laptop). Transkrip memuat penanda `[mm:ss]` agar kutipan mudah dicek ke audio.
- **Biaya.** Tiap hasil memakai 1 sampai 3 panggilan AI, ditambah 1 panggilan auditor (matikan lewat toggle jika ingin hemat). Transkripsi dihitung per menit audio. Pantau pemakaian di dasbor penyedia API dan pasang batas bulanan.
- **Keamanan.** Satu kata sandi bersama cukup untuk tim kecil. Ganti `APP_PASSWORD` bila ada anggota yang keluar. Situs sudah diberi `noindex` agar tidak muncul di mesin pencari. Profil gaya disimpan di `localStorage` browser masing-masing (bukan di server); di komputer bersama, hapus profil sebelum keluar.
- **Batas pemeriksa.** Cek angka tidak membaca angka yang ditulis dengan huruf ("dua puluh"). Cek nama bisa menandai nama tempat umum yang wajar. Tandai-tandai itu petunjuk, bukan vonis.
- **Rujukan etik.** Prompt memuat ringkasan Kode Etik Jurnalistik dan pedoman Dewan Pers. Selalu rujuk teks resminya untuk keputusan akhir.

## Pemecahan masalah

| Gejala | Penyebab dan solusi |
|---|---|
| "APP_PASSWORD belum diatur" | Tambahkan variabel di Netlify lalu deploy ulang |
| "API key ... tidak valid" | Periksa nama dan isi variabel; pastikan tanpa spasi di awal/akhir |
| "Nama model tidak dikenali" | Isi `ANTHROPIC_MODEL` / `OPENAI_MODEL` dengan nama model yang tersedia di akunmu |
| "Batas pemakaian atau kuota tercapai" | Isi saldo atau naikkan limit di dasbor penyedia API |
| Menu Suara: "OPENAI_API_KEY belum diatur" | Transkripsi memerlukan key OpenAI, meski teks diolah Claude |
| "Format audio tidak bisa dibaca browser" | Ekspor ke m4a/mp3/wav atau pakai Chrome (Safari tidak membaca .opus/.ogg) |
| Halaman 404 saat membuka `/api/...` langsung | Normal; endpoint hanya menerima POST dari aplikasi |
