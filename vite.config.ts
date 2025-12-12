import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Use relative paths for assets to support subpath deployment
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // Ensure Set-Cookie from backend is rewritten to a browser-acceptable domain
        // so session cookies issued by the backend (localhost:3001) are usable
        // when the app is served from the dev server (localhost:5173).
        // This rewrites cookie "Domain" to "localhost" (no port).
        cookieDomainRewrite: 'localhost'
      }
    }
  }
})
