// POST /api/library  (JSON)  -> mengelola library Music System di game lewat Roblox Open Cloud (DataStore).
// Body: { action: 'list'|'add'|'update'|'remove', universeId, datastore?, tracks?[], id?, speed?, title?, artist? }
// Header: x-roblox-key (izin: DataStore Read+Write [+ Messaging publish], x-access-code (opsional)
// Library disimpan di DataStore "<Config.DataStoreName>_Music" (default ClubKit_v1_Music), key "Library" -
// sama persis dengan yang dipakai MusicService di game, jadi lagu langsung bisa diputar di Music System.
const crypto = require('crypto');
const { checkAccess } = require('./_util');

const BASE = 'https://apis.roblox.com';
const KEY_NAME = 'Library';
const TOPIC = 'ClubKit_MusicLib';
const LIMITS = { tracks: 500, title: 60, artist: 40, dur: 7200, trash: 20, perCall: 60 };

const emptyLib = () => ({ Ver: 0, Next: 1, Tracks: [], Albums: [], Trash: [], Blocked: {}, Bans: {}, Locks: { Queue: false, Vote: false, Edit: false } });
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const speedOf = (v) => {
  if (v === undefined || v === null || v === '') return 1;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0.5 || n > 2) throw new Error('Speed harus 0.5 - 2 (1 = normal)');
  return Math.round(n * 100) / 100;
};
const assetOf = (v) => {
  const m = /^\s*(?:rbxassetid:\/\/)?(\d{1,15})\s*$/.exec(String(v == null ? '' : v));
  if (!m || Number(m[1]) < 1) throw new Error('Audio ID tidak valid: ' + clean(v, 24));
  return Number(m[1]);
};

async function rbx(method, url, key, opts = {}) {
  const r = await fetch(url, { method, headers: { 'x-api-key': key, ...(opts.headers || {}) }, body: opts.body });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { ok: r.ok, status: r.status, data, headers: r.headers };
}
const entryUrl = (u, ds, extra = '') => `${BASE}/datastores/v1/universes/${u}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(ds)}&entryKey=${KEY_NAME}${extra}`;

async function getLib(u, ds, key) {
  const r = await rbx('GET', entryUrl(u, ds), key);
  if (r.status === 404) return { lib: emptyLib(), version: null };
  if (!r.ok) throw Object.assign(new Error(explain(r)), { status: r.status });
  const lib = r.data && typeof r.data === 'object' ? r.data : emptyLib();
  if (!Array.isArray(lib.Tracks)) lib.Tracks = [];
  if (!Array.isArray(lib.Albums)) lib.Albums = [];
  if (!Array.isArray(lib.Trash)) lib.Trash = [];
  if (typeof lib.Next !== 'number') lib.Next = lib.Tracks.length + 1;
  return { lib, version: r.headers.get('roblox-entry-version') };
}

async function putLib(u, ds, key, lib, version) {
  lib.Ver = (Number(lib.Ver) || 0) + 1;
  const body = JSON.stringify(lib);
  if (body.length > 3500000) throw new Error('Library terlalu besar');
  const md5 = crypto.createHash('md5').update(body).digest('base64');
  const extra = version ? `&matchVersion=${encodeURIComponent(version)}` : '&exclusiveCreate=true';
  const r = await rbx('POST', entryUrl(u, ds, extra), key, { headers: { 'content-type': 'application/json', 'content-md5': md5 }, body });
  if (r.status === 412 || r.status === 409) throw Object.assign(new Error('Library baru saja diubah di tempat lain. Ulangi aksi.'), { status: 409 });
  if (!r.ok) throw Object.assign(new Error(explain(r)), { status: r.status });
  return lib;
}

function explain(r) {
  const d = r.data && typeof r.data === 'object' ? (r.data.message || r.data.error || r.data.code) : r.data;
  if (r.status === 401 || r.status === 403) return 'API key ditolak. Pastikan izin DataStore (Read & Write) untuk experience ini dan IP diizinkan. ' + (d || '');
  if (r.status === 404) return 'Universe / DataStore tidak ditemukan. Cek Universe ID. ' + (d || '');
  if (r.status === 429) return 'Terlalu banyak permintaan ke Roblox. Coba lagi sebentar.';
  return `Roblox membalas HTTP ${r.status}${d ? ': ' + d : ''}`;
}

async function notify(u, key) {
  try { await rbx('POST', `${BASE}/messaging-service/v1/universes/${u}/topics/${TOPIC}`, key, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'web' }) }); } catch (_) { /* server game tetap sinkron otomatis tiap ~60 detik */ }
}

