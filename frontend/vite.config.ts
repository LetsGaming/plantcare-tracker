/// <reference types="vitest" />

import vue from "@vitejs/plugin-vue";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const LATIN_FONT_FILE = /(bricolage-grotesque|figtree)-latin-wght-normal-[\w-]+\.woff2$/;

function preloadLatinFonts(): Plugin {
  return {
    name: "preload-latin-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const fileNames = Object.keys(ctx.bundle ?? {}).filter((name) =>
          LATIN_FONT_FILE.test(name),
        );
        return fileNames.map((fileName) => ({
          tag: "link",
          injectTo: "head",
          attrs: {
            rel: "preload",
            as: "font",
            type: "font/woff2",
            crossorigin: "",
            href: `/${fileName}`,
          },
        }));
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    preloadLatinFonts(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      injectRegister: false,
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        globIgnores: ["**/maskable-*.png", "**/*-latin-ext-*.woff2", "**/*-vietnamese-*.woff2"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.origin === self.location.origin &&
              url.pathname.startsWith("/uploads/"),
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "uploads",
              cacheableResponse: { statuses: [200] },
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.origin === self.location.origin &&
              url.pathname.endsWith(".woff2"),
            handler: "CacheFirst",
            method: "GET",
            options: {
              cacheName: "fonts",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 10, purgeOnQuotaError: true },
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
    modulePreload: {
      resolveDependencies: (_file, deps, context) =>
        context.hostType === "html" ? deps.filter((dep) => !dep.includes("vendor-charts")) : deps,
    },
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
    setupFiles: ["src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.{ts,vue}"],
      exclude: ["src/**/*.d.ts", "src/tests/**", "src/locales/**", "src/main.ts"],
      thresholds: { lines: 55, statements: 54, functions: 45, branches: 42 },
    },
  },
});
