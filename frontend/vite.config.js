import { defineConfig } from 'vite';
import { resolve } from 'path';

// Simple configuration that builds all our TypeScript files
export default defineConfig({
  root: 'public',
  publicDir: '../src/assets',
  server: {
    port: 8080,
    open: true,
    proxy: {
      // Proxy API requests to the backend server
      '/earth-viz': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '/styles': resolve(__dirname, 'src/styles')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}); 