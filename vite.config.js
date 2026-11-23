import { defineConfig } from 'vite';
export default defineConfig({
  // relative asset paths so the build works under any sub-path (e.g. GitHub Pages /japanese-koi-garden-webgl/)
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
