import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import prettier from "eslint-config-prettier/flat";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

export default defineConfigWithVueTs(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "android/**",
      "ios/**",
      "src/locales/**",
      "serve.js",
      "scripts/**",
    ],
  },
  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,
  {
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver({ project: "./tsconfig.json" })],
    },
    rules: {
      "import-x/no-cycle": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "vue/component-api-style": ["error", ["options", "composition"]],
      "vue/no-v-html": "warn",
      "vue/require-explicit-emits": "error",
      "vue/no-deprecated-slot-attribute": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/views/**/*.vue", "src/components/**/*.vue"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/utils/apiUtils", "@/utils/tokenUtils"] }],
    },
  },
  prettier,
);
