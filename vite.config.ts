import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages では https://<ユーザー名>.github.io/study_timer/ で公開されるので、
// リポジトリ名を base に指定する。
const base = '/study_timer/';

export default defineConfig({
  base,
  build: {
    // Firebase（グループ機能）は、使う人だけが後から読み込む別のファイルになる。大きいのはそのため
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: 'index.html',
        // セキュリティルールの確かめ用（アプリからはリンクしない）
        cloudTest: 'cloud-test.html',
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // 模様の画像もオフラインで使えるように、最初にまとめて保存しておく
      includeAssets: ['apple-touch-icon.png', 'favicon.png', 'patterns/*.svg'],
      // 説明書の画像は大きいので、最初には保存しない。一度見たものだけ保存して、オフラインでも出す
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/help\/.*\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'help-images', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
        ],
      },
      manifest: {
        name: 'グミ勉',
        short_name: 'グミ勉',
        description: '勉強用タイマー',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
