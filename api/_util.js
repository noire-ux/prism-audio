// Utilitas bersama untuk fungsi serverless (file berawalan _ tidak dijadikan endpoint)
const MAX_BYTES = 4400000; // batas body fungsi Vercel ~4.5 MB

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES + 1024) throw Object.assign(new Error('File terlalu besar'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function checkAccess(req) {
  const need = process.env.ACCESS_CODE;
  if (!need) return true;
  return req.headers['x-access-code'] === need;
}

function opAssetId(data) {
  const r = data && data.response;
  if (!r) return null;
  return String(r.assetId || (r.path || '').split('/').pop() || '') || null;
}

module.exports = { MAX_BYTES, readBody, checkAccess, opAssetId };
