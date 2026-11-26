/* DSP ringan untuk Music Control (berjalan di browser, juga bisa diuji di Node).
   - wsola: ubah tempo TANPA mengubah pitch (time-stretch)
   - resample: ubah kecepatan + pitch (seperti pita kaset)
   - encodeWav / encodeMp3 (lamejs) */
(function (root) {
  'use strict';
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // rate > 1 = lebih cepat (lebih pendek), rate < 1 = lebih lambat. chs = [Float32Array, ...]
  async function wsola(chs, rate, sr, onProgress) {
    const n = chs[0].length;
    let N = Math.round(sr * 0.04); if (N % 2) N++;     // frame ~40 ms
    const Hs = N / 2;
    const seek = Math.round(sr * 0.012);               // jendela pencarian ±12 ms
    const outLen = Math.ceil(n / rate) + N * 2;
    const out = chs.map(() => new Float32Array(outLen));
    const norm = new Float32Array(outLen);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

    const mono = new Float32Array(n);
    for (let c = 0; c < chs.length; c++) { const a = chs[c]; for (let i = 0; i < n; i++) mono[i] += a[i] / chs.length; }

    // frame pertama: separuh awal tanpa jendela agar awal lagu tidak mengecil
    for (let c = 0; c < chs.length; c++) {
      for (let i = 0; i < N; i++) out[c][i] = chs[c][i] * (i < Hs ? 1 : win[i]);
    }
    for (let i = 0; i < N; i++) norm[i] = i < Hs ? 1 : win[i];

    let prev = 0, outPos = 0, frames = 0;
    for (;;) {
      outPos += Hs;
      const nominal = Math.round(outPos * rate);
      if (nominal + N + seek >= n || outPos + N >= outLen) break;
      const nat = prev + Hs;
      const lo = Math.max(0, nominal - seek), hi = Math.min(n - N - 1, nominal + seek);
      let best = Math.min(Math.max(nominal, lo), hi), bestScore = -Infinity;
      for (let cand = lo; cand <= hi; cand += 2) {
        let c = 0, e = 1e-9;
        for (let i = 0; i < Hs; i += 4) { const v = mono[cand + i]; c += mono[nat + i] * v; e += v * v; }
        const score = c / Math.sqrt(e);
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      for (let c = 0; c < chs.length; c++) {
        const src = chs[c], dst = out[c];
        for (let i = 0; i < N; i++) dst[outPos + i] += src[best + i] * win[i];
      }
      for (let i = 0; i < N; i++) norm[outPos + i] += win[i];
      prev = best;
      if ((++frames & 255) === 0) { if (onProgress) onProgress(Math.min(1, nominal / n)); await tick(); }
    }
    const finalLen = Math.min(Math.floor(n / rate), outPos + N, outLen);
    return out.map((a) => {
      const r = new Float32Array(finalLen);
      for (let i = 0; i < finalLen; i++) r[i] = norm[i] > 1e-3 ? a[i] / norm[i] : a[i];
      return r;
    });
  }

  // g > 1 = lebih cepat & nada naik, g < 1 = lebih lambat & nada turun
  function resample(c, g) {
    const n = Math.max(1, Math.floor((c.length - 1) / g));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * g, i0 = p | 0, fr = p - i0;
      o[i] = c[i0] * (1 - fr) + (c[i0 + 1] !== undefined ? c[i0 + 1] : c[i0]) * fr;
    }
    return o;
  }

  function encodeWav(chs, sr) {
    const nch = chs.length, len = chs[0].length;
    const buf = new ArrayBuffer(44 + len * nch * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * nch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len * nch * 2, true);
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nch; c++) {
        const s = Math.max(-1, Math.min(1, chs[c][i]));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  const MP3_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  async function encodeMp3(chs, sr, kbps, onProgress) {
    const L = root.lamejs;
    if (!L) throw new Error('Library MP3 (lamejs) gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
    if (!MP3_RATES.includes(sr)) { chs = chs.map((c) => resample(c, sr / 44100)); sr = 44100; }
    const nch = Math.min(2, chs.length);
    const enc = new L.Mp3Encoder(nch, sr, kbps);
    const toI16 = (a) => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) { const s = Math.max(-1, Math.min(1, a[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; } return o; };
    const left = toI16(chs[0]), right = nch > 1 ? toI16(chs[1]) : null;
    const parts = [], B = 1152;
    for (let i = 0, k = 0; i < left.length; i += B, k++) {
      const l = left.subarray(i, i + B);
      const out = nch > 1 ? enc.encodeBuffer(l, right.subarray(i, i + B)) : enc.encodeBuffer(l);
      if (out.length) parts.push(new Uint8Array(out));
      if ((k & 127) === 0) { if (onProgress) onProgress(i / left.length); await tick(); }
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  // Coba bitrate dari tinggi ke rendah sampai ukurannya <= maxBytes
  async function fitMp3(chs, sr, maxBytes, onProgress) {
    const tries = [[192, 2], [160, 2], [128, 2], [112, 2], [96, 2], [64, 2], [64, 1], [48, 1]];
    for (let t = 0; t < tries.length; t++) {
      const [kbps, nch] = tries[t];
      let use = chs;
      if (nch === 1 && chs.length > 1) { const m = new Float32Array(chs[0].length); for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) / 2; use = [m]; }
      // perkiraan cepat: lewati bitrate yang pasti terlalu besar
      const est = (kbps * 1000 / 8) * (use[0].length / sr);
      if (est > maxBytes * 1.05) continue;
      const blob = await encodeMp3(use, sr, kbps, (p) => onProgress && onProgress((t + p) / tries.length));
      if (blob.size <= maxBytes) return { blob, kbps, mono: use.length === 1 };
    }
    return null;
  }

  root.DSP = { wsola, resample, encodeWav, encodeMp3, fitMp3, tick };
  if (typeof module !== 'undefined') module.exports = root.DSP;
})(typeof window !== 'undefined' ? window : globalThis);
