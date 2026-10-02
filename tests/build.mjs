import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLIENT_ID } from './fixtures.js';

await build({
  build: { outDir: 'dist-e2e' },
  plugins: [{
    name: 'mock-spotify-app',
    enforce: 'pre',
    load(id) {
      if (id === resolve('src/config.js')) {
        return `export const SPOTIFY_CLIENT_ID = '${CLIENT_ID}';`;
      }
    },
  }],
});
execFileSync(process.execPath, ['scripts/service-worker.mjs', 'dist-e2e'], { stdio: 'inherit' });
