// Работа с картинками в браузере: узнать размер, уменьшить и сжать.
// Нужна и ученику (фото решения с телефона весит несколько мегабайт), и редактору.

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать картинку. Подходят JPEG, PNG, WebP, GIF и SVG.'))
    }
    img.src = url
  })
}

// Размер картинки в пикселях
export async function imageSize(blob) {
  const { img, release } = await loadImage(blob)
  const size = { w: img.naturalWidth, h: img.naturalHeight }
  release()
  if (!size.w || !size.h) throw new Error('У картинки не определяется размер. У SVG должны быть заданы width и height или viewBox.')
  return size
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))

// Уменьшает картинку до maxSide по большей стороне и сжимает.
// Фотографии и всё без прозрачности — в JPEG; картинки с прозрачностью — в PNG.
// Возвращает { blob, w, h, type }.
export async function compressImage(blob, { maxSide = 1600, quality = 0.85, forceJpeg = false } = {}) {
  const { img, release } = await loadImage(blob)
  try {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    let alpha = false
    if (!forceJpeg && blob.type !== 'image/jpeg') {
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data
      for (let i = 3; i < data.length; i += 4)
        if (data[i] < 250) {
          alpha = true
          break
        }
    }
    if (!alpha) {
      // У JPEG нет прозрачности: подкладываем белый фон
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
    }
    const type = alpha ? 'image/png' : 'image/jpeg'
    const out = await toBlob(canvas, type, quality)
    if (!out) throw new Error('Браузер не смог сжать картинку.')
    return { blob: out, w, h, type }
  } finally {
    release()
  }
}

export const fmtBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`
