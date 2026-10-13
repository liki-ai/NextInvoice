import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'spa-github-pages',
      closeBundle() {
        const outDir = resolve(__dirname, '../docs')
        copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
        // Invoice links sent to clients (/i/?t=…) get a real page, so they answer 200 rather than
        // the 404 status that the fallback above carries.
        // The same goes for invitation links (/signup/?invite=…), which also arrive by email.
        for (const page of ['i', 'signup']) {
          mkdirSync(resolve(outDir, page), { recursive: true })
          copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, page, 'index.html'))
        }
      },
    },
  ],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
})
