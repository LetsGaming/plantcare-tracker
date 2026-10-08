/// <reference types="vitest" />

import vue from "@vitejs/plugin-vue";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      injectRegister: false,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        globIgnores: ["**/maskable-*.png"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/uploads/"),
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "uploads",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: ["es2022", "safari15"],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "vendor-ionic", test: /node_modules[\\/](@ionic|ionicons|@stencil)[\\/]/ },
            {
              name: "vendor-charts",
              test: /node_modules[\\/](chart\.js|vue-chartjs|@kurkle)[\\/]/,
            },
            { name: "vendor-luxon", test: /node_modules[\\/]luxon[\\/]/ },
            {
              name: "vendor-vue",
              test: /node_modules[\\/](vue|@vue|pinia|vue-router)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.{ts,vue}"],
      exclude: ["src/**/*.d.ts", "src/tests/**", "src/locales/**", "src/main.ts"],
      thresholds: { lines: 55, statements: 54, functions: 45, branches: 42 },
    },
  },
});
