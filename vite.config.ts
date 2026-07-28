import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate', // atualiza o app sozinho a cada novo deploy, sem cache velho travando
        injectRegister: false, // registro manual em main.tsx, pra poder mostrar aviso de nova versão
        // Ícones/logo saíram daqui de propósito — ver o runtimeCaching de imagens abaixo.
        // O precache "empacotado" (includeAssets) tem um bug conhecido no Safari/iOS com
        // arquivos de imagem maiores (o Safari faz pedidos parciais/"Range" que esse tipo de
        // cache não lida bem, resultando no ícone de imagem quebrada mesmo com o arquivo
        // correto). Uma estratégia de cache em tempo de execução (runtime) evita isso.
        includeAssets: [],
        manifest: {
          name: 'Clínica Digital',
          short_name: 'Clínica Digital',
          description: 'Gestão Clínica Estética & Financeira',
          lang: 'pt-BR',
          start_url: '/#app',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#FDFBF9',
          theme_color: '#EADFD4',
          icons: [
            { src: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-192-maskable-v2.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-512-maskable-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Faz o app instalado (PWA) atualizar sozinho assim que abrir, em vez de ficar
          // preso numa versão antiga em cache até fechar e abrir de novo várias vezes.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true, // apaga sozinho o cache de versões antigas do app
          navigateFallbackDenylist: [/^\/#agendar/, /^\/#checkin/],
          runtimeCaching: [
            {
              urlPattern: ({url}) =>
                url.hostname.includes('firestore.googleapis.com') ||
                url.hostname.includes('firebasestorage.googleapis.com') ||
                url.hostname.includes('identitytoolkit.googleapis.com'),
              handler: 'NetworkOnly',
            },
            {
              // Estratégia própria pra imagens (logo, ícones, favicon): busca da rede
              // normalmente e guarda em cache à parte do "app shell" — evita o bug do
              // Safari com precache de imagens grandes, e ainda funciona offline depois
              // do primeiro carregamento.
              urlPattern: ({request}) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
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
              // three.js só é usado pelo AnatomyViewer (carregado sob demanda) — sem
              // isolar num chunk próprio, ele ia pro pacote "vendor" geral e todo mundo
              // baixaria isso, mesmo quem nunca abre o visualizador 3D
              if (id.includes('/three/') || id.includes('\\three\\')) return 'vendor-three';
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
