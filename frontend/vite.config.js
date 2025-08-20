import { defineConfig } from 'vite';
import { resolve } from 'path';

// Simple configuration that builds all our TypeScript files
export default defineConfig({
  root: 'public',
  publicDir: '../src/assets',
  server: {
    port: 8080,
    open: true
  },
  resolve: {
    alias: {
      '/libs/earth/1.0.0/micro.umd.js': resolve(__dirname, 'src/utils/Utils.ts'),
      '/libs/earth/1.0.0/globes.umd.js': resolve(__dirname, 'src/core/Globes.ts'),
      '/libs/earth/1.0.0/products.umd.js': resolve(__dirname, 'src/data/Products.ts'),
      '/libs/earth/1.0.0/earth.umd.js': resolve(__dirname, 'src/core/Earth.ts'),
      '@': resolve(__dirname, 'src'),
      '/styles': resolve(__dirname, 'src/styles')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}); 