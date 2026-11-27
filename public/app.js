/* NoctPrism Audio Studio - antarmuka & logika (semua pemrosesan audio di browser) */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MAX_UP = 4400000;                    // batas body fungsi Vercel
  const UP_EXT = ['mp3', 'ogg', 'wav', 'flac'];
  const BLOCKED = ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'spotify.com', 'spotify.link', 'music.youtube.com'];

  /* ---------- util ---------- */
  const fmtT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = (s % 60); return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1).replace(/\.0$/, ''); };
  const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const extOf = (name = '', type = '') => {
    const m = /\.([a-z0-9]+)$/i.exec(name);
    if (m) return m[1].toLowerCase();
    if (/mpeg|mp3/.test(type)) return 'mp3'; if (/ogg/.test(type)) return 'ogg'; if (/wav/.test(type)) return 'wav'; if (/flac/.test(type)) return 'flac';
    return '';
  };
  const baseName = (n) => String(n || 'audio').replace(/\.[^.]+$/, '');
  let toastTimer;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2400); }
  function setMsg(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
  function download(blob, name) { const a = document.createElement('a'); const u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  function swapUrl(audio, blob) { if (audio._u) URL.revokeObjectURL(audio._u); audio._u = blob ? URL.createObjectURL(blob) : ''; audio.src = audio._u; }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Tersalin: ' + text); } catch (_) { toast('Gagal menyalin, salin manual.'); } }
  function bindDrop(drop, input, handler) {
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handler(f, f.name); });
    input.addEventListener('change', () => { const f = input.files[0]; if (f) handler(f, f.name); input.value = ''; });
  }
  let ac;
  async function decodeBlob(blob) {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const ab = await blob.arrayBuffer();
    return await new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
  }

  /* ---------- sidebar + router ---------- */
  const sidebar = $('#sidebar'), overlay = $('#overlay'), burger = $('#burger');
  const TITLES = { home: 'HOME', downloader: 'DOWNLOADER', music: 'MUSIC CONTROL', uploader: 'UPLOADER', library: 'MUSIC LIBRARY' };
  function setMenu(open) {
    sidebar.classList.toggle('open', open); overlay.classList.toggle('on', open);
    burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
  }
  burger.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  overlay.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  function route() {
    let v = (location.hash || '#home').slice(1);
    if (!TITLES[v]) v = 'home';
    $$('.view').forEach((s) => s.classList.toggle('on', s.id === 'view-' + v));
    $$('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $('#viewTitle').textContent = TITLES[v];
    setMenu(false); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $$('.sidebar nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  route();

  /* ---------- DOWNLOADER (link langsung) ---------- */
  const dl = { blob: null, name: '' };
  $('#dlGo').addEventListener('click', async () => {
    const msg = $('#dlMsg'); const url = $('#dlUrl').value.trim();
    $('#dlResult').hidden = true;
    if (!url) return setMsg(msg, 'Masukkan link file audio.', 'err');
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return setMsg(msg, 'Link tidak valid.', 'err'); }
    if (BLOCKED.some((b) => host === b || host.endsWith('.' + b))) return setMsg(msg, 'YouTube / Spotify tidak didukung. Gunakan link file audio langsung yang kamu miliki haknya.', 'err');
    if (!$('#dlRights').checked) return setMsg(msg, 'Centang pernyataan hak / lisensi dulu.', 'err');
    const btn = $('#dlGo'); btn.disabled = true; setMsg(msg, 'Mengambil file…');
    try {
      const r = await fetch('/api/fetch?url=' + encodeURIComponent(url));
      if (!r.ok) { let e = {}; try { e = await r.json(); } catch (_) {} throw new Error(e.error || 'Gagal mengambil (HTTP ' + r.status + ')'); }
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get('X-Filename') || 'audio.mp3');
      dl.blob = blob; dl.name = name;
      $('#dlName').textContent = name; $('#dlInfo').textContent = fmtSize(blob.size) + ' • ' + (blob.type || 'audio');
      swapUrl($('#dlAudio'), blob); $('#dlResult').hidden = false; setMsg(msg, 'Berhasil.', 'ok');
    } catch (e) { setMsg(msg, e.message, 'err'); } finally { btn.disabled = false; }
  });
  $('#dlSave').addEventListener('click', () => dl.blob && download(dl.blob, dl.name));
  $('#dlToMusic').addEventListener('click', () => { if (!dl.blob) return; location.hash = '#music'; loadMusic(dl.blob, dl.name); });
  $('#dlToUp').addEventListener('click', () => { if (!dl.blob) return; location.hash = '#uploader'; setUploadFile(dl.blob, dl.name); });

  /* ---------- MUSIC CONTROL ---------- */
  const mc = { blob: null, name: '', buffer: null, result: null };
  const el = (id) => $('#' + id);
  const DEF = { speed: 1, pitch: 0, vol: 100, fi: 0, fo: 0 };

  bindDrop(el('mcDrop'), el('mcFile'), (f, n) => loadMusic(f, n));

  async function loadMusic(blob, name) {
    setMsg(el('mcMsg'), 'Membaca & men-decode audio…');
    try {
      const buffer = await decodeBlob(blob);
      mc.blob = blob; mc.name = name; mc.buffer = buffer; mc.result = null;
      el('mcName').textContent = name;
      el('mcInfo').textContent = fmtT(buffer.duration) + ' • ' + buffer.sampleRate + ' Hz • ' + (buffer.numberOfChannels > 1 ? 'stereo' : 'mono') + ' • ' + fmtSize(blob.size);
      swapUrl(el('mcOrig'), blob);
      el('mcStart').value = 0; el('mcEnd').value = 1000;
      resetControls(); el('mcPanel').hidden = false; el('mcOut').hidden = true;
      drawWave(); updateLabels(); setMsg(el('mcMsg'), 'File siap diatur.', 'ok');
    } catch (e) { setMsg(el('mcMsg'), 'Gagal membaca file audio (format tidak didukung browser?).', 'err'); }
  }

  function trimSec() {
    const d = mc.buffer ? mc.buffer.duration : 0;
    return [d * el('mcStart').value / 1000, d * el('mcEnd').value / 1000];
  }
  function drawWave() {
    const cv = el('mcWave'); if (!mc.buffer) return;
    const dpr = window.devicePixelRatio || 1, w = Math.floor(cv.clientWidth * dpr), h = Math.floor(110 * dpr);
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), data = mc.buffer.getChannelData(0), step = Math.max(1, Math.floor(data.length / w));
    const s = el('mcStart').value / 1000, e = el('mcEnd').value / 1000;
    for (let x = 0; x < w; x++) {
      let mn = 1, mx = -1; const o = x * step;
      for (let i = 0; i < step; i += Math.max(1, step >> 4)) { const v = data[o + i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
      const inside = x / w >= s && x / w <= e;
      g.fillStyle = inside ? '#22d3ee' : 'rgba(154,152,180,.35)';
      g.fillRect(x, (1 - mx) * h / 2, 1, Math.max(1, (mx - mn) * h / 2));
    }
  }
  function updateLabels() {
    const sp = parseFloat(el('mcSpeed').value);
    const [a, b] = trimSec();
    el('mcStartT').textContent = fmtT(a); el('mcEndT').textContent = fmtT(b);
    el('mcPitchT').textContent = el('mcPitch').value + ' st';
    el('mcVolT').textContent = el('mcVol').value + '%';
    el('mcFiT').textContent = el('mcFi').value + ' dtk'; el('mcFoT').textContent = el('mcFo').value + ' dtk';
    el('mcDur').textContent = 'Durasi: ' + fmtT(b - a) + '  →  ' + fmtT((b - a) / sp) + '  (' + sp.toFixed(2) + '×)';
    $$('#mcPresets .chip').forEach((c) => c.classList.toggle('on', Math.abs(parseFloat(c.dataset.s) - sp) < 0.001));
    const o = el('mcOrig'); o.playbackRate = sp;
    o.preservesPitch = o.mozPreservesPitch = o.webkitPreservesPitch = el('mcPreserve').checked;
  }
  function setSpeed(v) {
    v = Math.min(2, Math.max(0.25, Math.round(v * 100) / 100));
    el('mcSpeed').value = v; el('mcSpeedNum').value = v; updateLabels();
  }
  function resetControls() {
    setSpeed(DEF.speed); el('mcPitch').value = DEF.pitch; el('mcVol').value = DEF.vol; el('mcFi').value = DEF.fi; el('mcFo').value = DEF.fo;
    el('mcPreserve').checked = true; el('mcNorm').checked = true; el('mcStart').value = 0; el('mcEnd').value = 1000; updateLabels(); drawWave();
  }
  el('mcSpeed').addEventListener('input', (e) => setSpeed(parseFloat(e.target.value)));
  el('mcSpeedNum').addEventListener('change', (e) => setSpeed(parseFloat(e.target.value) || 1));
  $$('#mcPresets .chip').forEach((c) => c.addEventListener('click', () => setSpeed(parseFloat(c.dataset.s))));
  ['mcPitch', 'mcVol', 'mcFi', 'mcFo', 'mcPreserve'].forEach((id) => el(id).addEventListener('input', updateLabels));
  el('mcStart').addEventListener('input', () => { if (+el('mcStart').value > +el('mcEnd').value - 5) el('mcStart').value = +el('mcEnd').value - 5; updateLabels(); drawWave(); });
  el('mcEnd').addEventListener('input', () => { if (+el('mcEnd').value < +el('mcStart').value + 5) el('mcEnd').value = +el('mcStart').value + 5; updateLabels(); drawWave(); });
  el('mcReset').addEventListener('click', resetControls);
  window.addEventListener('resize', () => { if (mc.buffer) drawWave(); });

  el('mcQuick').addEventListener('click', () => {
    const o = el('mcOrig'); const [a, b] = trimSec(); updateLabels();
    if (!o.paused) { o.pause(); return; }
    o.currentTime = a; o.play().catch(() => {});
    o.ontimeupdate = () => { if (o.currentTime >= b) { o.pause(); o.ontimeupdate = null; } };
  });

  function progress(p, text) {
    el('mcBar').hidden = p == null; if (p == null) return;
    el('mcBarFill').style.width = Math.round(p * 100) + '%'; el('mcBarText').textContent = text || Math.round(p * 100) + '%';
  }

  el('mcProcess').addEventListener('click', async () => {
    if (!mc.buffer) return;
    const btn = el('mcProcess'); btn.disabled = true; el('mcOut').hidden = true;
    try {
      const buf = mc.buffer, sr = buf.sampleRate, [s0, s1] = trimSec();
      const a = Math.floor(s0 * sr), b = Math.max(a + 1024, Math.floor(s1 * sr));
      let ch = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c).slice(a, b));
      const T = parseFloat(el('mcSpeed').value), f = Math.pow(2, parseInt(el('mcPitch').value, 10) / 12), keep = el('mcPreserve').checked;
      progress(0.02, 'Memproses…');
      if (keep) {
        const r = T / f;
        if (Math.abs(r - 1) > 0.001) ch = await DSP.wsola(ch, r, sr, (p) => progress(0.05 + p * 0.8, 'Time-stretch ' + Math.round(p * 100) + '%'));
        if (Math.abs(f - 1) > 0.001) ch = ch.map((c) => DSP.resample(c, f));
      } else {
        const g = T * f; if (Math.abs(g - 1) > 0.001) ch = ch.map((c) => DSP.resample(c, g));
      }
      progress(0.9, 'Volume & fade…'); await DSP.tick();
      const n = ch[0].length, fi = parseFloat(el('mcFi').value) * sr, fo = parseFloat(el('mcFo').value) * sr;
      let gain = parseInt(el('mcVol').value, 10) / 100;
      if (el('mcNorm').checked) { let peak = 0; for (const c of ch) for (let i = 0; i < n; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; } if (peak > 0) gain *= 0.95 / peak; }
      for (const c of ch) for (let i = 0; i < n; i++) {
        let m = gain;
        if (fi > 0 && i < fi) m *= i / fi;
        if (fo > 0 && i > n - fo) m *= (n - i) / fo;
        const v = c[i] * m; c[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      }
      mc.result = { sr, ch };
      const wav = DSP.encodeWav(ch, sr);
      swapUrl(el('mcResult'), wav);
      el('mcOutInfo').textContent = fmtT(n / sr) + ' • ' + sr + ' Hz • ' + (ch.length > 1 ? 'stereo' : 'mono') + ' • estimasi MP3 128 kbps ≈ ' + fmtSize(16000 * n / sr);
      el('mcOut').hidden = false; progress(1, 'Selesai'); setTimeout(() => progress(null), 800);
      el('mcOut').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { setMsg(el('mcMsg'), 'Gagal memproses: ' + e.message, 'err'); progress(null); } finally { btn.disabled = false; }
  });

  el('mcWav').addEventListener('click', () => { if (mc.result) download(DSP.encodeWav(mc.result.ch, mc.result.sr), baseName(mc.name) + '_edit.wav'); });
  el('mcMp3').addEventListener('click', async () => {
    if (!mc.result) return; const btn = el('mcMp3'); btn.disabled = true;
    try { const k = parseInt(el('mcKbps').value, 10); const blob = await DSP.encodeMp3(mc.result.ch, mc.result.sr, k, (p) => progress(p, 'Encode MP3 ' + Math.round(p * 100) + '%')); progress(null); download(blob, baseName(mc.name) + '_edit.mp3'); toast('MP3 ' + fmtSize(blob.size)); }
    catch (e) { progress(null); setMsg(el('mcMsg'), e.message, 'err'); } finally { btn.disabled = false; }
  });
  el('mcToUp').addEventListener('click', async () => {
    if (!mc.result) return; const btn = el('mcToUp'); btn.disabled = true;
    try {
      const fit = await DSP.fitMp3(mc.result.ch, mc.result.sr, MAX_UP, (p) => progress(p, 'Menyiapkan MP3 ≤ 4 MB…'));
      progress(null);
      if (!fit) throw new Error('Audio terlalu panjang untuk batas 4 MB. Potong durasinya (Mulai/Selesai).');
      location.hash = '#uploader'; setUploadFile(fit.blob, baseName(mc.name) + '_edit.mp3');
      toast('MP3 ' + fit.kbps + ' kbps' + (fit.mono ? ' (mono)' : '') + ' • ' + fmtSize(fit.blob.size));
    } catch (e) { progress(null); setMsg(el('mcMsg'), e.message, 'err'); } finally { btn.disabled = false; }
  });

  /* ---------- UPLOADER ---------- */
  const up = { blob: null, name: '', ext: '' };
  bindDrop(el('upDrop'), el('upFile'), (f, n) => setUploadFile(f, n));

  function setUploadFile(blob, name) {
    up.blob = blob; up.name = name; up.ext = extOf(name, blob.type);
    el('upName').textContent = name; el('upInfo').textContent = fmtSize(blob.size) + ' • ' + (up.ext || blob.type || '?');
    up.dur = 0; up.assetId = null; up.added = null; el('upDur').value = ''; delete el('upDur').dataset.manual;
    el('upAudio').onloadedmetadata = () => { const d = el('upAudio').duration; if (isFinite(d) && d > 0) { up.dur = d; if (!el('upDur').dataset.manual) el('upDur').value = Math.ceil(d); } };
    swapUrl(el('upAudio'), blob); el('upFileCard').hidden = false;
    if (!el('upTitle').value) el('upTitle').value = baseName(name).slice(0, 50);
    const ok = UP_EXT.includes(up.ext) && blob.size <= MAX_UP;
    el('upPrep').hidden = ok;
    setMsg(el('upMsg'), ok ? 'File siap diupload.' : (!UP_EXT.includes(up.ext) ? 'Format ' + (up.ext || '?') + ' perlu dikonversi ke MP3.' : 'Ukuran melebihi 4.4 MB. Klik "Siapkan otomatis".'), ok ? 'ok' : 'err');
  }
  el('upPrep').addEventListener('click', async () => {
    if (!up.blob) return; const btn = el('upPrep'); btn.disabled = true; setMsg(el('upMsg'), 'Mengonversi ke MP3…');
    try {
      const buf = await decodeBlob(up.blob);
      const ch = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c));
      const fit = await DSP.fitMp3(ch, buf.sampleRate, MAX_UP, (p) => setMsg(el('upMsg'), 'Mengonversi ke MP3… ' + Math.round(p * 100) + '%'));
      if (!fit) throw new Error('Audio terlalu panjang untuk batas 4 MB. Potong durasi di Music Control.');
      setUploadFile(fit.blob, baseName(up.name) + '.mp3'); toast('MP3 ' + fit.kbps + ' kbps' + (fit.mono ? ' (mono)' : ''));
    } catch (e) { setMsg(el('upMsg'), e.message, 'err'); } finally { btn.disabled = false; }
  });

  // simpan data yang aman (bukan API key kecuali dicentang)
  try {
    const k = localStorage.getItem('nc_key'); if (k) { el('upKey').value = k; el('upRemember').checked = true; }
    const c = JSON.parse(localStorage.getItem('nc_creator') || '{}'); if (c.type) el('upType').value = c.type; if (c.id) el('upId').value = c.id;
  } catch (_) {}
  function persist() {
    try {
      if (el('upRemember').checked) localStorage.setItem('nc_key', el('upKey').value.trim()); else localStorage.removeItem('nc_key');
      localStorage.setItem('nc_creator', JSON.stringify({ type: el('upType').value, id: el('upId').value.trim() }));
      localStorage.setItem('nc_universe', el('libUniverse').value.trim());
      localStorage.setItem('nc_ds', el('libDs').value.trim());
      localStorage.setItem('nc_artist', el('upArtist').value.trim());
    } catch (_) {}
  }
  try {
    const u = localStorage.getItem('nc_universe'); if (u) { el('libUniverse').value = u; el('upUniverse').value = u; }
    const d = localStorage.getItem('nc_ds'); if (d) el('libDs').value = d;
    const ar = localStorage.getItem('nc_artist'); if (ar) el('upArtist').value = ar;
    if (el('upKey').value) el('libKey').value = el('upKey').value;
    el('libRemember').checked = el('upRemember').checked;
  } catch (_) {}
  // Uploader <-> Library memakai koneksi yang sama
  [['upKey', 'libKey'], ['upUniverse', 'libUniverse']].forEach(([a, b]) => {
    el(a).addEventListener('input', () => { el(b).value = el(a).value; });
    el(b).addEventListener('input', () => { el(a).value = el(b).value; });
  });
  el('upRemember').addEventListener('change', () => { el('libRemember').checked = el('upRemember').checked; });
  el('libRemember').addEventListener('change', () => { el('upRemember').checked = el('libRemember').checked; });

  let poll = { op: null, timer: null, tries: 0 };
  el('upDur').addEventListener('input', () => { el('upDur').dataset.manual = '1'; });

  /* ---------- koneksi Music System (DataStore lewat /api/library) ---------- */
  function conn() { return { key: el('libKey').value.trim() || el('upKey').value.trim(), universe: el('libUniverse').value.trim() || el('upUniverse').value.trim(), ds: el('libDs').value.trim() || 'ClubKit_v1_Music' }; }
  async function libCall(body) {
    const c = conn();
    if (!c.key) throw new Error('Isi API key Open Cloud.');
    if (!/^\d+$/.test(c.universe)) throw new Error('Isi Universe ID (angka, bukan Place ID).');
    persist();
    const r = await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-roblox-key': c.key }, body: JSON.stringify(Object.assign({ universeId: c.universe, datastore: c.ds }, body)) });
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || ('HTTP ' + r.status)), { data: d });
    return d;
  }
  async function addAssetToLibrary() {
    const msg = el('upLibMsg');
    if (!up.assetId) return;
    const dur = parseInt(el('upDur').value, 10) || Math.ceil(up.dur || 0);
    if (!dur) return setMsg(msg, 'Isi durasi (detik) dulu, lalu tekan "Tambahkan ke Music System".', 'err');
    el('upAddLib').disabled = true; setMsg(msg, 'Menambahkan ke Music System…');
    try {
      const d = await libCall({ action: 'add', tracks: [{ asset: up.assetId, title: el('upTitle').value.trim(), artist: el('upArtist').value.trim(), dur, speed: el('upSpeed').value || 1 }] });
      up.added = up.assetId;
      setMsg(msg, 'Masuk Music System (' + d.total + ' lagu). Muncul di game dalam ±60 detik (instan jika Messaging aktif).', 'ok');
      if (lib.loaded) loadLibrary(true);
    } catch (e) { setMsg(msg, e.message, 'err'); } finally { el('upAddLib').disabled = false; }
  }
  el('upAddLib').addEventListener('click', addAssetToLibrary);

  function showAsset(id) {
    up.assetId = id; el('upLibRow').hidden = false; setMsg(el('upLibMsg'), '');
    if (el('upAuto').checked && up.added !== id) setTimeout(addAssetToLibrary, 50);
    el('upIdBox').hidden = false; el('upAssetId').textContent = id; el('upAssetUrl').textContent = 'rbxassetid://' + id; el('upCheck').hidden = true;
    setMsg(el('upStatus'), 'Berhasil diupload. Audio kamu sudah punya Asset ID.', 'ok');
  }
  async function checkStatus() {
    if (!poll.op) return;
    try {
      const r = await fetch('/api/status?op=' + encodeURIComponent(poll.op), { headers: { 'x-roblox-key': el('upKey').value.trim() } });
      const d = await r.json();
      if (!d.ok) { clearTimeout(poll.timer); setMsg(el('upStatus'), d.error || 'Gagal memeriksa status', 'err'); el('upCheck').hidden = poll.tries < 40 && !d.done ? false : true; return; }
      if (d.done && d.assetId) { clearTimeout(poll.timer); return showAsset(d.assetId); }
      poll.tries++;
      setMsg(el('upStatus'), 'Menunggu pemrosesan / moderasi Roblox… (' + poll.tries + ')');
      el('upCheck').hidden = false;
      if (poll.tries < 15) poll.timer = setTimeout(checkStatus, 4000);
    } catch (e) { setMsg(el('upStatus'), e.message, 'err'); el('upCheck').hidden = false; }
  }
  el('upCheck').addEventListener('click', () => { poll.tries = 0; checkStatus(); });
  el('upCopyId').addEventListener('click', () => copy(el('upAssetId').textContent));
  el('upCopyUrl').addEventListener('click', () => copy(el('upAssetUrl').textContent));

  el('upGo').addEventListener('click', async () => {
    const msg = el('upMsg'); const key = el('upKey').value.trim(), id = el('upId').value.trim(), title = el('upTitle').value.trim();
    if (!up.blob) return setMsg(msg, 'Pilih file audio dulu.', 'err');
    if (!UP_EXT.includes(up.ext) || up.blob.size > MAX_UP) return setMsg(msg, 'File belum siap. Klik "Siapkan otomatis (MP3 ≤ 4 MB)".', 'err');
    if (!key) return setMsg(msg, 'Isi API key Open Cloud.', 'err');
    if (!/^\d+$/.test(id)) return setMsg(msg, 'User ID / Group ID harus angka.', 'err');
    if (!title) return setMsg(msg, 'Isi nama audio.', 'err');
    if (!el('upRights').checked) return setMsg(msg, 'Centang pernyataan hak / lisensi dulu.', 'err');
    if (el('upAuto').checked && !/^\d+$/.test(el('upUniverse').value.trim())) return setMsg(msg, 'Isi Universe ID game, atau matikan "Otomatis tambahkan ke Music System".', 'err');
    persist();
    const btn = el('upGo'); btn.disabled = true; setMsg(msg, 'Mengupload ke Roblox…');
    el('upResult').hidden = false; el('upIdBox').hidden = true; el('upCheck').hidden = true; setMsg(el('upStatus'), 'Mengupload…');
    clearTimeout(poll.timer);
    try {
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream', 'x-roblox-key': key, 'x-creator-type': el('upType').value, 'x-creator-id': id,
          'x-display-name': encodeURIComponent(title), 'x-description': encodeURIComponent(el('upDesc').value.trim()), 'x-file-ext': up.ext,
        },
        body: up.blob,
      });
      let d = {}; try { d = await r.json(); } catch (_) {}
      if (!r.ok || !d.ok) throw new Error(d.error || 'Upload gagal (HTTP ' + r.status + ')');
      setMsg(msg, '');
      if (d.assetId) showAsset(d.assetId);
      else { poll = { op: d.operationId, timer: null, tries: 0 }; setMsg(el('upStatus'), 'Terkirim. Menunggu pemrosesan / moderasi Roblox…'); poll.timer = setTimeout(checkStatus, 3000); el('upCheck').hidden = false; }
    } catch (e) { setMsg(el('upStatus'), e.message, 'err'); setMsg(msg, ''); } finally { btn.disabled = false; }
  });

  /* ---------- MUSIC LIBRARY ---------- */
  const lib = { tracks: [], loaded: false };
  const libMsg = el('libMsg');
  function renderLib() {
    const q = el('libSearch').value.trim().toLowerCase();
    const box = el('libList'); box.innerHTML = '';
    const rows = lib.tracks.filter((t) => !q || (t.title + ' ' + t.artist + ' ' + t.asset).toLowerCase().includes(q));
    el('libCount').textContent = lib.loaded ? '(' + lib.tracks.length + ' lagu)' : '';
    if (!rows.length) { box.innerHTML = '<small class="muted">' + (lib.loaded ? 'Tidak ada lagu.' : 'Tekan "Muat library" untuk melihat isi Music System.') + '</small>'; return; }
    rows.slice().reverse().forEach((t) => {
      const d = document.createElement('div'); d.className = 'track';
      const info = document.createElement('div');
      const b = document.createElement('b'); b.textContent = t.title;
      if (t.by === 'Web') { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'WEB'; b.appendChild(bd); }
      const sm = document.createElement('small'); sm.textContent = t.artist + ' • ID ' + t.asset + ' • ' + fmtT(t.dur) + ' • ' + t.speed + '×';
      info.append(b, sm);
      const tools = document.createElement('div'); tools.className = 'tools';
      const sp = document.createElement('input'); sp.type = 'number'; sp.min = '0.5'; sp.max = '2'; sp.step = '0.01'; sp.value = t.speed; sp.title = 'Speed di game (1 = normal)';
      const sv = document.createElement('button'); sv.className = 'btn'; sv.textContent = 'Simpan';
      const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Hapus';
      sv.onclick = async () => { sv.disabled = true; try { await libCall({ action: 'update', id: t.id, speed: sp.value }); t.speed = parseFloat(sp.value); toast('Speed disimpan'); renderLib(); } catch (e) { setMsg(libMsg, e.message, 'err'); } finally { sv.disabled = false; } };
      del.onclick = async () => { if (!confirm('Hapus "' + t.title + '" dari Music System? (masuk Trash di game)')) return; del.disabled = true; try { await libCall({ action: 'remove', id: t.id }); lib.tracks = lib.tracks.filter((x) => x.id !== t.id); toast('Dihapus'); renderLib(); } catch (e) { setMsg(libMsg, e.message, 'err'); del.disabled = false; } };
      tools.append(sp, sv, del); d.append(info, tools); box.appendChild(d);
    });
  }
  async function loadLibrary(silent) {
    if (!silent) setMsg(libMsg, 'Membaca library dari game…');
    try {
      const d = await libCall({ action: 'list' });
      lib.tracks = d.tracks || []; lib.loaded = true; renderLib();
      setMsg(libMsg, 'Terhubung. Versi library ' + d.ver + (d.locked ? ' • TERKUNCI di game (Edit Lock)' : '') + '.', d.locked ? 'err' : 'ok');
    } catch (e) { setMsg(libMsg, e.message, 'err'); }
  }
  el('libLoad').addEventListener('click', () => loadLibrary(false));
  el('libSearch').addEventListener('input', renderLib);

  el('libAdd').addEventListener('click', async () => {
    const t = { asset: el('libAsset').value.trim(), title: el('libTitle').value.trim(), artist: el('libArtist').value.trim(), dur: parseInt(el('libDur').value, 10), speed: el('libSpeed').value || 1 };
    if (!t.asset || !t.title || !t.dur) return setMsg(libMsg, 'Audio ID, judul, dan durasi wajib diisi.', 'err');
    const btn = el('libAdd'); btn.disabled = true; setMsg(libMsg, 'Menambahkan…');
    try {
      const d = await libCall({ action: 'add', tracks: [t] });
      setMsg(libMsg, 'Ditambahkan (' + d.total + ' lagu). Muncul di game dalam ±60 detik.', 'ok');
      ['libAsset', 'libTitle', 'libDur'].forEach((id) => { el(id).value = ''; }); await loadLibrary(true);
    } catch (e) { setMsg(libMsg, e.message, 'err'); } finally { btn.disabled = false; }
  });

  el('libBulkGo').addEventListener('click', async () => {
    const lines = el('libBulk').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return setMsg(libMsg, 'Isi daftar lagu dulu.', 'err');
    const tracks = [], bad = [];
    lines.forEach((l, i) => {
      const p = l.split('|').map((x) => x.trim());
      const dur = parseInt(p[3], 10);
      if (!p[0] || !p[1] || !dur) bad.push('baris ' + (i + 1)); else tracks.push({ asset: p[0], title: p[1], artist: p[2] || '', dur, speed: p[4] || 1 });
    });
    if (bad.length) return setMsg(libMsg, 'Format salah di ' + bad.slice(0, 5).join(', ') + '. Wajib: AssetID | Judul | Artis | Durasi', 'err');
    const btn = el('libBulkGo'); btn.disabled = true; setMsg(libMsg, 'Menambahkan ' + tracks.length + ' lagu…');
    try {
      const d = await libCall({ action: 'add', tracks });
      const sk = d.skipped && d.skipped.length ? ' • dilewati ' + d.skipped.length + ' (' + d.skipped[0].why + ')' : '';
      setMsg(libMsg, d.added.length + ' lagu ditambahkan' + sk + '. Total ' + d.total + '.', 'ok');
      el('libBulk').value = ''; await loadLibrary(true);
    } catch (e) { setMsg(libMsg, e.message + (e.data && e.data.skipped && e.data.skipped.length ? ' (' + e.data.skipped.length + ' dilewati)' : ''), 'err'); } finally { btn.disabled = false; }
  });
  renderLib();
})();
