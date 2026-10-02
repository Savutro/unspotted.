import './style.css';
import { api, login, finishLogin, isConnected, disconnect, redirectUri } from './spotify.js';
import { Player } from './player.js';
import { getPlaylistView, savePlaylistView } from './storage.js';
import { escapeHtml as h, duration, imageUrl, normalizeTracks } from './utils.js';

const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  library: '<path d="M4 4v16M9 4v16m5-15 6 14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  next: '<path d="m5 5 10 7-10 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  shuffle: '<path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.6 0 3.2-2 4.8-4.5M14 8.5C15.4 7 16.6 6 18 6h3m-4-4 4 4-4 4"/>',
  previous: '<path d="m19 5-10 7 10 7z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z"/>',
  device: '<rect x="3" y="4" width="12" height="12" rx="2"/><path d="M6 20h6"/><rect x="17" y="9" width="5" height="11" rx="1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  music: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.music}</svg>`;
const state = { playlistView: getPlaylistView(), page: 'home', connected: false, profile: null, playlists: [], playlistNext: null, tracks: [], trackNext: null, loading: false, error: '', query: '', results: [], resultNext: null, collection: null, playback: null };
const app = document.querySelector('#app');
let viewGeneration = 0, searchAbort, toastTimer, polling = false, playbackError = '', commandBusy = false, playbackRevision = 0;
const player = new Player(playback => { state.playback = playback; renderPlayer(); }, notifyError);

