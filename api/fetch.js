// GET /api/fetch?url=...  -> mengambil file audio dari LINK LANGSUNG (milik sendiri / bebas royalti).
// Tidak mendukung YouTube / Spotify. Dibatasi: http(s), bukan alamat privat, content-type audio, maks ~4.4 MB.
const dns = require('dns').promises;
const net = require('net');
const { MAX_BYTES, checkAccess } = require('./_util');

const BLOCKED = ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'googlevideo.com', 'spotify.com', 'spotify.link', 'scdn.co'];
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|flac|m4a|aac)(\?|#|$)/i;

function blockedHost(host) {
  host = host.toLowerCase();
  return BLOCKED.some((b) => host === b || host.endsWith('.' + b));
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error('Link tidak valid'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Hanya link http/https');
  if (blockedHost(u.hostname)) throw new Error('YouTube / Spotify tidak didukung. Gunakan link file audio langsung yang kamu miliki hak-nya.');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('Alamat tujuan tidak diizinkan');
  return u;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!checkAccess(req)) return res.status(401).json({ ok: false, error: 'Kode akses salah' });
  try {
    let u = await safeUrl(String((req.query && req.query.url) || ''));
    let r;
    for (let i = 0; i < 4; i++) {
      r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'NoctPrismAudioStudio/1.0' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        u = await safeUrl(new URL(r.headers.get('location'), u).toString());
        continue;
      }
      break;
    }
    if (!r || !r.ok) return res.status(400).json({ ok: false, error: `Server sumber membalas HTTP ${r ? r.status : '?'}` });

    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const looksAudio = type.startsWith('audio/') || ((type === 'application/octet-stream' || type === 'binary/octet-stream') && AUDIO_EXT.test(u.pathname));
    if (!looksAudio) return res.status(415).json({ ok: false, error: 'Link itu bukan file audio langsung (mp3/wav/ogg/flac/m4a).' });
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return res.status(413).json({ ok: false, error: 'File lebih dari 4.4 MB (batas Vercel). Gunakan file lokal di Music Control.' });

    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} return res.status(413).json({ ok: false, error: 'File lebih dari 4.4 MB (batas Vercel).' }); }
      chunks.push(Buffer.from(value));
    }
    const fname = decodeURIComponent((u.pathname.split('/').pop() || 'audio').slice(0, 80)) || 'audio';
    res.setHeader('Content-Type', type.startsWith('audio/') ? type : 'audio/mpeg');
    res.setHeader('X-Filename', encodeURIComponent(fname));
    res.setHeader('Access-Control-Expose-Headers', 'X-Filename');
    return res.status(200).send(Buffer.concat(chunks));
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Gagal mengambil file' });
  }
};
