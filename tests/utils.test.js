import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, normalizeTracks, spotifyLink, imageUrl, duration } from '../src/utils.js';

test('untrusted Spotify metadata is safe to interpolate in HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & \'hi\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;hi&#39;');
  assert.equal(spotifyLink({ uri: 'javascript:alert(1)' }), 'https://open.spotify.com/');
  assert.equal(imageUrl({ images: [{ url: 'javascript:alert(1)' }] }), '');
});
test('supports current and legacy playlist objects, omitting unavailable and local songs', () => {
  const first = { uri: 'spotify:track:one' }, second = { uri: 'spotify:track:two' };
  assert.deepEqual(normalizeTracks([{ item: first }, { track: second }, { track: null }, null, { uri: 'spotify:local:file' }]), [first, second]);
});
test('formats playback duration and Spotify links', () => {
  assert.equal(duration(185000), '3:05');
  assert.equal(duration(undefined), '0:00');
  assert.equal(spotifyLink({ uri: 'spotify:track:abc123' }), 'https://open.spotify.com/track/abc123');
});
