import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync } from 'node:fs'
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
