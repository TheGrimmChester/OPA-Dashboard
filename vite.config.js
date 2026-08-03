import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.agents/**'],
  },
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
        // The agent's WebSocket listener is a separate server on :8082
        // (wsAddr in main.go), not the :8080 HTTP API — mirror nginx.conf.
        target: process.env.VITE_WS_PROXY_TARGET || 'http://agent:8082',
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('vis-network') || id.includes('vis-data') || id.includes('vis-util')) {
            return 'vis-network'
          }
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'recharts'
          }
          if (
            id.includes('react-syntax-highlighter') ||
            id.includes('refractor') ||
            id.includes('prismjs') ||
            id.includes('highlight.js')
          ) {
            return 'syntax-highlighter'
          }
          if (id.includes('sql-formatter')) {
            return 'sql-formatter'
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) {
            return 'react-vendor'
          }
          return undefined
        }
      }
    }
  }
})

