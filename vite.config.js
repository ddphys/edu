import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { assertContentOk } from './scripts/content-fs.js'

// Проверка контента перед сборкой: с ошибками в public/content сайт не собирается.
// При разработке (npm run dev) ошибки только печатаются, чтобы можно было чинить на ходу.
function contentCheck() {
  let isBuild = false
  return {
    name: 'edu-content-check',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    buildStart() {
      try {
        assertContentOk()
      } catch (e) {
        if (isBuild) this.error(e.message)
        else console.error(`\n${e.message}\n`)
      }
    },
  }
}

// base './' — чтобы сайт работал и на GitHub Pages (в подпапке /edu/), и локально
export default defineConfig({
  base: './',
  plugins: [contentCheck(), react()],
  // Метка сборки: с ней запрашиваются файлы контента, чтобы браузер не показал старые из кэша
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
})
