/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In development the API is proxied, so the browser talks to a single origin.
      proxy: {
        '/api': { target: env.VITE_DEV_API_PROXY ?? 'http://localhost:5000', changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
