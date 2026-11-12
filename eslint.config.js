import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['dist/**', '.vercel/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    plugins: { 'unused-imports': unusedImports },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'error',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [react.configs.flat.recommended, react.configs.flat['jsx-runtime'], reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/prop-types': 'off',
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
]);