const brief = (t) => ({ id: t.Id, asset: t.Asset, title: t.Title, artist: t.Artist, dur: t.Dur, speed: t.Speed || 1, by: t.By, at: t.At, album: t.Album || '' });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Gunakan POST' });
  if (!checkAccess(req)) return res.status(401).json({ ok: false, error: 'Kode akses salah' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'Body harus JSON' });

  const key = req.headers['x-roblox-key'] || process.env.ROBLOX_API_KEY;
  if (!key) return res.status(400).json({ ok: false, error: 'API key Roblox belum diisi' });
  const u = String(b.universeId || process.env.UNIVERSE_ID || '').trim();
  if (!/^\d{1,20}$/.test(u)) return res.status(400).json({ ok: false, error: 'Universe ID harus berupa angka' });
  const ds = clean(b.datastore || process.env.MUSIC_DATASTORE || 'ClubKit_v1_Music', 50);
  if (!/^[A-Za-z0-9_\-. ]{1,50}$/.test(ds)) return res.status(400).json({ ok: false, error: 'Nama DataStore tidak valid' });

  try {
    const action = String(b.action || 'list');
    const { lib, version } = await getLib(u, ds, key);

    if (action === 'list') {
      return res.status(200).json({ ok: true, ver: lib.Ver || 0, locked: !!(lib.Locks && lib.Locks.Edit), albums: lib.Albums.map((a) => ({ id: a.Id, name: a.Name })), tracks: lib.Tracks.map(brief) });
    }
    if (lib.Locks && lib.Locks.Edit) return res.status(423).json({ ok: false, error: 'Library dikunci di game (Edit Lock / Read-Only). Buka kuncinya di Music Setup > Security.' });

    if (action === 'add') {
      const list = Array.isArray(b.tracks) ? b.tracks.slice(0, LIMITS.perCall) : [];
      if (!list.length) return res.status(400).json({ ok: false, error: 'Tidak ada lagu untuk ditambahkan' });
      const have = new Set(lib.Tracks.map((t) => t.Asset));
      const added = [], skipped = [];
      for (const raw of list) {
        let asset;
        try {
          asset = assetOf(raw.asset);
          const title = clean(raw.title, LIMITS.title);
          if (!title) throw new Error('Judul kosong');
          const dur = Math.ceil(Number(raw.dur));
          if (!Number.isFinite(dur) || dur < 1 || dur > LIMITS.dur) throw new Error('Durasi harus 1-' + LIMITS.dur + ' detik');
          if (have.has(asset)) { skipped.push({ asset, why: 'sudah ada di library' }); continue; }
          if (lib.Tracks.length >= LIMITS.tracks) { skipped.push({ asset, why: 'batas ' + LIMITS.tracks + ' track tercapai' }); continue; }
          const album = clean(raw.album, 12);
          const track = {
            Id: 't' + lib.Next, Title: title, Artist: clean(raw.artist, LIMITS.artist) || 'Unknown Artist', Asset: asset,
            Album: album && lib.Albums.some((a) => a.Id === album) ? album : '', Cover: 0, Dur: dur,
            At: Math.floor(Date.now() / 1000), By: 'Web', Speed: speedOf(raw.speed),
          };
          lib.Next += 1; lib.Tracks.push(track); have.add(asset); added.push(brief(track));
        } catch (e) { skipped.push({ asset: raw && raw.asset, why: e.message }); }
      }
      if (!added.length) return res.status(200).json({ ok: false, error: skipped.length ? 'Tidak ada yang ditambahkan: ' + skipped[0].why : 'Tidak ada yang ditambahkan', skipped });
      await putLib(u, ds, key, lib, version);
      await notify(u, key);
      return res.status(200).json({ ok: true, added, skipped, total: lib.Tracks.length, ver: lib.Ver });
    }

    const t = lib.Tracks.find((x) => x.Id === String(b.id || ''));
    if (!t) return res.status(404).json({ ok: false, error: 'Track tidak ditemukan' });

    if (action === 'update') {
      if (b.speed !== undefined) t.Speed = speedOf(b.speed);
      if (b.title !== undefined) { const v = clean(b.title, LIMITS.title); if (!v) throw new Error('Judul kosong'); t.Title = v; }
      if (b.artist !== undefined) t.Artist = clean(b.artist, LIMITS.artist) || 'Unknown Artist';
      t.Edited = 'Web';
      await putLib(u, ds, key, lib, version); await notify(u, key);
      return res.status(200).json({ ok: true, track: brief(t), ver: lib.Ver });
    }
    if (action === 'remove') {
      lib.Tracks = lib.Tracks.filter((x) => x !== t);
      lib.Trash.unshift({ Kind: 'Track', Name: t.Title, Data: t, By: 'Web', Uid: 'x' + lib.Next, At: Math.floor(Date.now() / 1000) });
      lib.Next += 1;
      while (lib.Trash.length > LIMITS.trash) lib.Trash.pop();
      await putLib(u, ds, key, lib, version); await notify(u, key);
      return res.status(200).json({ ok: true, removed: t.Id, total: lib.Tracks.length, ver: lib.Ver });
    }
    return res.status(400).json({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (e) {
    return res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 400).json({ ok: false, error: e.message || 'Gagal' });
  }
};
