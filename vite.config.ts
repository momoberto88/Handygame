import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Audio files keep their names when a sound is re-recorded, so phones could hold on to the old
 * recording. Every clip gets a short hash of its content in the URL (the page asks for
 * "voice/hase/win-0.mp3?v=1a2b3c4d", the offline cache stores exactly that), so a new recording
 * is a new address and always arrives.
 */
const AUDIO_DIR = 'public/assets/audio';

function audioHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (e.name.endsWith('.mp3')) out[relative(AUDIO_DIR, path).replace(/\\/g, '/').slice(0, -4)] = createHash('md5').update(readFileSync(path)).digest('hex').slice(0, 8);
    }
  };
  walk(AUDIO_DIR);
  return out;
}

function clipVersions(): Plugin {
  const id = 'virtual:clip-versions';
  return {
    name: 'clip-versions',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load: (source) => (source === '\0' + id ? `export default ${JSON.stringify(audioHashes())};` : null),
  };
}

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/Handygame/").
const base = process.env.BASE_PATH ?? '/';

/** Shown in the menu, so everybody can see which version their phone runs. */
function buildLabel(): string {
  let sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      sha = 'lokal';
    }
  }
  const when = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
  return `${when.replace(',', '')} · ${sha}`;
}

export default defineConfig({
  base,
  define: {
    __BUILD__: JSON.stringify(buildLabel()),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    clipVersions(),
    VitePWA({
      // new versions are applied in the menu, never in the middle of a race (see src/update.ts)
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Runaway Rivals',
        short_name: 'Runaway Rivals',
        description: 'Chaotisches Jump-’n’-Run-Rennen für bis zu 4 Spieler',
        lang: 'de',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#1d1a2f',
        theme_color: '#1d1a2f',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,jpg,json,mp3,ogg,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // audio is cached under its versioned address (see clipVersions)
        manifestTransforms: [
          async (entries) => {
            const hashes = audioHashes();
            const manifest = entries.map((e) => {
              const m = /^assets\/audio\/(.+)\.mp3$/.exec(e.url);
              return m && hashes[m[1]] ? { ...e, url: `${e.url}?v=${hashes[m[1]]}`, revision: null } : e;
            });
            return { manifest, warnings: [] };
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
