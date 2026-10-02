export const storagePrefix = `unspotted:${new URL('.', location.href).pathname}:`;

// Keep existing installations signed in after the rename. Remove the old keys so
// disconnecting cannot restore an old account on a subsequent visit.
const legacyPrefix = `spotless:${new URL('.', location.href).pathname}:`;
for (const key of ['client', 'tokens', 'login']) {
  const legacy = localStorage.getItem(legacyPrefix + key);
  if (legacy !== null && localStorage.getItem(storagePrefix + key) === null) {
    localStorage.setItem(storagePrefix + key, legacy);
  }
  localStorage.removeItem(legacyPrefix + key);
}

export const getPlaylistView = () => localStorage.getItem(storagePrefix + 'playlist-view') === 'list' ? 'list' : 'grid';
export const savePlaylistView = view => localStorage.setItem(storagePrefix + 'playlist-view', view === 'list' ? 'list' : 'grid');
