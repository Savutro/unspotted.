export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const duration = ms => `${Math.floor((ms || 0) / 60000)}:${String(Math.floor((ms || 0) / 1000) % 60).padStart(2, '0')}`;
export function spotifyLink(item) {
  const uri = item?.uri?.match(/^spotify:(track|album|playlist|artist|episode):([a-zA-Z0-9]+)$/);
  return uri ? `https://open.spotify.com/${uri[1]}/${uri[2]}` : 'https://open.spotify.com/';
}
export function imageUrl(item) {
  const url = item?.images?.[0]?.url || item?.album?.images?.[0]?.url;
  try { return new URL(url).protocol === 'https:' ? url : ''; } catch { return ''; }
}
export function normalizeTracks(items = []) {
  return items.map(entry => entry?.item ?? entry?.track ?? entry).filter(item => item?.uri?.startsWith('spotify:track:') && !item.is_local);
}
