# NoctPrism Audio Studio

Website untuk menyiapkan lagu sebelum dipakai di Roblox:

| Menu | Fungsi |
|---|---|
| **HOME** | Informasi, alur cepat, tips, sumber musik legal |
| **DOWNLOADER** | Ambil file audio dari **link langsung** (milik sendiri / bebas royalti). YouTube & Spotify **tidak didukung** |
| **MUSIC CONTROL** | Drop file → atur **speed**, **pitch**, volume, fade, trim, normalisasi → ekspor MP3/WAV |
| **UPLOADER** | Upload ke Roblox (Open Cloud) → dapat **Asset ID** (`rbxassetid://...`) |

Pemrosesan audio berjalan 100% di browser. Server (Vercel Functions) hanya dipakai untuk Downloader (link langsung) dan meneruskan upload ke Roblox.

## Struktur

```
public/        index.html, style.css, app.js, dsp.js   (situs statis)
api/           upload.js, status.js, fetch.js          (Vercel Serverless Functions)
vercel.json    outputDirectory = public
package.json
```

## Deploy ke Vercel

**Cara 1 - lewat GitHub (disarankan)**
1. Buat repository baru di GitHub, upload seluruh isi folder ini (folder `public`, `api`, `vercel.json`, `package.json`).
2. Buka https://vercel.com/new → **Import** repository tadi.
3. *Framework Preset*: **Other**. Biarkan *Build Command* kosong. *Output Directory*: `public` (sudah diatur di `vercel.json`).
4. Klik **Deploy**. Situs aktif di `https://nama-project.vercel.app`.

**Cara 2 - lewat CLI**
```bash
npm i -g vercel
cd noctprism-audio-studio
vercel          # ikuti pertanyaan, lalu
vercel --prod
```

## Membuat API key Roblox (untuk Uploader)
1. Buka https://create.roblox.com/dashboard/credentials → **Create API Key**.
2. Access Permissions → API System: **Assets** → centang **Read** dan **Write**.
3. Pilih experience / akun pemilik, tambahkan IP `0.0.0.0/0` (atau batasi sesuai kebutuhan).
4. Salin key, tempel di menu **UPLOADER**. Isi **User ID** (atau Group ID) pemilik aset.
5. Akun harus terverifikasi untuk upload audio.

> API key dikirim hanya ke fungsi `/api/upload` milik situsmu lalu diteruskan ke Roblox. Tidak disimpan di server. Centang "Ingat API key" hanya bila perangkatmu pribadi.

## Environment Variables (opsional)
Atur di Vercel → Project → Settings → Environment Variables:

| Nama | Fungsi |
|---|---|
| `ROBLOX_API_KEY` | API key bawaan, jadi tidak perlu diketik di Uploader. **Hati-hati**: siapa pun yang membuka situs bisa memakainya, kecuali kamu juga mengisi `ACCESS_CODE` |
| `ACCESS_CODE` | Jika diisi, semua endpoint `/api/*` menolak permintaan tanpa header `x-access-code` yang sama |

## Batasan
- Body fungsi Vercel ± **4.5 MB**. Karena itu Uploader mengonversi otomatis ke MP3 ≤ 4.4 MB (lagu ±4–5 menit pada 128 kbps). Untuk lagu lebih panjang, potong durasi di Music Control.
- Konversi MP3 memakai library `lamejs` dari CDN jsDelivr (butuh internet saat dipakai).
- Moderasi Roblox berjalan asinkron; Asset ID bisa muncul setelah beberapa saat (Uploader mengecek otomatis).

## Catatan legal
Gunakan hanya audio yang kamu miliki hak / lisensinya. Roblox memoderasi audio berhak cipta dan dapat menindak akun.
