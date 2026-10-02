import { test, expect } from '@playwright/test';
import { CLIENT_ID as clientId } from '../fixtures.js';

const key = 'unspotted:/spotless/:';
const track = { id: 'track1', uri: 'spotify:track:track1', name: 'A favorite song', duration_ms: 180000, artists: [{ name: 'An artist' }], album: { name: 'An album', images: [] } };
const playlist = { id: 'list1', uri: 'spotify:playlist:list1', name: 'Sunday mornings', owner: { display_name: 'You' }, images: [] };

async function signedIn(page, expired = false) {
  await page.addInitScript(({ key, clientId, expired }) => {
    localStorage.setItem(key + 'client', clientId);
    localStorage.setItem(key + 'tokens', JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expires_at: Date.now() + (expired ? -1000 : 3600000) }));
  }, { key, clientId, expired });
}
async function mockSpotify(page, onRequest = () => {}) {
  let playing = false, shuffle = false;
  await page.route('https://api.spotify.com/**', async route => {
    onRequest(route.request());
    const url = new URL(route.request().url());
    if (route.request().method() === 'PUT' && url.pathname === '/v1/me/player/play') playing = true;
    if (route.request().method() === 'PUT' && url.pathname === '/v1/me/player/pause') playing = false;
    if (route.request().method() === 'PUT' && url.pathname === '/v1/me/player/shuffle') shuffle = url.searchParams.get('state') === 'true';
    let body = {};
    if (url.pathname === '/v1/me') body = { display_name: 'Alex' };
    if (url.pathname === '/v1/me/playlists') body = { items: [playlist], next: null };
    if (url.pathname === '/v1/me/tracks' || url.pathname.includes('/items')) body = { items: [{ item: track }], next: null };
    if (url.pathname === '/v1/search') body = { tracks: { items: [track], next: null } };
    if (url.pathname === '/v1/me/player') body = { item: track, is_playing: playing, shuffle_state: shuffle, progress_ms: 5000, device: { id: 'device1', name: 'iPhone' } };
    if (url.pathname === '/v1/me/player/devices') body = { devices: [{ id: 'device1', name: 'iPhone', is_active: true, type: 'Smartphone' }] };
    await route.fulfill({ json: body });
  });
}
test('responsive onboarding, settings and app manifest work under a repository path', async ({ page, request }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Your music/ })).toBeVisible();
  await expect(page.getByLabel('Spotify Client ID')).toHaveCount(0);
  await expect(page.locator('#settings-form')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open Spotify', exact: false })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const manifest = await (await request.get('./manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.short_name).toBe('Unspotted');
  await expect(page).toHaveTitle('Unspotted — Your music, simply.');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', './icons/apple-touch-icon.png');
  expect(errors).toEqual([]);
});
test('PKCE login has state and a S256 challenge without a secret', async ({ page }) => {
  let authorization;
  await page.route('https://accounts.spotify.com/authorize?**', route => { authorization = new URL(route.request().url()); return route.fulfill({ body: 'Spotify sign in' }); });
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect with Spotify', exact: true }).click();
  await expect.poll(() => authorization?.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toHaveLength(43);
  expect(authorization.searchParams.get('state')).toHaveLength(32);
  expect(authorization.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4173/spotless/');
  expect(authorization.searchParams.has('client_secret')).toBe(false);
  expect(authorization.searchParams.get('show_dialog')).toBe('true');
  expect(authorization.searchParams.get('client_id')).toBe(clientId);
});
test('rejects forged OAuth callback without exchanging a token', async ({ page }) => {
  let exchanged = false;
  await page.route('https://accounts.spotify.com/api/token', route => { exchanged = true; return route.fulfill({ status: 400, json: {} }); });
  await page.goto('./?code=forged&state=wrong');
  await expect(page.locator('#toast')).toContainText('could not be verified');
  expect(exchanged).toBe(false);
  expect(new URL(page.url()).search).toBe('');
});
test('library, search, device transfer and playback use the Spotify API', async ({ page }) => {
  await signedIn(page);
  const requests = []; await mockSpotify(page, request => requests.push(request));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sunday mornings', exact: true })).toBeVisible();
  await expect(page.locator('a[href^="https://open.spotify.com"]')).toHaveCount(1);
  await expect(page.locator('.playlist-card a, #player a, #home-playback a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sunday mornings', exact: true }).click();
  await expect(page.locator('a[href^="https://open.spotify.com"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play A favorite song', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play A favorite song', exact: true }).click();
  await expect.poll(() => requests.filter(r => r.url().includes('/play?')).length).toBe(1);
  const playRequest = requests.find(r => r.url().includes('/play?'));
  expect(playRequest.method()).toBe('PUT');
  expect(playRequest.postDataJSON()).toEqual({ context_uri: playlist.uri, offset: { uri: track.uri } });
  await page.locator('[data-nav="search"]:visible').click();
  await page.getByLabel('Search Spotify').fill('a favorite');
  await page.locator('#search-form').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.track-info strong')).toHaveText('A favorite song');
  await expect(page.locator('a[href^="https://open.spotify.com"]')).toHaveCount(0);
  expect(requests.find(r => r.url().includes('/search?')).url()).toContain('limit=10');
  await page.locator('[data-action="devices"]').click();
  await page.locator('[data-device="device1"]').click();
  await expect(page.locator('#devices')).not.toBeVisible();
  expect(requests.find(r => r.method() === 'PUT' && new URL(r.url()).pathname === '/v1/me/player').postDataJSON()).toEqual({ device_ids: ['device1'], play: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('concurrent startup requests share one token refresh', async ({ page }) => {
  await signedIn(page, true); await mockSpotify(page);
  let refreshes = 0;
  await page.route('https://accounts.spotify.com/api/token', async route => {
    refreshes++; await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: { access_token: 'refreshed', expires_in: 3600 } });
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Sunday mornings', exact: true })).toBeVisible();
  expect(refreshes).toBe(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key + 'tokens')).refresh_token, key)).toBe('test-refresh');
});
test('installed app shell opens offline and caches no OAuth query URLs', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('./?code=invalid&state=invalid');
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(cached.some(url => url.includes('code=') || url.includes('spotify.com'))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Your music/ })).toBeVisible();
  await expect(page.locator('#offline')).toBeVisible();
});

test('home provides resume, search, liked songs and direct playlist playback', async ({ page }, testInfo) => {
  await signedIn(page);
  const requests = []; await mockSpotify(page, request => requests.push(request));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Hi, Alex.' })).toBeVisible();
  await expect(page.locator('#home-playback').getByRole('heading', { name: track.name })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(() => requests.filter(r => r.url().includes('/play?')).length).toBe(1);
  await page.getByRole('button', { name: 'Play playlist Sunday mornings', exact: true }).click();
  await expect.poll(() => requests.filter(r => r.url().includes('/play?')).length).toBe(2);
  expect(requests.filter(r => r.url().includes('/play?'))[1].postDataJSON()).toEqual({ context_uri: playlist.uri });
  await page.getByLabel('Search Spotify').fill('a favorite');
  await page.locator('#home-search-form').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.track-info strong')).toHaveText(track.name);
  await page.locator('[data-nav="home"]:visible').click();
  await page.getByRole('button', { name: /Liked songs/ }).click();
  await expect(page.getByRole('heading', { name: /Liked songs/ })).toBeVisible();
  await expect(page.locator('.track-info strong')).toHaveText(track.name);
});

test('playlist list mode persists across home, library and reload without a refetch', async ({ page }, testInfo) => {
  await signedIn(page);
  const requests = []; await mockSpotify(page, request => requests.push(request));
  await page.goto('./');
  await expect(page.locator('.playlist-grid')).toBeVisible();
  const count = requests.filter(r => r.url().includes('/me/playlists')).length;
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator('.playlist-list')).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(requests.filter(r => r.url().includes('/me/playlists')).length).toBe(count);
  await page.locator('[data-nav="library"]:visible').click();
  await expect(page.locator('.playlist-list')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('playlist-list.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sunday mornings', exact: true }).click();
  await expect(page.locator('.track-info strong')).toHaveText(track.name);
  await page.getByRole('button', { name: 'Your library', exact: true }).filter({ has: page.locator('svg') }).first().click();
  await page.reload();
  await expect(page.locator('.playlist-list')).toBeVisible();
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await expect(page.locator('.playlist-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('switching accounts explains Spotify sessions and requests approval again', async ({ page }) => {
  await signedIn(page); await mockSpotify(page);
  let authorization;
  await page.route('https://accounts.spotify.com/authorize?**', route => {
    authorization = new URL(route.request().url()); return route.fulfill({ body: 'Spotify approval' });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Switch Spotify account' }).click();
  await expect(page.locator('#settings')).toContainText('it is not an account picker');
  await expect(page.locator('#settings')).toContainText('sign out of Spotify in this browser');
  await page.getByRole('button', { name: 'Continue to Spotify' }).click();
  await expect.poll(() => authorization?.searchParams.get('show_dialog')).toBe('true');
  expect(authorization.searchParams.get('client_id')).toBe(clientId);
});

test('the rebrand preserves legacy login once and disconnect does not restore it', async ({ page }) => {
  await page.addInitScript(({ clientId }) => {
    if (sessionStorage.getItem('legacy-seeded')) return;
    sessionStorage.setItem('legacy-seeded', 'yes');
    localStorage.setItem('spotless:/spotless/:client', clientId);
    localStorage.setItem('spotless:/spotless/:tokens', JSON.stringify({ access_token: 'legacy', refresh_token: 'legacy-refresh', expires_at: Date.now() + 3600000 }));
  }, { clientId });
  await mockSpotify(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Hi, Alex.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('spotless:/spotless/:tokens'))).toBeNull();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key + 'tokens')).refresh_token, key)).toBe('legacy-refresh');
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect Spotify on this device' }).click();
  await expect(page.getByRole('button', { name: 'Connect with Spotify', exact: true })).toBeVisible();
  await page.reload();
  expect(await page.evaluate(key => localStorage.getItem(key + 'tokens'), key)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key + 'client'), key)).toBe(clientId);
});

