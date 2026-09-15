import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forwards /api requests to the Express server during local dev.
      '/api': 'http://localhost:4000',
    },
  },
});
