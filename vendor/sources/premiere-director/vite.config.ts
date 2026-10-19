import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'panel',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    target: 'chrome99',
    rollupOptions: {
      external: ['fs', 'path', 'child_process', 'https', 'os', 'crypto'],
      output: {
        format: 'iife',
        globals: (id: string) => `require(${JSON.stringify(id)})`,
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