test('browser client IDs cannot override the configured app', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key + 'client', 'b'.repeat(32));
    localStorage.setItem(key + 'tokens', JSON.stringify({ refresh_token: 'different-app', access_token: 'different-app', expires_at: Date.now() + 3600000 }));
  }, { key });
  let authorization;
  await page.route('https://accounts.spotify.com/authorize?**', route => {
    authorization = new URL(route.request().url()); return route.fulfill({ body: 'Spotify sign in' });
  });
  await page.goto('./');
  expect(await page.evaluate(key => localStorage.getItem(key + 'tokens'), key)).toBeNull();
  await page.getByRole('button', { name: 'Connect with Spotify', exact: true }).click();
  await expect.poll(() => authorization?.searchParams.get('client_id')).toBe(clientId);
});

test('all transport controls work and shuffle reflects Spotify state', async ({ page }) => {
  await signedIn(page);
  const requests = []; await mockSpotify(page, request => requests.push(request));
  await page.goto('./');
  const controls = page.locator('#player');
  await expect(controls.getByRole('button', { name: 'Previous track' })).toBeEnabled();
  await controls.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await controls.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  for (const [label, endpoint] of [['Next track', 'next'], ['Previous track', 'previous']]) {
    await controls.getByRole('button', { name: label }).click();
    await expect.poll(() => requests.some(r => r.method() === 'POST' && new URL(r.url()).pathname === `/v1/me/player/${endpoint}`)).toBe(true);
    await expect(controls.getByRole('button', { name: label })).toBeEnabled();
  }
  const shuffle = controls.getByRole('button', { name: 'Shuffle', exact: true });
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
  await expect(shuffle).toBeEnabled();
  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  const shuffleRequests = requests.filter(r => new URL(r.url()).pathname === '/v1/me/player/shuffle');
  expect(shuffleRequests.map(r => [r.method(), new URL(r.url()).searchParams.get('state'), new URL(r.url()).searchParams.get('device_id')])).toEqual([
    ['PUT', 'true', 'device1'], ['PUT', 'false', 'device1'],
  ]);
  expect(requests.some(r => r.method() === 'PUT' && new URL(r.url()).pathname === '/v1/me/player/pause')).toBe(true);
});

