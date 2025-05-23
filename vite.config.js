import { defineConfig } from 'vite';
import { resolve } from 'path';

// Build micro.ts
const microConfig = {
  root: 'public',
  publicDir: 'data',
  server: {
    port: 8080,
    open: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/micro.ts'),
      name: 'µ',
      fileName: (format) => `libs/earth/1.0.0/micro.${format}.js`,
      formats: ['umd']
    },
    rollupOptions: {
      external: ['d3'],
      output: {
        globals: {
          d3: 'd3'
        }
      }
    }
  }
};

// Build products.ts
const productsConfig = {
  ...microConfig,
  build: {
    ...microConfig.build,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/products.ts'),
      name: 'products',
      fileName: (format) => `libs/earth/1.0.0/products.${format}.js`,
      formats: ['umd']
    }
  }
};

export default defineConfig({
  root: 'public',
  publicDir: 'data',
  server: {
    port: 8080,
    open: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}); 