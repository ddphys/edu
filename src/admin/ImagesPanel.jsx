import { useRef, useState } from 'react'
import { HEAVY_IMAGE_BYTES } from '../content/format.js'
import { imageMarkup } from '../content/text.js'
import { fmtBytes } from '../images.js'
import { Issues, useAdmin } from './fields.jsx'
import { imageUsage } from './model.js'

// Картинки курса: добавить с компьютера, заменить, удалить, посмотреть вес и где используется
export default function ImagesPanel({ ci }) {
  const { content, courseImages, addImage, removeImage, replaceImage, useOriginal } = useAdmin()
  const course = content.courses[ci]
  const usage = imageUsage(course)
  const file = useRef(null)
  const replaceInput = useRef(null)
  const [replacing, setReplacing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (name) => {
    try {
      await navigator.clipboard.writeText(imageMarkup(name))
      setCopied(name)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      setError('Не получилось скопировать — выделите текст вручную.')
    }
  }

  return (
    <div className="adm-form">
      <section className="adm-card">
        <h2>Картинки курса</h2>
        <p className="adm-hint">
          Чертежи к задачам, обложка, фото преподавателя. В текст картинка вставляется кнопкой «＋ Картинка» под полем или
          записью <code>![Подпись](имя-файла.png)</code>. Тяжёлые фотографии и снимки экрана редактор сам уменьшает
          до 1600 пикселей по большей стороне и сжимает; оригинал сохраняется и попадает в архив в папку <code>originals</code>.
        </p>
        <div className="adm-add-row">
          <button type="button" className="btn btn--primary adm-btn" disabled={busy} onClick={() => file.current.click()}>
            {busy ? 'Загружаем…' : '＋ Добавить с компьютера'}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...e.target.files]
              e.target.value = ''
              run(async () => {
                for (const f of files) await addImage(f)
              })
            }}
          />
          <input
            ref={replaceInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files[0]
              e.target.value = ''
              if (f && replacing) run(() => replaceImage(replacing, f))
            }}
          />
        </div>
        {error && <div className="adm-issue adm-issue--error">{error}</div>}

        {courseImages.length === 0 && <p className="adm-hint">Картинок пока нет.</p>}
        <div className="adm-images">
          {courseImages.map((img) => {
            const used = usage[img.name] ?? 0
            const heavy = img.size > HEAVY_IMAGE_BYTES
            return (
              <div className="adm-image" key={img.name} data-path={`courses/${ci}/images/${img.name}`}>
                <a className="adm-image__thumb" href={img.url} target="_blank" rel="noreferrer" title="Открыть в полном размере">
                  {img.url ? <img src={img.url} alt="" /> : <span>нет файла</span>}
                </a>
                <div className="adm-image__info">
                  <b>{img.name}</b>
                  <div className={`adm-hint ${heavy ? 'adm-heavy' : ''}`}>
                    {img.w}×{img.h} · {fmtBytes(img.size)}
                    {img.orig && ` · сжато с ${fmtBytes(img.orig.size)}, оригинал сохранён`}
                  </div>
                  <div className="adm-hint">{used ? `Используется: ${used}` : 'Нигде не используется'}</div>
                  <Issues path={`courses/${ci}/images/${img.name}`} />
                  <div className="adm-image__btns">
                    <button type="button" className="adm-link" onClick={() => copy(img.name)}>
                      {copied === img.name ? 'Скопировано' : 'Скопировать для вставки'}
                    </button>
                    <button
                      type="button"
                      className="adm-link"
                      onClick={() => {
                        setReplacing(img.name)
                        replaceInput.current.click()
                      }}
                    >
                      Заменить файл
                    </button>
                    {img.orig && (
                      <button type="button" className="adm-link" onClick={() => confirm(`Вернуть несжатый оригинал (${fmtBytes(img.orig.size)})? Страница с этой картинкой будет грузиться дольше.`) && run(() => useOriginal(img.name))}>
                        Без сжатия
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-link adm-link--danger"
                      onClick={() => confirm(used ? `Картинка «${img.name}» используется (${used}). Удалить? На её месте появится замечание.` : `Удалить картинку «${img.name}»?`) && run(() => removeImage(img.name))}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
