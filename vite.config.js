import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — чтобы сайт работал и на GitHub Pages (в подпапке /edu/), и локально
export default defineConfig({
  base: './',
  plugins: [react()],
})