test('header and complete player stay accessible while scrolling', async ({ page }, testInfo) => {
  await signedIn(page); await mockSpotify(page);
  await page.route('https://api.spotify.com/v1/me/playlists?**', route => route.fulfill({ json: {
    items: Array.from({ length: 24 }, (_, i) => ({ ...playlist, id: `list${i}`, name: `Playlist ${i + 1}` })), next: null,
  } }));
  await page.goto('./');
  await page.locator('[data-nav="library"]:visible').click();
  await expect(page.locator('.playlist-card')).toHaveCount(24);
  await page.evaluate(() => window.scrollTo(0, 650));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  const header = await page.locator('.topbar').boundingBox();
  expect(header.y).toBeCloseTo(0, 0);
  for (const selector of ['.account-button', '#player [data-command="previous"]', '#player [data-command="next"]', '#player .play-button', '#player [data-command="shuffle"]']) {
    const button = page.locator(selector);
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('scrolled-player.png') });
});

test('shuffle failures preserve the prior mode and restore the controls', async ({ page }) => {
  await signedIn(page); await mockSpotify(page);
  await page.route('https://api.spotify.com/v1/me/player/shuffle?**', route => route.fulfill({ status: 500, json: { error: { message: 'Shuffle is temporarily unavailable.' } } }));
  await page.goto('./');
  const shuffle = page.locator('#player').getByRole('button', { name: 'Shuffle', exact: true });
  await expect(shuffle).toBeEnabled();
  await shuffle.click();
  await expect(page.locator('#toast')).toContainText('Shuffle is temporarily unavailable.');
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  await expect(shuffle).toBeEnabled();
});

test('Spotify restrictions disable unsupported commands and preserve active shuffle', async ({ page }) => {
  await signedIn(page); await mockSpotify(page);
  await page.route('https://api.spotify.com/v1/me/player', route => route.fulfill({ json: {
    item: track, is_playing: true, shuffle_state: true, device: { id: 'device1', name: 'iPhone' },
    actions: { disallows: { skipping_prev: true, toggling_shuffle: true } },
  } }));
  await page.goto('./');
  const controls = page.locator('#player');
  await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(controls.getByRole('button', { name: 'Previous track' })).toBeDisabled();
  await expect(controls.getByRole('button', { name: 'Next track' })).toBeEnabled();
  await expect(controls.getByRole('button', { name: 'Shuffle', exact: true })).toBeDisabled();
  await expect(controls.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
