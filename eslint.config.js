import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['dist/**', '.test-cache/**', '.vercel/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [react.configs.flat.recommended, reactHooks.configs.flat.recommended],
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
    files: ['*.config.js', 'server/**/*.js', 'api/**/*.js', 'test-support/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.test.js', 'test-support/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  prettier,
]);
