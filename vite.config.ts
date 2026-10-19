import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the backend is proxied so the app always talks to its own origin,
// exactly as it does in production behind nginx.
const backend = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/downloads': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, changeOrigin: true, ws: true },
    },
  },
})
