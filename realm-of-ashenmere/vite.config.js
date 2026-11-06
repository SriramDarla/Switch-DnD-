import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the Node server (port 3001) handles /api and /ws; Vite proxies to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
