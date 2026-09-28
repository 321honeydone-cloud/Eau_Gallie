import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ege-ui.js', 'placeholder/*.svg', 'pensacola/*.jpg', 'pensacola/*.pdf', 'icons/*.png', 'logo.png', 'favicon.svg'],
      manifest: {
        name: 'Eau Gallie Electric Field',
        short_name: 'EGE Field',
        description: 'Airfield daily report and part status',
        theme_color: '#222C6A',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,jpg,pdf}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
