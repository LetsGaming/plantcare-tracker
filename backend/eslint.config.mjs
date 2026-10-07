import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier/flat';

const HTTP_AND_DB = ['express', 'better-sqlite3', 'kysely', 'kysely/*'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'scripts/**',
      'ecosystem.config.js',
      'data/**',
      'uploads/**',
      'logs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'import-x/no-cycle': 'error',
      'no-restricted-imports': ['error', { patterns: HTTP_AND_DB }],
    },
  },
  {
    files: [
      'server.ts',
      'src/app.ts',
      'src/modules/*/presentation/**',
      'src/core/middleware/**',
      'src/core/sse/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/modules/*/infrastructure/**', 'src/core/database/**', 'src/tools/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['express'] }] },
  },
  {
    files: ['src/modules/*/domain/**', 'src/modules/*/application/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...HTTP_AND_DB,
            '**/infrastructure/**',
            '**/presentation/**',
            '**/core/middleware/**',
            '**/core/database/**',
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**', 'vitest.config.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-restricted-imports': 'off' },
  },
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
