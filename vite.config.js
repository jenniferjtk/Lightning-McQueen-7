import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forwards /api requests to the deployed Lambda/API Gateway backend.
      '/api': {
        target: 'https://1fpzbaz91l.execute-api.us-east-2.amazonaws.com',
        changeOrigin: true,
      },
    },
  },
});
