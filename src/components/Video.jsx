import { rutubeEmbedUrl } from '../lib.js'

// Видео с Rutube встроено прямо в страницу урока, без перехода по ссылке.
export default function Video({ url, title }) {
  const src = rutubeEmbedUrl(url)
  if (!src) {
    return (
      <div className="video video--empty">
        <div>
          <strong>Запись занятия пока не добавлена</strong>
          <p>
            Вставьте ссылку на Rutube в поле <code>videoUrl</code> этого урока в файле{' '}
            <code>src/data/course.js</code>
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="video">
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
