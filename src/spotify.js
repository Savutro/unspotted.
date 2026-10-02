import { storagePrefix as PREFIX } from './storage.js';
import { SPOTIFY_CLIENT_ID } from './config.js';
const TOKEN_KEY = PREFIX + 'tokens';
const LOGIN_KEY = PREFIX + 'login';
const CLIENT_KEY = PREFIX + 'client';
const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state', 'user-library-read', 'playlist-read-private', 'playlist-read-collaborative'];
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
export const getClientId = () => SPOTIFY_CLIENT_ID;
export const redirectUri = () => new URL('.', location.href).href;
export const isConnected = () => Boolean(getClientId() && read(TOKEN_KEY)?.refresh_token);
export const logout = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(LOGIN_KEY); };
let refreshPromise;
let blockedUntil = 0;
let generation = 0;

// Tokens belong to the app that issued them. Preserve existing sessions only
// when they belong to the configured app; browser values cannot override it.
if (SPOTIFY_CLIENT_ID) {
  const previousClient = localStorage.getItem(CLIENT_KEY);
  if (previousClient && previousClient !== SPOTIFY_CLIENT_ID) logout();
  localStorage.setItem(CLIENT_KEY, SPOTIFY_CLIENT_ID);
}
export function disconnect() { generation++; logout(); }
function randomString(length) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), n => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[n % 62]).join('');
}
export async function challengeFor(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export async function login() {
  if (!/^[a-f0-9]{32}$/i.test(getClientId())) throw new Error('Spotify sign-in is not configured for this deployment yet. Please contact the app owner.');
  const verifier = randomString(96), state = randomString(32), redirect = redirectUri();
  const challenge = await challengeFor(verifier);
  localStorage.setItem(LOGIN_KEY, JSON.stringify({ verifier, state, redirect, created: Date.now() }));
  const params = new URLSearchParams({ client_id: getClientId(), response_type: 'code', redirect_uri: redirect, scope: SCOPES.join(' '), state, code_challenge_method: 'S256', code_challenge: challenge, show_dialog: 'true' });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}
async function tokenRequest(params) {
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: getClientId(), ...params }) });
  const data = await response.json();
  if (!response.ok) {
    if (data.error === 'invalid_grant') disconnect();
    throw new Error(data.error_description || 'Spotify sign-in expired. Please connect again.');
  }
  return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
}
export async function finishLogin() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return false;
  const pending = read(LOGIN_KEY);
  history.replaceState({}, '', redirectUri());
  localStorage.removeItem(LOGIN_KEY);
  if (!pending || params.get('state') !== pending.state || Date.now() - pending.created > 600000) throw new Error('This sign-in link expired or could not be verified. Please connect again.');
  if (params.has('error')) throw new Error('Spotify connection was cancelled. You can try again whenever you’re ready.');
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: pending.redirect, code_verifier: pending.verifier });
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  return true;
}
export async function accessToken(force = false) {
  const tokens = read(TOKEN_KEY);
  if (!tokens?.refresh_token) throw new Error('Connect your Spotify account to listen.');
  if (!force && tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  if (!refreshPromise) {
    const currentGeneration = generation;
    refreshPromise = tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }).then(fresh => {
      if (currentGeneration !== generation) throw new Error('Spotify was disconnected.');
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...tokens, ...fresh }));
      return fresh.access_token;
    }).finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
}
export async function api(path, { method = 'GET', body, signal } = {}, retry = true) {
  if (Date.now() < blockedUntil) throw new Error(`Spotify needs a moment. Try again in ${Math.ceil((blockedUntil - Date.now()) / 1000)} seconds.`);
  // Never send a bearer token to pagination URLs outside Spotify's API.
  const url = new URL(path.startsWith('/') ? `https://api.spotify.com/v1${path}` : path);
  if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('Invalid Spotify API URL.');
  const response = await fetch(url, { method, signal, headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 401 && retry) { await accessToken(true); return api(path, { method, body, signal }, false); }
  if (response.status === 204) return null;
  if (response.status === 429) {
    blockedUntil = Date.now() + (Number(response.headers.get('Retry-After')) || 30) * 1000;
    throw new Error('Spotify is receiving too many requests. Give it a moment, then try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) throw new Error('Spotify denied access. Check your Premium subscription and the app’s allowed users. Some playlists are restricted by Spotify.');
    if (response.status === 404 && path.includes('/me/player')) throw new Error('Choose a playback device, or open Spotify and start a song first.');
    throw new Error(data.error?.message || `Spotify request failed (${response.status}).`);
  }
  return data;
}
