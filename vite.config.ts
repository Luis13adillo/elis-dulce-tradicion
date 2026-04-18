import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 5178,
    hmr: {
      overlay: false, // Disable error overlay to prevent blocking
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "analyze" && visualizer({ open: true, filename: "dist/stats.html", gzipSize: true, brotliSize: true }),
    // PWA is intentionally disabled in dev mode. Running the service worker
    // against `npm run dev` was caching Supabase responses (including failed
    // ones with status 0) and causing the dashboard to hang on a loading
    // spinner indefinitely.
    mode === "production" && VitePWA({
      // 'prompt' (not 'autoUpdate'): new SW sits as "waiting" until the user
      // explicitly opts in via the Sonner toast wired up in src/lib/pwa.ts.
      // Combined with dropping skipWaiting/clientsClaim below, this prevents
      // mid-session tab reloads that were blanking the dashboard.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt', 'sitemap.xml'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Auth, profiles, orders, and realtime metadata MUST always hit the
        // network — this is a real-time bakery operation. The previous
        // Supabase NetworkFirst rule had no networkTimeoutSeconds and cached
        // status-0 errors for 24h, which locked users into a broken state.
        // We now exclude all Supabase traffic from the SW entirely.
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.elisdulcetradicion\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          }
        ],
        // Intentionally NOT setting skipWaiting/clientsClaim. A fresh SW
        // stays in "waiting" state and only takes control after the user
        // accepts the update prompt (see onNeedRefresh in src/lib/pwa.ts).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for large images
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Code splitting optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
          ],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'motion-vendor': ['framer-motion', 'motion'],
          // Feature chunks
          'dashboard': [
            './src/pages/OwnerDashboard',
            './src/pages/FrontDesk',
          ],
          'order': [
            './src/pages/Order',
            './src/pages/PaymentCheckout',
            './src/pages/OrderConfirmation',
            './src/pages/OrderTracking',
          ],
        },
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Source maps for production debugging (optional)
    sourcemap: mode === "development",
  },
  // Preload critical assets
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
    // The PWA virtual module is only injected when VitePWA is in the
    // plugin list (production). In dev, telling the pre-bundler to
    // exclude it avoids a "could not be resolved" crash on startup.
    exclude: ['virtual:pwa-register'],
  },
}));
