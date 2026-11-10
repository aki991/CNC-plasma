import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      id: '/', name: 'CNC CUT PRO', short_name: 'CNC CUT PRO', lang: 'sr-Latn',
      description: 'Priprema CNC sečenja i upravljanje proizvodnjom',
      start_url: '/', scope: '/', display: 'standalone',
      theme_color: '#16232f', background_color: '#edf2f8',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{html,js,css,png,jpg,woff2,ttf,dxf,svg}'], clientsClaim: true, cleanupOutdatedCaches: true },
  })],
  optimizeDeps: { entries: ['index.html'] },
  server: { host: 'localhost', port: 4173, strictPort: true },
  preview: { host: 'localhost', port: 4173, strictPort: true },
});
