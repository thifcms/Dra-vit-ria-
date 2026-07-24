import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/Dra-vit-ria-/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate', // atualiza o app sozinho a cada novo deploy, sem cache velho travando
        includeAssets: ['favicon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Clínica Digital',
          short_name: 'Clínica Digital',
          description: 'Gestão Clínica Estética & Financeira',
          lang: 'pt-BR',
          start_url: '/Dra-vit-ria-/',
          scope: '/Dra-vit-ria-/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#FDFBF9',
          theme_color: '#EADFD4',
          icons: [
            { src: '/Dra-vit-ria-/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/Dra-vit-ria-/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/Dra-vit-ria-/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/Dra-vit-ria-/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/#agendar/, /^\/#checkin/],
          runtimeCaching: [
            {
              urlPattern: ({url}) =>
                url.hostname.includes('firestore.googleapis.com') ||
                url.hostname.includes('firebasestorage.googleapis.com') ||
                url.hostname.includes('identitytoolkit.googleapis.com'),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('react-signature-canvas')) return 'vendor-signature';
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
