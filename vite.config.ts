import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/Handygame/").
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Chaos-Sprint',
        short_name: 'Chaos-Sprint',
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
        globPatterns: ['**/*.{js,css,html,png,webp,jpg,json,mp3,ogg,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
