import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// Serve the real build at a repository subpath, as GitHub Pages does.
const root = resolve('dist-e2e');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/spotless/')) { res.writeHead(404).end(); return; }
  const file = resolve(root, decodeURIComponent(url.pathname.slice('/spotless/'.length)) || 'index.html');
  if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1');
