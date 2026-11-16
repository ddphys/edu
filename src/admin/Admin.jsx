import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './admin.css'
import { memoryFiles } from '../api/files.js'
import { createLocalApi } from '../api/local.js'
import { memoryKv } from '../api/progress.js'
import { ImagesContext } from '../components/Math.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { HEAVY_IMAGE_BYTES, splitCourse } from '../content/format.js'
import { compressImage, imageSize } from '../images.js'
import { plural } from '../lib.js'
import { buildArchive, readArchive } from './archive.js'
import { CourseEditor, SiteEditor } from './CourseEditor.jsx'
import * as draft from './draft.js'
import { AdminContext, imageFiles } from './fields.jsx'
import ImagesPanel from './ImagesPanel.jsx'
import { draftIssues, indexIssues } from './issues.js'
import LessonEditor, { Badge } from './LessonEditor.jsx'
import { extOf, imageName, moveByKey, newCourse, newLesson, renameImage, shift } from './model.js'
import Preview from './Preview.jsx'

const MAX_SIDE = 1600
const stem = (name) => name.replace(/\.[^.]*$/, '')

// Файл с компьютера → картинка курса. Тяжёлые фотографии и снимки экрана уменьшаются и сжимаются,
// оригинал сохраняется рядом (в архиве он ляжет в папку originals).
async function prepareImage(file) {
  if (!extOf(file.type)) throw new Error('Этот файл не подходит: нужны PNG, JPEG, WebP, GIF или SVG.')
  let size = await imageSize(file)
  let blob = file
  let orig = null
  const raster = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  if (raster && (file.size > HEAVY_IMAGE_BYTES || Math.max(size.w, size.h) > MAX_SIDE)) {
    let small = await compressImage(file, { maxSide: MAX_SIDE, quality: 0.85 })
    // Всё ещё тяжёлая (пёстрая фотография) — сжимаем сильнее
    if (small.blob.size > HEAVY_IMAGE_BYTES && small.type === 'image/jpeg') small = await compressImage(file, { maxSide: MAX_SIDE, quality: 0.7 })
    if (small.blob.size < file.size) {
      blob = small.blob
      size = { w: small.w, h: small.h }
      orig = { blob: file, name: file.name || 'original' }
    }
  }
  return { blob, orig, ...size }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Адреса картинок для показа в редакторе
const withUrls = (records) => Object.fromEntries(Object.entries(records).map(([k, r]) => [k, { ...r, url: URL.createObjectURL(r.blob) }]))
const stripUrl = ({ url, ...record }) => record

export default function Admin() {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [content, setContent] = useState(null)
  const [images, setImages] = useState({})
  const [sel, setSel] = useState({ course: null, view: 'course', lesson: null })
  const [saved, setSaved] = useState('saved') // saved | saving | error
  const [notice, setNotice] = useState(null)
  const [showIssues, setShowIssues] = useState(false)
  const [narrowPreview, setNarrowPreview] = useState(false)
  const [open, setOpen] = useState(() => new Set()) // развёрнутые задачи
  const [dragLesson, setDragLesson] = useState(null)
  const [overLesson, setOverLesson] = useState(null)
  const [version, setVersion] = useState(0)
  const importInput = useRef(null)

  const contentRef = useRef(null)
  const imagesRef = useRef({})
  contentRef.current = content
  imagesRef.current = images

  // ----- загрузка и сохранение черновика -----
  const adopt = useCallback((next, records) => {
    for (const r of Object.values(imagesRef.current)) URL.revokeObjectURL(r.url)
    setImages(withUrls(records))
    setContent(next)
    setSel({ course: next.courses[0]?._key ?? null, view: next.courses.length ? 'course' : 'site', lesson: null })
    setOpen(new Set())
    setStatus('ready')
  }, [])

  const takePublished = useCallback(async () => {
    const published = await draft.loadPublished()
    await draft.replaceDraft(published.content, published.images)
    adopt(published.content, published.images)
    setNotice({
      kind: published.missing.length ? 'error' : 'ok',
      text: published.missing.length
        ? `Черновик создан из опубликованной версии, но не загрузились картинки: ${published.missing.join(', ')}`
        : 'Черновик создан из того, что сейчас опубликовано на сайте.',
    })
  }, [adopt])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const stored = await draft.loadDraft()
        if (!alive) return
        if (stored) adopt(stored.content, stored.images)
        else await takePublished()
      } catch (e) {
        if (!alive) return
        setLoadError(String(e?.message ?? e))
        setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [adopt, takePublished])

  // Черновик сохраняется сам через полсекунды после правки
  const firstSave = useRef(true)
  useEffect(() => {
    if (!content) return
    if (firstSave.current) return void (firstSave.current = false)
    setSaved('saving')
    const timer = setTimeout(() => {
      draft.saveContent(content).then(
        () => setSaved('saved'),
        () => setSaved('error'),
      )
      setVersion((v) => v + 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [content])

  // Незаписанная правка не должна потеряться при закрытии вкладки
  useEffect(() => {
    const warn = (e) => {
      if (saved === 'saving') e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saved])

  const update = useCallback((fn) => {
    setContent((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  // ----- что выбрано -----
  const ci = content ? content.courses.findIndex((c) => c._key === sel.course) : -1
  const course = ci === -1 ? null : content.courses[ci]
  const li = course ? course.lessons.findIndex((l) => l._key === sel.lesson) : -1
  const lesson = li === -1 ? null : course.lessons[li]
  const view = !course ? 'site' : sel.view === 'lesson' && !lesson ? 'course' : sel.view


  // ----- картинки выбранного курса -----
  const courseImages = useMemo(() => {
    if (!course) return []
    return Object.entries(course.images ?? {})
      .map(([name, info]) => {
        const record = images[draft.imageKey(course._key, name)]
        return { name, ...info, url: record?.url ?? '', size: record?.blob.size ?? 0, orig: record?.orig ? { size: record.orig.blob.size } : null }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [course, images])

  const imageLookup = useMemo(() => {
    const map = new Map(courseImages.map((i) => [i.name, i]))
    return (name) => (map.get(name)?.url ? { src: map.get(name).url, w: map.get(name).w, h: map.get(name).h } : null)
  }, [courseImages])

  const putRecord = async (key, record) => {
    await draft.putImage(key, record)
    setImages((all) => {
      if (all[key]) URL.revokeObjectURL(all[key].url)
      return { ...all, [key]: { ...record, url: URL.createObjectURL(record.blob) } }
    })
  }
  const dropRecord = async (key) => {
    await draft.deleteImage(key)
    setImages((all) => {
      if (all[key]) URL.revokeObjectURL(all[key].url)
      const { [key]: gone, ...rest } = all
      return rest
    })
  }

  const imageActions = useMemo(() => {
    const current = () => contentRef.current.courses.find((c) => c._key === sel.course)
    const setInfo = (name, info) => update((c) => void (c.courses.find((x) => x._key === sel.course).images[name] = info))

    // Положить файл под именем name; если расширение другое — имя меняется во всех текстах курса
    const store = async (oldName, name, prepared) => {
      const courseKey = sel.course
      if (oldName && oldName !== name) {
        await dropRecord(draft.imageKey(courseKey, oldName))
        update((c) => renameImage(c.courses.find((x) => x._key === courseKey), oldName, name))
      }
      await putRecord(draft.imageKey(courseKey, name), { blob: prepared.blob, orig: prepared.orig })
      setInfo(name, { w: prepared.w, h: prepared.h })
      return name
    }

    return {
      async addImage(file) {
        const prepared = await prepareImage(file)
        return store(null, imageName(file.name, prepared.blob.type, Object.keys(current().images ?? {})), prepared)
      },
      async replaceImage(name, file) {
        const prepared = await prepareImage(file)
        const others = Object.keys(current().images ?? {}).filter((n) => n !== name)
        return store(name, imageName(stem(name), prepared.blob.type, others), prepared)
      },
      async useOriginal(name) {
        const record = imagesRef.current[draft.imageKey(sel.course, name)]
        if (!record?.orig) return
        const blob = record.orig.blob
        const others = Object.keys(current().images ?? {}).filter((n) => n !== name)
        return store(name, imageName(stem(name), blob.type, others), { blob, orig: null, ...(await imageSize(blob)) })
      },
      async removeImage(name) {
        await dropRecord(draft.imageKey(sel.course, name))
        update((c) => void delete c.courses.find((x) => x._key === sel.course).images[name])
      },
    }
  }, [sel.course, update])

  // Ctrl+V вне текстового поля: картинка из буфера просто добавляется в картинки курса.
  // (В поле с текстом вставку обрабатывает само поле — картинка сразу встаёт в текст.)
  useEffect(() => {
    const onPaste = async (e) => {
      if (e.defaultPrevented || !sel.course) return
      const files = imageFiles(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      try {
        const names = []
        for (const f of files) names.push(await imageActions.addImage(f))
        setNotice({ kind: 'ok', text: `Картинка добавлена в «Картинки» курса: ${names.join(', ')}. Чтобы она сразу встала в текст, вставляйте её, когда курсор стоит в нужном поле.` })
      } catch (err) {
        setNotice({ kind: 'error', text: err.message })
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [imageActions, sel.course])

  // Картинки удалённых курсов из хранилища убираются
  const courseKeys = content?.courses.map((c) => c._key).join(' ') ?? ''
  useEffect(() => {
    if (!content) return
    const alive = new Set(courseKeys.split(' '))
    for (const key of Object.keys(imagesRef.current)) if (!alive.has(key.split('/')[0])) dropRecord(key)
  }, [courseKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- замечания -----
  const issues = useMemo(() => (content ? draftIssues(content, images) : []), [content, images])
  const issuesByPath = useMemo(() => indexIssues(issues), [issues])
  const errorCount = issues.filter((i) => i.level === 'error').length
  const warnCount = issues.length - errorCount

  const toggleOpen = useCallback((key, force) => {
    setOpen((set) => {
      const next = new Set(set)
      if (force ?? !next.has(key)) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  // Перейти к месту, к которому относится замечание
  const goTo = (path) => {
    const c = contentRef.current
    const m = path.match(/^courses\/(\d+)(?:\/lessons\/(\d+)(?:\/tasks\/(\d+)(?:\/tasks\/(\d+))?)?)?/)
    if (!m) setSel((s) => ({ ...s, view: 'site' }))
    else {
      const target = c.courses[Number(m[1])]
      if (!target) return
      const targetLesson = m[2] !== undefined ? target.lessons[Number(m[2])] : null
      setSel({ course: target._key, view: targetLesson ? 'lesson' : path.includes('/images/') ? 'images' : 'course', lesson: targetLesson?._key ?? null })
      if (targetLesson && m[3] !== undefined) {
        const item = targetLesson.tasks[Number(m[3])]
        const task = m[4] !== undefined ? item?.tasks?.[Number(m[4])] : item
        if (task?._key) toggleOpen(task._key, true)
      }
    }
    setShowIssues(false)
    setNarrowPreview(false)
    // Ищем поле по адресу; если его нет — ближайший блок выше по адресу
    setTimeout(() => {
      let p = path
      let el = null
      while (p && !(el = document.querySelector(`[data-path="${p.replace(/"/g, '\\"')}"]`))) p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('adm-flash')
      setTimeout(() => el.classList.remove('adm-flash'), 1600)
      el.querySelector('input, textarea, select')?.focus({ preventScroll: true })
    }, 80)
  }

  // ----- предпросмотр: тот же интерфейс api, что у ученика, но поверх черновика -----
  const previewApi = useMemo(
    () =>
      createLocalApi({
        kv: memoryKv(),
        files: memoryFiles(),
        source: {
          loadPublic: async () => {
            const c = contentRef.current
            return { site: { ...c.site, courses: c.courses.map((x) => x.id) }, courses: c.courses.map((x) => splitCourse(x).course) }
          },
          loadPrivate: async (id) => splitCourse(contentRef.current.courses.find((x) => x.id === id)).answers,
          imageUrl: (id, name) => {
            const target = contentRef.current.courses.find((x) => x.id === id)
            return target ? (imagesRef.current[draft.imageKey(target._key, name)]?.url ?? '') : ''
          },
        },
      }),
    [],
  )

  // ----- выгрузка и загрузка архива -----
  const exportArchive = async () => {
    if (errorCount) {
      setShowIssues(true)
      return setNotice({ kind: 'error', text: `Архив не выгружен: сначала исправьте ${errorCount} ${plural(errorCount, 'ошибку', 'ошибки', 'ошибок')} — с ошибками сайт не соберётся.` })
    }
    try {
      const blob = await buildArchive(content, (c) =>
        Object.fromEntries(Object.keys(c.images ?? {}).map((name) => [name, images[draft.imageKey(c._key, name)]]).filter(([, r]) => r).map(([name, r]) => [name, stripUrl(r)])),
      )
      download(blob, `edu-content-${new Date().toISOString().slice(0, 10)}.zip`)
      setNotice({ kind: 'ok', text: 'Архив выгружен. Распакуйте его и загрузите папки public и originals в корень репозитория — как именно, написано в README.' })
    } catch (e) {
      setNotice({ kind: 'error', text: e.message })
    }
  }

  const importArchive = async (file) => {
    if (!file) return
    try {
      const next = draft.fromArchive(await readArchive(file))
      if (!confirm('Черновик будет заменён содержимым архива. Продолжить?')) return
      await draft.replaceDraft(next.content, next.images)
      adopt(next.content, next.images)
      setVersion((v) => v + 1)
      setNotice({ kind: 'ok', text: `Архив загружен: ${next.content.courses.length} ${plural(next.content.courses.length, 'курс', 'курса', 'курсов')}.` })
    } catch (e) {
      setNotice({ kind: 'error', text: `Архив не загружен. ${e.message}` })
    }
  }

  const resetDraft = async () => {
    if (!confirm('Сбросить черновик и взять то, что сейчас опубликовано на сайте? Все невыгруженные правки пропадут.')) return
    try {
      await takePublished()
      setVersion((v) => v + 1)
    } catch (e) {
      setNotice({ kind: 'error', text: `Не удалось загрузить опубликованную версию. ${e.message}` })
    }
  }

  if (status === 'loading') return <div className="page muted">Открываем редактор…</div>
  if (status === 'error')
    return (
      <div className="page">
        <p>Редактор не открылся.</p>
        <p className="muted">{loadError}</p>
      </div>
    )

  const addCourse = () => {
    const next = newCourse(contentRef.current)
    update((c) => void c.courses.push(next))
    setSel({ course: next._key, view: 'course', lesson: null })
  }
  const addLesson = () => {
    const next = newLesson(course)
    update((c) => void c.courses[ci].lessons.push(next))
    setSel({ course: course._key, view: 'lesson', lesson: next._key })
  }
  const removeLesson = (index) => {
    const target = course.lessons[index]
    if (!confirm(`Удалить урок «${target.title}» со всеми задачами?${target._orig ? ' Урок уже опубликован: прогресс учеников по его задачам станет недоступен.' : ''}`)) return
    update((c) => void c.courses[ci].lessons.splice(index, 1))
  }

  const lessonSlot = (beforeKey) => {
    const id = beforeKey ?? 'end'
    return (
      <div
        key={`slot-${id}`}
        className={`adm-slot ${dragLesson && overLesson === id ? 'is-over' : ''}`}
        onDragOver={(e) => {
          if (!dragLesson) return
          e.preventDefault()
          setOverLesson(id)
        }}
        onDragLeave={() => setOverLesson((v) => (v === id ? null : v))}
        onDrop={(e) => {
          e.preventDefault()
          if (dragLesson) update((c) => moveByKey(c.courses[ci].lessons, dragLesson, beforeKey))
          setDragLesson(null)
          setOverLesson(null)
        }}
      />
    )
  }

  const ctx = { content, update, issues, issuesByPath, courseImages, isOpen: (key) => open.has(key), toggleOpen, ...imageActions }

  return (
    <AdminContext.Provider value={ctx}>
      <ImagesContext.Provider value={imageLookup}>
        <div className="adm">
          <header className="adm-top">
            <a className="adm-top__back" href="#/">
              ← На сайт
            </a>
            <b>Редактор курса</b>
            <span className={`adm-saved adm-saved--${saved}`} role="status">
              {saved === 'saved' ? 'Черновик сохранён в этом браузере' : saved === 'saving' ? 'Сохраняем…' : 'Не удалось сохранить черновик — выгрузите архив, чтобы не потерять правки'}
            </span>
            <span className="adm-top__right">
              <ThemeToggle />
              <button type="button" className={`adm-count ${errorCount ? 'adm-count--error' : warnCount ? 'adm-count--warn' : 'adm-count--ok'}`} aria-expanded={showIssues} onClick={() => setShowIssues((v) => !v)}>
                {errorCount || warnCount ? `Замечания: ${errorCount ? `${errorCount} ${plural(errorCount, 'ошибка', 'ошибки', 'ошибок')}` : ''}${errorCount && warnCount ? ', ' : ''}${warnCount ? `${warnCount} ${plural(warnCount, 'предупреждение', 'предупреждения', 'предупреждений')}` : ''}` : 'Замечаний нет'}
              </button>
              <button type="button" className="btn btn--ghost adm-btn adm-narrow-only" onClick={() => setNarrowPreview((v) => !v)}>
                {narrowPreview ? 'К редактору' : 'Предпросмотр'}
              </button>
              <button type="button" className="btn btn--ghost adm-btn" onClick={() => importInput.current.click()}>
                Загрузить архив
              </button>
              <input ref={importInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => importArchive(e.target.files[0]).then(() => (e.target.value = ''))} />
              <button type="button" className="btn btn--primary adm-btn" onClick={exportArchive}>
                Выгрузить архив
              </button>
            </span>
          </header>

          {notice && (
            <div className={`adm-notice adm-notice--${notice.kind}`} role="status">
              {notice.text}
              <button type="button" className="adm-icon" aria-label="Закрыть сообщение" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}

          {showIssues && (
            <div className="adm-issues-list">
              {issues.length === 0 && <p className="adm-hint">Проверка корректности не нашла замечаний. Архив можно выгружать.</p>}
              {[...issues]
                .sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
                .map((issue, i) => (
                  <button type="button" key={i} className={`adm-issue adm-issue--${issue.level}`} onClick={() => goTo(issue.path)}>
                    <span className="adm-issue__where">{issue.where}</span>
                    {issue.message}
                  </button>
                ))}
            </div>
          )}

          <div className={`adm-body ${narrowPreview ? 'adm-body--preview' : ''}`}>
            <aside className="adm-side">
              {content.courses.length > 1 && (
                <select className="adm-input" aria-label="Курс" value={course?._key ?? ''} onChange={(e) => setSel({ course: e.target.value, view: 'course', lesson: null })}>
                  {content.courses.map((c) => (
                    <option key={c._key} value={c._key}>
                      {c.title || c.id}
                    </option>
                  ))}
                </select>
              )}
              {course && (
                <>
                  <nav className="adm-nav" aria-label="Разделы курса">
                    <button type="button" className={view === 'course' ? 'is-active' : ''} onClick={() => setSel({ ...sel, view: 'course', lesson: null })}>
                      <span>Настройки курса</span>
                      <Badge path={`courses/${ci}`} />
                    </button>
                    <button type="button" className={view === 'images' ? 'is-active' : ''} onClick={() => setSel({ ...sel, view: 'images', lesson: null })}>
                      <span>Картинки · {courseImages.length}</span>
                      <Badge path={`courses/${ci}/images`} />
                    </button>
                  </nav>
                  <div className="adm-side__title">Уроки</div>
                  <nav className="adm-nav adm-nav--lessons" aria-label="Уроки">
                    {course.lessons.map((l, i) => (
                      <div key={l._key}>
                        {lessonSlot(l._key)}
                        <div
                          className={`adm-lesson ${view === 'lesson' && sel.lesson === l._key ? 'is-active' : ''}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', l._key)
                            setDragLesson(l._key)
                          }}
                          onDragEnd={() => {
                            setDragLesson(null)
                            setOverLesson(null)
                          }}
                        >
                          <button type="button" className="adm-lesson__open" onClick={() => setSel({ course: course._key, view: 'lesson', lesson: l._key })}>
                            <span className="adm-task__num">{i + 1}</span>
                            <span className="adm-lesson__name">{l.title || 'Без названия'}</span>
                          </button>
                          <Badge path={`courses/${ci}/lessons/${i}`} />
                          <span className="adm-tools">
                            {i > 0 && (
                              <button type="button" className="adm-icon" title="Выше" aria-label={`Урок ${i + 1}: выше`} onClick={() => update((c) => shift(c.courses[ci].lessons, i, -1))}>
                                ↑
                              </button>
                            )}
                            {i < course.lessons.length - 1 && (
                              <button type="button" className="adm-icon" title="Ниже" aria-label={`Урок ${i + 1}: ниже`} onClick={() => update((c) => shift(c.courses[ci].lessons, i, 1))}>
                                ↓
                              </button>
                            )}
                            <button type="button" className="adm-icon adm-icon--danger" title="Удалить урок" aria-label={`Урок ${i + 1}: удалить`} onClick={() => removeLesson(i)}>
                              ×
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                    {lessonSlot(null)}
                  </nav>
                  <button type="button" className="btn btn--ghost adm-btn" onClick={addLesson}>
                    ＋ Урок
                  </button>
                </>
              )}
              <div className="adm-side__bottom">
                <button type="button" className={`adm-link ${view === 'site' ? 'is-active' : ''}`} onClick={() => setSel({ ...sel, view: 'site', lesson: null })}>
                  Сайт и список курсов
                </button>
                <button type="button" className="adm-link adm-link--danger" onClick={resetDraft}>
                  Сбросить черновик
                </button>
              </div>
            </aside>

            <main className="adm-main">
              {view === 'site' && <SiteEditor onAddCourse={addCourse} onOpenCourse={(key) => setSel({ course: key, view: 'course', lesson: null })} />}
              {view === 'course' && <CourseEditor key={course._key} ci={ci} />}
              {view === 'images' && <ImagesPanel key={course._key} ci={ci} />}
              {view === 'lesson' && <LessonEditor key={lesson._key} ci={ci} li={li} />}
            </main>

            <section className="adm-preview" aria-label="Предпросмотр">
              <Preview api={previewApi} version={version} courseId={course?.id} lessonId={view === 'lesson' ? lesson.id : null} catalog={view === 'site'} />
            </section>
          </div>
        </div>
      </ImagesContext.Provider>
    </AdminContext.Provider>
  )
}
