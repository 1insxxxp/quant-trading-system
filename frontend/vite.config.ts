import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/quant/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/quant/, ''),
      },
      '/api/version': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/version': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/quant/version': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/quant/, ''),
      },
      '/quant/ws': {
        target: 'ws://localhost:4001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
