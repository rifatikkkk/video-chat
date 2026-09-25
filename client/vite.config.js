import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: ['chrome100', 'firefox100', 'edge100'],
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
