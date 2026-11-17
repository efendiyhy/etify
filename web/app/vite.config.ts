import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The development extension's id, pinned by its manifest `key`
// (web/extension/dev-key/). Read at build time so the page can message it.
function devExtensionId(): string {
  try {
    return readFileSync(new URL('../extension/dev-key/extension-id.txt', import.meta.url), 'utf8').trim();
  } catch {
    return '';
  }
}

// The party server's address stays out of the repo: .env.local here, a
// Cloudflare Pages variable in production. Without it Listen Together can't
// make a party, so a production build stops instead of shipping that.
function requirePartyServer(mode: string): void {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  if (!env.VITE_PARTY_SERVER_URL?.trim()) {
    throw new Error('VITE_PARTY_SERVER_URL is not set (app/.env.local, or the Cloudflare Pages environment).');
  }
}

// This build's id: the commit on CI, else the time. The page compares it with
// /version.json (written below) to notice a newer deploy.
const BUILD_ID = (process.env.GITHUB_SHA?.slice(0, 7) ?? '') || `dev-${Date.now().toString(36)}`;
const BUILD_TIME = new Date().toISOString();

export default defineConfig(({ command, mode }) => {
  if (command === 'build') requirePartyServer(mode);
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'etify-version',
        apply: 'build',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, time: BUILD_TIME }) });
        },
      },
    ],
    define: {
      DEV_EXTENSION_ID: JSON.stringify(devExtensionId()),
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // AutoMix's analysis worker (playback/automix): essentia.js's 2021-era
    // Emscripten glue breaks under dep pre-bundling, and the worker is a module.
    optimizeDeps: { exclude: ['essentia.js'] },
    worker: { format: 'es' },
    server: {
      // The extension's externally_connectable and DNR rules name this origin
      // exactly, so the port must not drift to 5174 when 5173 is busy.
      port: 5173,
      strictPort: true,
    },
  };
});