function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 7000);
}
function notifyError(error) {
  const message = error.message || String(error);
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    let notice = dialog.querySelector('.dialog-error');
    if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-error error-panel'; notice.setAttribute('role', 'alert'); dialog.append(notice); }
    notice.textContent = message; notice.scrollIntoView({ block: 'nearest' });
  }
  toast(message);
}
function art(item, className = '') {
  const url = imageUrl(item);
  return `<span class="art ${className}">${url ? `<img src="${h(url)}" alt="" loading="lazy" />` : icon('music')}</span>`;
}
function nav() {
  return ['home', 'search', 'library'].map(page => `<button class="nav-item ${state.page === page ? 'active' : ''}" data-nav="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(page)}<span>${{ home: 'Home', search: 'Search', library: 'Your library' }[page]}</span></button>`).join('');
}
function render() {
  app.innerHTML = `<aside class="sidebar"><a href="./" class="brand"><span class="brand-icon"><img src="./icon.svg" alt="" /></span>unspotted<span class="brand-dot">.</span></a><div class="sidebar-caption">A LITTLE LESS NOISE.</div><nav aria-label="Main navigation">${nav()}</nav><div class="sidebar-bottom"><div class="connection-dot ${state.connected ? 'connected' : ''}"></div><span>${state.connected ? 'Connected to Spotify' : 'Your music, simply.'}</span><button class="settings-button" data-action="settings">${icon('settings')} Settings</button></div></aside>
    <main><header class="topbar"><span class="mobile-brand">unspotted.</span><span class="topbar-note">YOUR MUSIC, WITHIN REACH</span><button class="account-button" data-action="${state.connected ? 'settings' : 'connect'}">${state.connected ? `<span class="avatar" aria-hidden="true">${h((state.profile?.display_name || 'You').slice(0, 1))}</span><span>${h(state.profile?.display_name || 'Your account')}</span>` : `${icon('arrow')}<span>Sign in</span>`}</button></header><div id="offline" class="offline" ${navigator.onLine ? 'hidden' : ''}>You’re offline. Your listening room is here; music needs a connection.</div><section id="content">${content()}</section><footer class="page-footer"><span>Less scrolling. More listening.</span><span>Made for your Spotify · Personal & independent${state.page === 'home' ? ' · <a href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Open Spotify ↗</a>' : ''}</span></footer></main>
    <div id="player"></div><nav class="mobile-nav" aria-label="Mobile navigation">${nav()}</nav>`;
  renderPlayer();
}
function searchForm(home = false) {
  return `<form id="${home ? 'home-search-form' : 'search-form'}" class="search-box">${icon('search')}<input id="search" type="search" name="query" placeholder="Search songs, artists, or albums" value="${home ? '' : h(state.query)}" aria-label="Search Spotify" autocomplete="off" required/><button class="button dark" type="submit">Search</button></form>`;
}
function viewToggle() {
  return `<div class="view-toggle" role="group" aria-label="Playlist layout"><button data-view="grid" aria-label="Grid view" aria-pressed="${state.playlistView === 'grid'}">${icon('grid')}<span>Grid</span></button><button data-view="list" aria-label="List view" aria-pressed="${state.playlistView === 'list'}">${icon('list')}<span>List</span></button></div>`;
}
function content() {
  if (state.page === 'search') return `<div class="page-heading"><p class="eyebrow">SEARCH SPOTIFY</p><h1>Find your music.</h1><p>Search for a song, artist, or album to find tracks.</p></div>${searchForm()}${!state.connected ? connectNote() : state.loading ? loading() : state.error ? errorPanel() : state.query ? `<div class="section-heading"><h2>Search results</h2><span>Tracks</span></div>${trackList(state.results)}${state.resultNext ? '<button class="button secondary load-more" data-action="more-search">More results</button>' : ''}` : `<div class="empty-state">${icon('search')}<h2>What would you like to hear?</h2><p>Search the Spotify catalog above.</p></div>`}`;
  if (state.page === 'library') return `<div class="page-heading"><p class="eyebrow">YOUR SAVED MUSIC</p><h1>${h(state.collection?.name || 'Your library')}<span class="accent-dot">.</span></h1><p>${state.collection ? 'Choose a song or play the whole playlist.' : 'Open a playlist or press play to start listening.'}</p></div>${!state.connected ? connectNote() : `${state.collection ? `<div class="collection-actions"><button class="button secondary" data-action="library-back">${icon('back')} Your library</button>${state.collection.uri ? `<button class="button dark" data-play-uri="${h(state.collection.uri)}">${icon('play')} Play playlist</button>` : ''}</div>` : `<div class="library-toolbar"><div class="library-tabs"><button class="chip selected" data-action="playlists">Playlists</button><button class="chip" data-action="liked">${icon('heart')} Liked songs</button></div>${viewToggle()}</div>`}${state.loading ? loading() : state.error ? errorPanel() : state.collection ? `${trackList(state.tracks)}${state.trackNext ? '<button class="button secondary load-more" data-action="more-tracks">Load more songs</button>' : ''}` : `${playlistGrid(state.playlists)}${state.playlistNext ? '<button class="button secondary load-more" data-action="more-playlists">Load more playlists</button>' : ''}`}`}`;
  if (!state.connected) return `<div class="page-heading"><p class="eyebrow">WELCOME TO UNSPOTTED</p><h1>Your music, within reach.</h1><p>Playlists, liked songs, and playback. A simpler home for your Spotify.</p></div><section class="welcome-panel"><div><h2>Connect your music.</h2><p>Use your Spotify Premium account to see your own library and choose where to listen.</p><button class="button lime" data-action="connect">Connect with Spotify ${icon('arrow')}</button></div><ol><li><strong>Connect Spotify</strong><span>Sign in with your Spotify account.</span></li><li><strong>Choose a device</strong><span>Listen here or control your Spotify app.</span></li><li><strong>Press play</strong><span>Your music is ready when you are.</span></li></ol></section><section class="install-card"><span class="install-icon">${icon('device')}</span><div><h3>Keep Unspotted on your home screen.</h3><p>In Safari, tap Share → Add to Home Screen, then open Unspotted from its icon.</p></div><button class="text-button" data-action="settings">App settings ${icon('arrow')}</button></section>`;
  return `<div class="page-heading home-heading"><div><p class="eyebrow">YOUR SPOTIFY</p><h1>${state.profile?.display_name ? `Hi, ${h(state.profile.display_name.split(' ')[0])}.` : 'Your music.'}</h1><p>What would you like to listen to?</p></div><button class="button secondary" data-action="refresh-home">Refresh</button></div>${searchForm(true)}<div class="home-shortcuts"><button class="shortcut" data-action="liked"><span class="shortcut-icon lilac">${icon('heart')}</span><span><strong>Liked songs</strong><small>Your saved favorites</small></span>${icon('arrow')}</button><button class="shortcut" data-action="browse"><span class="shortcut-icon mint">${icon('library')}</span><span><strong>Your library</strong><small>Browse all playlists</small></span>${icon('arrow')}</button></div><section id="home-playback" aria-label="Current listening session">${homePlayback()}</section><div class="section-heading playlist-heading"><h2>Your playlists</h2><div class="section-actions">${viewToggle()}<button class="text-button" data-action="browse">View all ${icon('arrow')}</button></div></div>${state.loading ? loading() : state.error ? errorPanel() : playlistGrid(state.playlists.slice(0, 6))}`;
}
function homePlayback() {
  const p = state.playback, track = p?.item;
  if (!track) return `<div class="session-card idle-session"><span class="shortcut-icon mint">${icon('device')}</span><div class="session-info"><h2>Choose where to listen</h2><p>Use this browser, the Spotify app, or a connected speaker.</p></div><button class="button dark" data-action="devices">${icon('device')} Devices</button></div>`;
  return `<div class="session-card">${art(track)}<div class="session-info"><p class="eyebrow">${p.is_playing ? 'NOW PLAYING' : 'READY TO RESUME'}</p><h2>${h(track.name)}</h2><p>${h(track.artists?.map(a => a.name).join(', ') || '')}</p></div><div class="session-actions"><button class="button dark" data-command="${p.is_playing ? 'pause' : 'play'}" ${!canCommand(p.is_playing ? 'pause' : 'play') ? 'disabled' : ''}>${icon(p.is_playing ? 'pause' : 'play')}${p.is_playing ? 'Pause' : 'Resume'}</button><button class="text-button session-device" data-action="devices">${icon('device')} ${h(p.device?.name || 'Choose a device')}</button></div></div>`;
}
function connectNote() { return `<div class="empty-state">${icon('music')}<h2>Make this space yours.</h2><p>Connect Spotify to bring your music into Unspotted.</p><button class="button dark" data-action="connect">Connect with Spotify ${icon('arrow')}</button></div>`; }
function loading() { return '<div class="empty-state" role="status"><span class="spinner"></span><p>Bringing your music in…</p></div>'; }
function errorPanel() { return `<div class="error-panel" role="alert"><h3>We couldn’t load this just yet.</h3><p>${h(state.error)}</p><button class="button secondary" data-action="retry">Try again</button></div>`; }
function playlistGrid(items) {
  if (!items.length) return '<div class="empty-state"><h2>No playlists yet.</h2><p>Save a playlist in Spotify, then refresh your library here.</p></div>';
  return `<div class="playlist-${state.playlistView}">${items.filter(Boolean).map(item => `<article class="playlist-card"><button class="playlist-cover" data-playlist="${h(item.id)}" aria-label="View ${h(item.name)}">${art(item)}</button><div class="playlist-details"><button class="playlist-title" data-playlist="${h(item.id)}">${h(item.name)}</button><p>${h(item.owner?.display_name || 'Your playlist')}</p></div><button class="playlist-play icon-button" data-play-uri="${h(item.uri)}" aria-label="Play playlist ${h(item.name)}">${icon('play')}</button></article>`).join('')}</div>`;
}
function trackList(items) {
  if (!items.length) return '<div class="empty-state"><h2>No songs here yet.</h2><p>Try another search or add some favorites in Spotify.</p></div>';
  return `<div class="track-list">${items.map((item, index) => `<article class="track-row"><span class="track-number">${index + 1}</span>${art(item)}<div class="track-info"><strong>${h(item.name)}</strong><span>${h(item.artists?.map(artist => artist.name).join(', ') || '')}</span></div><span class="track-album">${h(item.album?.name || '')}</span><span class="track-duration">${duration(item.duration_ms)}</span><button class="icon-button" data-play-uri="${h(item.uri)}" ${state.collection?.uri ? `data-context-uri="${h(state.collection.uri)}"` : ''} aria-label="Play ${h(item.name)}">${icon('play')}</button></article>`).join('')}</div>`;
}
function canCommand(action) {
  const p = state.playback;
  if (!state.connected || commandBusy || !navigator.onLine || p?.device?.is_restricted) return false;
  if (action !== 'play' && !p?.item) return false;
  if (action === 'shuffle' && typeof p?.shuffle_state !== 'boolean') return false;
  const restrictions = p?.actions?.disallows || p?.actions || {};
  return !restrictions[{ play: 'resuming', pause: 'pausing', next: 'skipping_next', previous: 'skipping_prev', shuffle: 'toggling_shuffle' }[action]];
}
function renderPlayer() {
  const home = document.querySelector('#home-playback');
  if (home) {
    const signature = JSON.stringify([state.playback?.item?.uri, state.playback?.is_playing, state.playback?.device, state.playback?.actions, commandBusy, navigator.onLine]);
    if (home.dataset.signature !== signature) { home.innerHTML = homePlayback(); home.dataset.signature = signature; }
  }
  const target = document.querySelector('#player'); if (!target) return;
  const p = state.playback, track = p?.item;
  const shuffleOn = p?.shuffle_state === true;
  const playAction = p?.is_playing ? 'pause' : 'play';
  const disabled = action => canCommand(action) ? '' : 'disabled';
  target.innerHTML = `<section class="player-bar" aria-label="Music player"><div class="now-playing">${art(track, 'player-art')}<div><strong>${h(track?.name || 'Choose something to play')}</strong><span>${h(track ? track.artists?.map(a => a.name).join(', ') || '' : 'Your music is ready when you are.')}</span></div></div><div class="playback-controls"><div class="transport" role="group" aria-label="Playback controls"><button class="icon-button shuffle-button" data-command="shuffle" aria-label="Shuffle" aria-pressed="${shuffleOn}" title="${shuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}" ${disabled('shuffle')}>${icon('shuffle')}<span class="shuffle-state">${shuffleOn ? 'On' : 'Off'}</span></button><button class="icon-button skip" data-command="previous" aria-label="Previous track" title="Previous track" ${disabled('previous')}>${icon('previous')}</button><button class="play-button" data-command="${playAction}" aria-label="${p?.is_playing ? 'Pause' : 'Play'}" title="${p?.is_playing ? 'Pause' : 'Play'}" ${disabled(playAction)}>${icon(playAction)}</button><button class="icon-button skip" data-command="next" aria-label="Next track" title="Next track" ${disabled('next')}>${icon('next')}</button><span class="transport-spacer" aria-hidden="true"></span></div><div class="progress"><span>${duration(p?.progress_ms)}</span><progress max="${track?.duration_ms || 1}" value="${p?.progress_ms || 0}" aria-label="Track progress"></progress><span>${duration(track?.duration_ms)}</span></div></div><button class="device-button" data-action="devices" aria-label="Choose playback device${p?.device?.name ? `: ${h(p.device.name)}` : ''}" ${!state.connected ? 'disabled' : ''}>${icon('device')}<span>${h(p?.device?.name || 'Choose a device')}</span></button></section>`;
}
async function loadPlaylists(more = false) {
  const generation = viewGeneration;
  const data = await api(more ? state.playlistNext : '/me/playlists?limit=50');
  if (generation !== viewGeneration) return;
  state.playlists = [...(more ? state.playlists : []), ...(data.items || []).filter(Boolean)]; state.playlistNext = data.next;
}
async function loadView(task) {
  const generation = ++viewGeneration; state.loading = true; state.error = ''; render();
  try { await task(); } catch (error) { if (generation === viewGeneration) state.error = error.message; }
  finally { if (generation === viewGeneration) { state.loading = false; render(); } }
}
async function browse() { state.page = 'library'; state.collection = null; await loadView(() => loadPlaylists()); }
async function liked() {
  if (!state.connected) return connect();
  state.page = 'library'; state.collection = { name: 'Liked songs' }; state.tracks = []; state.trackNext = null;
  const collection = state.collection;
  await loadView(async () => { const data = await api('/me/tracks?limit=50'); if (state.collection !== collection) return; state.tracks = normalizeTracks(data.items); state.trackNext = data.next; });
}
async function openPlaylist(id) {
  const item = state.playlists.find(p => p.id === id); if (!item) return;
  state.page = 'library'; state.collection = item; state.tracks = []; state.trackNext = null;
  await loadView(async () => { const data = await api(`/playlists/${encodeURIComponent(id)}/items?limit=50`); if (state.collection !== item) return; state.tracks = normalizeTracks(data.items); state.trackNext = data.next; });
}
async function search(more = false) {
  searchAbort?.abort(); searchAbort = new AbortController();
  const signal = searchAbort.signal;
  await loadView(async () => {
    const data = await api(more ? state.resultNext : `/search?type=track&limit=10&q=${encodeURIComponent(state.query)}`, { signal });
    if (signal.aborted) return;
    state.results = [...(more ? state.results : []), ...(data.tracks?.items || []).filter(Boolean)]; state.resultNext = data.tracks?.next;
  });
}
function connect() { login().catch(notifyError); }
function settings() {
  const dialog = document.querySelector('#settings');
  dialog.innerHTML = `<div class="dialog-heading"><h2>App settings</h2><button class="icon-button" data-close="settings" aria-label="Close settings">${icon('close')}</button></div>${state.connected ? `<section class="account-summary"><span>Connected as</span><strong>${h(state.profile?.display_name || 'your Spotify account')}</strong><button class="button secondary" data-action="switch-account">Switch Spotify account</button><button class="button secondary" data-action="disconnect">Disconnect Spotify on this device</button></section>` : `<p>Connect your Spotify Premium account to listen.</p><button class="button dark full-width" data-action="connect">Connect with Spotify ${icon('arrow')}</button>`}<div class="install-help"><h3>On your iPhone</h3><p>In Safari, tap Share → Add to Home Screen. Enable <strong>Open as Web App</strong> if offered, then tap Add.</p><p>For listening with your phone locked, choose playback in the Spotify app. Browser background playback depends on iOS. Offline music downloads aren’t supported.</p></div><p class="field-help">Your sign-in stays on this device until you disconnect. Unspotted has no server or analytics.</p>`;
  dialog.showModal();
}
function switchAccount() {
  const dialog = document.querySelector('#settings');
  dialog.innerHTML = `<div class="dialog-heading"><h2>Switch Spotify account</h2><button class="icon-button" data-close="settings" aria-label="Close settings">${icon('close')}</button></div><p>Connected as <strong>${h(state.profile?.display_name || 'your Spotify account')}</strong>.</p><ol class="setup-steps"><li>Open <a href="https://accounts.spotify.com/" target="_blank" rel="noopener noreferrer">your Spotify account ↗</a> and sign out of Spotify in this browser, then sign in with the account you want to use.</li><li>Return here and continue. You will approve Unspotted for that account.</li></ol><p class="field-help">Spotify chooses the account using its own sign-in session. The app’s five-user allowlist grants access; it is not an account picker. The new account must be on the app’s allowlist and have Premium for playback.</p><button class="button dark full-width" data-action="continue-switch">Continue to Spotify ${icon('arrow')}</button><p class="field-help">Continuing clears Unspotted’s saved login on this device. Your layout preference stays saved.</p>`;
}
async function devices() {
  const dialog = document.querySelector('#devices');
  dialog.innerHTML = `<div class="dialog-heading"><h2>Where shall we listen?</h2><button class="icon-button" data-close="devices" aria-label="Close devices">${icon('close')}</button></div><p>Choose this browser, or keep Spotify playing on another device.</p><button class="button dark full-width" data-action="browser-player">Enable this browser</button><div id="device-list">${loading()}</div><p class="field-help">For reliable listening with your iPhone locked, open Spotify and start a song there, then choose that device here.</p><button class="text-button" data-action="refresh-devices">Refresh devices</button>`;
  if (!dialog.open) dialog.showModal();
  await refreshDevices();
}
async function refreshDevices() {
  const target = document.querySelector('#device-list');
  try {
    const data = await api('/me/player/devices');
    target.innerHTML = data.devices?.length ? data.devices.map(device => `<button class="device-option" data-device="${h(device.id || '')}" ${device.is_restricted || !device.id ? 'disabled' : ''}>${icon('device')}<span><strong>${h(device.name)}</strong><small>${device.is_restricted ? 'Controlled in Spotify' : device.is_active ? 'Currently playing here' : h(device.type)}</small></span>${device.is_active ? '<span class="small-dot"></span>' : icon('arrow')}</button>`).join('') : '<p class="field-help">No devices yet. Enable this browser, or open Spotify on your phone and start playing, then refresh.</p>';
  } catch (error) { target.textContent = error.message; }
}
async function pollPlayback() {
  if (polling || commandBusy || !state.connected || document.hidden || !navigator.onLine) return;
  polling = true;
  const revision = playbackRevision;
  try {
    const playback = await api('/me/player');
    if (revision !== playbackRevision) return;
    state.playback = playback;
    if (state.playback?.device?.id) player.selectedId = state.playback.device.id;
    playbackError = ''; renderPlayer();
  } catch (error) { if (error.message !== playbackError) { playbackError = error.message; notifyError(error); } }
  finally { polling = false; }
}
async function playbackCommand(task) {
  if (commandBusy) return;
  commandBusy = true; playbackRevision++; renderPlayer();
  try { await task(); setTimeout(pollPlayback, 500); }
  finally { commandBusy = false; renderPlayer(); }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  try {
    if (button.dataset.close) { document.getElementById(button.dataset.close).close(); return; }
    if (button.dataset.nav) {
      searchAbort?.abort(); viewGeneration++; state.loading = false; state.error = ''; state.page = button.dataset.nav; state.collection = null; render();
      if (state.connected && state.page === 'library') await browse();
      return;
    }
    if (button.dataset.view) {
      state.playlistView = button.dataset.view; savePlaylistView(state.playlistView); render();
      document.querySelector(`[data-view="${state.playlistView}"]`)?.focus({ preventScroll: true }); return;
    }
    if (button.dataset.playlist) return await openPlaylist(button.dataset.playlist);
    if (button.dataset.playUri) { player.activate(); return await playbackCommand(() => player.play({ uri: button.dataset.playUri, contextUri: button.dataset.contextUri })); }
    if (button.dataset.command) {
      const action = button.dataset.command;
      if (!canCommand(action)) return;
      player.activate();
      const shuffleOn = !state.playback?.shuffle_state;
      return await playbackCommand(async () => {
        if (action === 'shuffle') await player.shuffle(shuffleOn);
        else await player.command(action);
        // Reflect successful requests immediately; polling/SDK events reconcile
        // the actual device state. Failed requests leave the controls unchanged.
        if (state.playback && action === 'shuffle') state.playback.shuffle_state = shuffleOn;
        if (state.playback && ['play', 'pause'].includes(action)) state.playback.is_playing = action === 'play';
      });
    }
    if (button.dataset.device) { await player.select(button.dataset.device); document.querySelector('#devices').close(); toast('Device selected. Tap Play to start listening.'); return; }
    switch (button.dataset.action) {
      case 'settings': settings(); break;
      case 'switch-account': switchAccount(); break;
      case 'continue-switch': disconnect(); player.destroy(); location.replace(`${redirectUri()}?connect=1`); break;
      case 'refresh-home': await loadView(() => loadPlaylists()); await pollPlayback(); break;
      case 'connect': connect(); break;
      case 'browse': case 'playlists': case 'library-back': if (state.connected) await browse(); else connect(); break;
      case 'liked': await liked(); break;
      case 'devices': await devices(); break;
      case 'refresh-devices': await refreshDevices(); break;
      case 'browser-player':
        if (!player.sdk) {
          button.disabled = true; button.textContent = 'Connecting browser…';
          try { await player.prepare(); toast('Browser enabled. Once it appears below, select it and tap Play.'); }
          finally { button.disabled = false; button.textContent = 'Refresh browser device'; }
        } else player.activate();
        await refreshDevices(); break;
      case 'more-playlists': await loadView(() => loadPlaylists(true)); break;
      case 'more-tracks': {
        const collection = state.collection;
        await loadView(async () => { const data = await api(state.trackNext); if (state.collection !== collection) return; state.tracks.push(...normalizeTracks(data.items)); state.trackNext = data.next; }); break;
      }
      case 'more-search': await search(true); break;
      case 'retry': if (state.page === 'search') await search(); else if (state.collection?.id) await openPlaylist(state.collection.id); else if (state.collection) await liked(); else await loadView(() => loadPlaylists()); break;
      case 'disconnect': disconnect(); player.destroy(); location.replace(redirectUri()); break;
    }
  } catch (error) { notifyError(error); }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (event.target.id === 'search-form' || event.target.id === 'home-search-form') {
      state.query = new FormData(event.target).get('query').trim();
      if (!state.connected) return connect();
      if (state.query) { state.page = 'search'; state.collection = null; await search(); }
    }
  } catch (error) { notifyError(error); }
});
for (const event of ['online', 'offline']) window.addEventListener(event, () => { document.querySelector('#offline').hidden = navigator.onLine; renderPlayer(); if (navigator.onLine) pollPlayback(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollPlayback(); });
setInterval(pollPlayback, 12000);
async function init() {
  render();
  try { await finishLogin(); } catch (error) { notifyError(error); }
  state.connected = isConnected(); render();
  if (new URLSearchParams(location.search).get('connect') === '1') {
    history.replaceState({}, '', redirectUri());
    try { await login(); } catch (error) { notifyError(error); }
    return;
  }
  if (state.connected) {
    await loadView(async () => {
      const results = await Promise.allSettled([api('/me'), loadPlaylists()]);
      if (results[0].status === 'fulfilled') state.profile = results[0].value;
      if (results[1].status === 'rejected') throw results[1].reason;
    });
    await pollPlayback();
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => toast('Offline setup is unavailable in this browser. Online listening still works.'));
  }
}
init();
