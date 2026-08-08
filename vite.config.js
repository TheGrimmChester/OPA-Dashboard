import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The kit is a `file:` dependency, so it is symlinked and Vite resolves
  // through the symlink to its real path. Without deduping, `import 'react'`
  // from inside the kit finds the kit's own copy and every hook throws
  // "invalid hook call".
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.agents/**'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // Family login issuer (OAM). Production nginx exposes the same /oam-auth/.
      '/oam-auth': {
        target: process.env.VITE_OAM_PROXY_TARGET || 'http://127.0.0.1:8090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oam-auth/, ''),
      },
      // Hub-only, matching production nginx. Override with VITE_API_PROXY_TARGET
      // or VITE_HUB_PROXY_TARGET when the hub is not on localhost:8080.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || process.env.VITE_HUB_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path
      },
      '/ws': {
        // Hub WebSocket listener on :8082 (compose service hub) — mirror nginx.conf.
        target: process.env.VITE_WS_PROXY_TARGET || 'http://127.0.0.1:8082',
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

