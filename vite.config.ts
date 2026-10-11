import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  // Never copy local show/network files or unlicensed sprite packs to Pages.
  publicDir: process.env.VITE_PAGES === 'true' ? false : 'public',
  plugins: [react(), {
    name: 'pages-library-placeholder',
    generateBundle() {
      if (process.env.VITE_PAGES === 'true') this.emitFile({
        type: 'asset', fileName: 'prop-library/jack-o-lantern/manifest.json',
        source: JSON.stringify({assets:[],source:'Import your own artwork locally.'}),
      })
    },
  }],
  server: { port: 4173 },
})
