// POST /api/upload  -> mengunggah audio ke Roblox lewat Open Cloud (Assets API) dan mengembalikan Asset ID.
// Body: biner audio (application/octet-stream). Header: x-roblox-key, x-creator-type (User|Group), x-creator-id,
//       x-display-name, x-description (URL-encoded), x-file-ext (mp3|ogg|wav|flac), x-access-code (opsional).
const { MAX_BYTES, readBody, checkAccess, opAssetId } = require('./_util');

const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };
const API = 'https://apis.roblox.com/assets/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Gunakan POST' });
  if (!checkAccess(req)) return res.status(401).json({ ok: false, error: 'Kode akses salah' });

  const key = req.headers['x-roblox-key'] || process.env.ROBLOX_API_KEY;
  if (!key) return res.status(400).json({ ok: false, error: 'API key Roblox belum diisi' });

  const creatorType = req.headers['x-creator-type'] === 'Group' ? 'groupId' : 'userId';
  const creatorId = String(req.headers['x-creator-id'] || '').trim();
  if (!/^\d{1,20}$/.test(creatorId)) return res.status(400).json({ ok: false, error: 'Creator ID harus berupa angka' });

  const ext = String(req.headers['x-file-ext'] || 'mp3').toLowerCase();
  if (!MIME[ext]) return res.status(400).json({ ok: false, error: 'Format harus mp3, ogg, wav, atau flac' });

  let name = 'Audio';
  let description = '';
  try {
    name = decodeURIComponent(req.headers['x-display-name'] || 'Audio');
    description = decodeURIComponent(req.headers['x-description'] || '');
  } catch (_) { /* pakai default */ }
  name = name.trim().slice(0, 50) || 'Audio';

  let buf;
  try { buf = await readBody(req); } catch (e) { return res.status(e.status || 400).json({ ok: false, error: e.message }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'File kosong' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'File melebihi 4.4 MB. Kecilkan bitrate / potong durasi di Music Control.' });

  try {
    const form = new FormData();
    form.append('request', JSON.stringify({
      assetType: 'Audio',
      displayName: name,
      description: description.slice(0, 1000),
      creationContext: { creator: { [creatorType]: creatorId } },
    }));
    form.append('fileContent', new Blob([buf], { type: MIME[ext] }), `audio.${ext}`);

    const r = await fetch(`${API}/assets`, { method: 'POST', headers: { 'x-api-key': key }, body: form });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data.message || data.code || `Roblox menolak (HTTP ${r.status})`, detail: data });
    }

    const operationId = data.operationId || String(data.path || '').split('/').pop();
    // tunggu singkat; Roblox memproses/moderasi secara asinkron
    for (let i = 0; i < 5 && operationId; i++) {
      await sleep(1500);
      const o = await fetch(`${API}/operations/${operationId}`, { headers: { 'x-api-key': key } });
      const od = await o.json().catch(() => ({}));
      if (od.done) {
        if (od.error) return res.status(200).json({ ok: false, done: true, error: od.error.message || 'Gagal diproses Roblox', detail: od.error });
        return res.status(200).json({ ok: true, done: true, operationId, assetId: opAssetId(od) });
      }
    }
    return res.status(200).json({ ok: true, done: false, operationId });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Gagal menghubungi Roblox: ' + e.message });
  }
};
