import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Сайт отдаёт сам сервер (server/), поэтому base — корень.
// При разработке (npm run dev) запросы к /api и /uploads проксируются на сервер localhost:3000.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
