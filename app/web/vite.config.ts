import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Use absolute asset paths for direct links to client routes. Set VITE_BASE_PATH for sub-path hosting.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@pos/shared-types': fileURLToPath(new URL('../packages/shared-types/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Vite proxy: forwards /api to the backend.
    // Docker stack (npm run infra): API is on port 8080 (nginx → NestJS inside container).
    // Native dev (npm run dev:api): API is on port 3000.
    // Override with VITE_API_URL env var or set in app/web/.env
    proxy: { '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:8080', changeOrigin: true } },
  },
});
