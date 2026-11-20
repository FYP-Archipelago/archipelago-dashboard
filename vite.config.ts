import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // `@/` imports resolve from src/, matching the paths entry in tsconfig.json.
  resolve: { alias: { '@': '/src' } },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: './src/test/setup.ts',
    // local/ holds untracked scratch copies, which may include tests.
    exclude: [...configDefaults.exclude, 'local/**'],
  },
});
