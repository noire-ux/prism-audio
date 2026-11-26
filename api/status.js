// GET /api/status?op=OPERATION_ID  -> cek status upload (moderasi) di Roblox.
const { checkAccess, opAssetId } = require('./_util');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!checkAccess(req)) return res.status(401).json({ ok: false, error: 'Kode akses salah' });
  const key = req.headers['x-roblox-key'] || process.env.ROBLOX_API_KEY;
  const op = String((req.query && req.query.op) || '');
  if (!key) return res.status(400).json({ ok: false, error: 'API key Roblox belum diisi' });
  if (!/^[A-Za-z0-9-]{4,100}$/.test(op)) return res.status(400).json({ ok: false, error: 'Operation ID tidak valid' });
  try {
    const r = await fetch(`https://apis.roblox.com/assets/v1/operations/${op}`, { headers: { 'x-api-key': key } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok: false, error: d.message || `HTTP ${r.status}` });
    if (d.done && d.error) return res.status(200).json({ ok: false, done: true, error: d.error.message || 'Gagal diproses Roblox' });
    return res.status(200).json({ ok: true, done: !!d.done, assetId: d.done ? opAssetId(d) : null });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};
