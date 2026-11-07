import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Never ship source maps: they would hand the readable source to anyone with the installed app.
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        // Keep the browser's Host so Django's CSRF origin check matches.
        changeOrigin: false,
        // Keep SSE streams open (notification feed).
        timeout: 0,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.url?.includes('/notifications/stream')) {
              proxyReq.setHeader('Accept', 'text/event-stream');
            }
          });
        },
      },
    },
  },
});
