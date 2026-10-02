import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(`${directory}/${entry.name}`) : `${directory}/${entry.name}`))).flat();
}
const outputDirectory = process.argv[2] || 'dist';
const files = (await filesIn(outputDirectory)).filter(file => !file.endsWith('/sw.js'));
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 12);
const assets = files.map(file => './' + file.slice(outputDirectory.length + 1));
await writeFile(`${outputDirectory}/sw.js`, `
const CACHE = 'unspotted-' + new URL(self.registration.scope).pathname + '-${version}';
const PREFIX = 'unspotted-' + new URL(self.registration.scope).pathname + '-';
const LEGACY_PREFIX = 'spotless-' + new URL(self.registration.scope).pathname + '-';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(PREFIX) || key.startsWith(LEGACY_PREFIX)) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Spotify tokens, API responses, audio, and OAuth callback URLs are never cached.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('./index.html'))));
    return;
  }
  if (url.search) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
`);
console.log(`Service worker: ${assets.length} app assets, version ${version}`);
