/// <reference types="vitest" />

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), legacy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
