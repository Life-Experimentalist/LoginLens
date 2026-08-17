import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Served from the root: public/CNAME points GitHub Pages at the custom domain
  // loginlens.vkrishna04.me. Setting a base of /LoginLens/ here would 404 every
  // asset on that domain.
  base: '/',
})
