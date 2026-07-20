import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx() },
    react()
  ],
  // GitHub Pages deployment: set base to repo name
  base: process.env.VITE_BASE_URL || '/',
})
