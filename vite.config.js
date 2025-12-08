import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://agent:8080',
        changeOrigin: true,
        rewrite: (path) => path
      },
      '/ws': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://agent:8080',
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})

