import { defineConfig } from 'vite';
import { resolve } from 'path';

// Configuration for micro.js testing
export default defineConfig({
  root: 'public',
  publicDir: 'data',
  server: {
    port: 8081,
    open: true
  },
  resolve: {
    alias: {
      '/libs/earth/1.0.0/micro.js': resolve(__dirname, 'src/utils/Utils.ts')
    }
  }
}); 