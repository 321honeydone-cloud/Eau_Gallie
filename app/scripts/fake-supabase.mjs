// A stand in for the Supabase REST and storage endpoints the app uses.
// In memory, single process. For testing sync between two browser contexts.
import http from 'node:http';
const PORT = Number(process.argv[2] || 4600);
const rows = new Map();
const files = new Map();
let lastServerAt = 0;
const stamp = () => { lastServerAt = Math.max(lastServerAt + 1, Date.now()); return lastServerAt; };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Expose-Headers': '*' };
const body = req => new Promise(res => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (!req.headers.apikey) { res.writeHead(401, cors); return res.end('no key'); }
  if (u.pathname === '/rest/v1/sync_rows' && req.method === 'POST') {
    const list = JSON.parse((await body(req)).toString() || '[]');
    for (const r of list) rows.set(r.id, { ...r, server_at: stamp() });
    res.writeHead(201, cors); return res.end();
  }
  if (u.pathname === '/rest/v1/sync_rows' && req.method === 'GET') {
    const tbl = (u.searchParams.get('tbl') || '').replace('eq.', '');
    const since = Number((u.searchParams.get('server_at') || 'gt.0').replace('gt.', ''));
    const limit = Number(u.searchParams.get('limit') || 500);
    const out = [...rows.values()].filter(r => r.tbl === tbl && r.server_at > since).sort((a, b) => a.server_at - b.server_at).slice(0, limit);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(out));
  }
  const m = u.pathname.match(/^\/storage\/v1\/object\/files\/(.+)$/);
  if (m && req.method === 'POST') { files.set(decodeURIComponent(m[1]), { type: req.headers['content-type'], buf: await body(req) }); res.writeHead(200, cors); return res.end('{}'); }
  if (m && req.method === 'GET') { const f = files.get(decodeURIComponent(m[1])); if (!f) { res.writeHead(404, cors); return res.end(); } res.writeHead(200, { ...cors, 'Content-Type': f.type }); return res.end(f.buf); }
  res.writeHead(404, cors); res.end();
}).listen(PORT, () => console.log(`fake supabase on ${PORT}, rows=${rows.size}`));
