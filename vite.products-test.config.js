import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public/test',
  server: {
    port: 8082,
    open: '/products-test.html'
  },
  build: {
    outDir: '../../dist/test',
    rollupOptions: {
      input: {
        'products-test': resolve(__dirname, 'public/test/products-test.html')
      }
    }
  }
}); 