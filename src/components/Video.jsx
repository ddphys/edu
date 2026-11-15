import { rutubeEmbedUrl } from '../lib.js'

// Видео с Rutube встроено прямо в страницу урока, без перехода по ссылке.
export default function Video({ url, title, vertical = false }) {
  const src = rutubeEmbedUrl(url)
  if (!src) {
    return (
      <div className="video video--empty">
        <div>
          <strong>Не удалось распознать ссылку на Rutube</strong>
        </div>
      </div>
    )
  }
  return (
    <div className={`video ${vertical ? 'video--vertical' : ''}`}>
      <iframe
        src={src}
        title={title}
        allow="clipboard-write; autoplay; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
