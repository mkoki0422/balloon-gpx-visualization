import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}); 