import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/test',  // Root is where our test HTML lives
  server: {
    port: 8081,
    open: '/micro-test.html'  // Open this file on start
  },
  resolve: {
    alias: {
      // Make our TypeScript file available to the test
      '/libs/earth/1.0.0/micro.js': resolve(__dirname, 'src/micro.ts')
    }
  }
}); 