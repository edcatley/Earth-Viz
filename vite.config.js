import { defineConfig } from 'vite';
import { resolve } from 'path';

// Simple configuration that builds all our TypeScript files
export default defineConfig({
  root: 'public',
  publicDir: 'data',
  server: {
    port: 8080,
    open: true
  },
  resolve: {
    alias: {
      '/libs/earth/1.0.0/micro.umd.js': resolve(__dirname, 'src/micro.ts'),
      '/libs/earth/1.0.0/globes.umd.js': resolve(__dirname, 'src/globes.ts'),
      '/libs/earth/1.0.0/products.umd.js': resolve(__dirname, 'src/products.ts'),
      '/libs/earth/1.0.0/earth.umd.js': resolve(__dirname, 'src/earth-modern.ts')
    }
  }
}); 