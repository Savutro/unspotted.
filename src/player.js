import { accessToken, api } from './spotify.js';

export class Player {
  constructor(onState, onError) { this.onState = onState; this.onError = onError; this.selectedId = ''; }
  async prepare() {
    if (this.sdk) return;
    if (this.preparing) return this.preparing;
    this.preparing = this.initialize().catch(error => { this.sdk?.disconnect(); this.sdk = null; throw error; }).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  async initialize() {
    if (!window.Spotify) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser playback could not load. You can still choose a Spotify device.')), 15000);
      window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timeout); resolve(); };
      document.querySelector('#spotify-sdk')?.remove();
      const script = document.createElement('script');
      script.id = 'spotify-sdk'; script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Could not load Spotify playback. Check your connection.')); };
      document.head.append(script);
    });
    this.sdk = new window.Spotify.Player({ name: 'Unspotted', getOAuthToken: cb => { accessToken().then(cb).catch(this.onError); }, volume: 0.7 });
    this.sdk.addListener('ready', ({ device_id }) => { this.browserId = device_id; });
    this.sdk.addListener('not_ready', () => { if (this.selectedId === this.browserId) this.selectedId = ''; this.browserId = ''; });
    this.sdk.addListener('autoplay_failed', () => this.onError(new Error('Tap Play once more to allow audio on this iPhone.')));
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(event => this.sdk.addListener(event, ({ message }) => this.onError(new Error(message))));
    this.sdk.addListener('player_state_changed', state => {
      if (state && this.selectedId === this.browserId) this.onState({ item: state.track_window.current_track, is_playing: !state.paused, shuffle_state: state.shuffle, actions: state.disallows, progress_ms: state.position, device: { id: this.browserId, name: 'This device' } });
    });
    if (!await this.sdk.connect()) throw new Error('Browser playback is unavailable. Choose a Spotify device instead.');
  }
  // Called synchronously from a click, before any network request, for iOS.
  activate() { return this.sdk?.activateElement().catch(this.onError); }
  async select(id) {
    this.activate();
    await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: false } });
    this.selectedId = id;
  }
  async play(item) {
    this.activate();
    if (!this.selectedId) {
      const { devices } = await api('/me/player/devices');
      this.selectedId = devices.find(device => device.is_active && !device.is_restricted)?.id || '';
    }
    if (!this.selectedId) throw new Error('Choose where to listen using the Devices button first.');
    const body = item ? (item.contextUri
      ? { context_uri: item.contextUri, offset: { uri: item.uri } }
      : item.uri.startsWith('spotify:track:') ? { uris: [item.uri] } : { context_uri: item.uri }) : undefined;
    await api(`/me/player/play?device_id=${encodeURIComponent(this.selectedId)}`, { method: 'PUT', body });
  }
  async command(action) {
    this.activate();
    if (action === 'play') return this.play();
    if (!['pause', 'next', 'previous'].includes(action)) throw new Error('Unknown playback command.');
    await api(`/me/player/${action}${this.selectedId ? `?device_id=${encodeURIComponent(this.selectedId)}` : ''}`, { method: action === 'pause' ? 'PUT' : 'POST' });
  }
  async shuffle(enabled) {
    const params = new URLSearchParams({ state: String(enabled) });
    if (this.selectedId) params.set('device_id', this.selectedId);
    await api(`/me/player/shuffle?${params}`, { method: 'PUT' });
  }
  destroy() { this.sdk?.disconnect(); this.sdk = null; this.browserId = ''; this.selectedId = ''; }
}
