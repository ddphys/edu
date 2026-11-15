import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import TaskBank from './TaskBank.jsx'
import TaskEditor from './TaskEditor.jsx'
import { pct, useAction, useLoad } from './ui.jsx'

// Конструктор: слева дерево курсов и уроков, в центре урок, справа банк задач.
export default function Builder() {
  const { courseId, lessonId } = useParams()
  const nav = useNavigate()
  const act = useAction()
  const tree = useLoad('/api/admin/courses')
  const [lesson, setLesson] = useState(null)
  const [editing, setEditing] = useState(null)
  const [bankVersion, setBankVersion] = useState(0)

  const loadLesson = useCallback(() => {
    if (!lessonId) return setLesson(null)
    return api
      .get(`/api/admin/lessons/${lessonId}`)
      .then(setLesson)
      .catch(() => setLesson(null))
  }, [lessonId])
  useEffect(() => {
    loadLesson()
  }, [loadLesson])

  const inLesson = useMemo(() => new Set(lesson?.tasks.map((t) => t.id) || []), [lesson])

  // Сохранить состав урока (упорядоченный список задач)
  async function setTasks(ids) {
    const prev = lesson
    setLesson((l) => ({ ...l, tasks: ids.map((id) => l.tasks.find((t) => t.id === id) || { id, title: '…', parts: [], hints: [], stats: {} }) }))
    const ok = await act(() => api.put(`/api/admin/lessons/${lessonId}/tasks`, { taskIds: ids }))
    if (!ok) setLesson(prev)
    await loadLesson()
    tree.reload()
    setBankVersion((v) => v + 1)
  }
  const addTask = (id, at) => {
    if (!lesson || inLesson.has(id)) return
    const ids = lesson.tasks.map((t) => t.id)
    ids.splice(at ?? ids.length, 0, id)
    setTasks(ids)
  }

  const course = tree.data?.courses.find((c) => String(c.id) === courseId)

  return (
    <div className="builder">
      <CourseTree tree={tree} courseId={courseId} lessonId={lessonId} nav={nav} />
      <div className="builder__center">
        {lessonId && lesson ? (
          <LessonPanel
            key={lessonId}
            data={lesson}
            courses={tree.data?.courses || []}
            onChanged={() => {
              loadLesson()
              tree.reload()
            }}
            onDeleted={() => {
              tree.reload()
              nav(`/admin/builder/${courseId}`)
            }}
            onDuplicated={(l) => {
              tree.reload()
              nav(`/admin/builder/${l.courseId}/${l.id}`)
            }}
            setTasks={setTasks}
            addTask={addTask}
            openTask={setEditing}
          />
        ) : lessonId ? (
          <div className="muted pad">Загрузка урока…</div>
        ) : course ? (
          <CoursePanel key={course.id} course={course} onChanged={tree.reload} onDeleted={() => { tree.reload(); nav('/admin/builder') }} />
        ) : (
          <div className="muted pad">Выберите курс или урок слева.</div>
        )}
      </div>
      <div className="builder__bank">
        <div className="panel-title">
          Банк задач {lesson ? <span className="muted">— «+» или перетащите строку в урок</span> : <span className="muted">— откройте урок, чтобы добавлять</span>}
        </div>
        <TaskBank
          compact
          version={bankVersion}
          inLesson={lesson ? inLesson : null}
          onAdd={lesson ? (id) => addTask(id) : null}
          onOpen={setEditing}
          onNew={() => setEditing('new')}
        />
      </div>
      {editing && (
        <TaskEditor
          key={editing}
          taskId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => {
            setBankVersion((v) => v + 1)
            loadLesson()
            if (isNew) {
              setEditing(t.id)
              if (lesson && confirm('Добавить новую задачу в открытый урок?')) addTask(t.id)
            }
          }}
        />
      )}
    </div>
  )
}

// ---------- Дерево курсов ----------
function CourseTree({ tree, courseId, lessonId, nav }) {
  const act = useAction()
  const [drag, setDrag] = useState(null) // {lessonId, fromCourse}
  const [over, setOver] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const courses = tree.data?.courses || []

  async function addCourse() {
    const title = prompt('Название нового курса')
    if (!title) return
    const r = await act(() => api.post('/api/admin/courses', { title }), 'Курс создан')
    if (r) {
      await tree.reload()
      nav(`/admin/builder/${r.course.id}`)
    }
  }
  async function addLesson(cid) {
    const title = prompt('Название нового урока')
    if (!title) return
    const r = await act(() => api.post('/api/admin/lessons', { courseId: cid, title }), 'Урок создан')
    if (r) {
      await tree.reload()
      nav(`/admin/builder/${cid}/${r.lesson.id}`)
    }
  }
  async function dropLesson(targetCourse, beforeLessonId) {
    if (!drag) return
    const c = courses.find((x) => x.id === targetCourse)
    const ids = c.lessons.map((l) => l.id).filter((id) => id !== drag.lessonId)
    const at = beforeLessonId ? ids.indexOf(beforeLessonId) : ids.length
    ids.splice(at < 0 ? ids.length : at, 0, drag.lessonId)
    setDrag(null)
    setOver(null)
    await act(() => api.put(`/api/admin/courses/${targetCourse}/lessons/order`, { ids }))
    await tree.reload()
    if (String(drag.lessonId) === lessonId && String(targetCourse) !== courseId) nav(`/admin/builder/${targetCourse}/${lessonId}`)
  }
  async function moveCourse(i, d) {
    const ids = courses.map((c) => c.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    await act(() => api.put('/api/admin/courses/order', { ids }))
    tree.reload()
  }

  return (
    <div className="builder__tree">
      <div className="panel-title">
        Курсы и уроки
        <button className="b b--xs b--primary" onClick={addCourse}>
          + курс
        </button>
      </div>
      {tree.error && <div className="err">{tree.error}</div>}
      {courses.map((c, ci) => (
        <div key={c.id} className="tree__course">
          <div
            className={`tree__row tree__row--course ${String(c.id) === courseId && !lessonId ? 'is-active' : ''}`}
            onDragOver={(e) => drag && (e.preventDefault(), setOver(`c${c.id}`))}
            onDrop={() => dropLesson(c.id, null)}
          >
            <button className="b b--xs b--flat" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })}>
              {collapsed.has(c.id) ? '▸' : '▾'}
            </button>
            <button className="lnk tree__name" onClick={() => nav(`/admin/builder/${c.id}`)}>
              {c.title}
            </button>
            {!c.published && <span className="badge">скрыт</span>}
            <span className="tree__tools">
              <button className="b b--xs b--flat" disabled={ci === 0} onClick={() => moveCourse(ci, -1)}>↑</button>
              <button className="b b--xs b--flat" disabled={ci === courses.length - 1} onClick={() => moveCourse(ci, 1)}>↓</button>
              <button className="b b--xs" onClick={() => addLesson(c.id)} title="Новый урок">
                + урок
              </button>
            </span>
          </div>
          {!collapsed.has(c.id) &&
            c.lessons.map((l, li) => (
              <div
                key={l.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-lesson', String(l.id))
                  setDrag({ lessonId: l.id })
                }}
                onDragEnd={() => (setDrag(null), setOver(null))}
                onDragOver={(e) => drag && (e.preventDefault(), setOver(`l${l.id}`))}
                onDrop={(e) => (e.stopPropagation(), dropLesson(c.id, l.id))}
                className={`tree__row tree__row--lesson ${String(l.id) === lessonId ? 'is-active' : ''} ${over === `l${l.id}` ? 'drop-before' : ''}`}
                onClick={() => nav(`/admin/builder/${c.id}/${l.id}`)}
              >
                <span className="grip">⋮⋮</span>
                <span className="muted">{li + 1}.</span>
                <span className="tree__name">{l.title}</span>
                <span className="tree__meta">
                  {l.free && <span className="badge badge--green">беспл.</span>}
                  {!l.published && <span className="badge">черн.</span>}
                  <span className="muted">{l.taskCount}</span>
                </span>
              </div>
            ))}
          {!collapsed.has(c.id) && drag && (
            <div className={`tree__dropend ${over === `c${c.id}` ? 'drop-before' : ''}`} onDragOver={(e) => (e.preventDefault(), setOver(`c${c.id}`))} onDrop={() => dropLesson(c.id, null)}>
              в конец курса
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Настройки курса ----------
function CoursePanel({ course, onChanged, onDeleted }) {
  const act = useAction()
  const [f, setF] = useState({ ...course, attemptMultipliers: course.attemptMultipliers.join('; ') })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save() {
    const body = {
      title: f.title,
      slug: f.slug,
      badge: f.badge,
      about: f.about,
      teacherName: f.teacherName,
      teacherPhoto: f.teacherPhoto,
      defaultTaskXp: Number(f.defaultTaskXp),
      attemptMultipliers: f.attemptMultipliers.split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.'))),
      published: f.published,
    }
    if (await act(() => api.patch(`/api/admin/courses/${course.id}`, body), 'Курс сохранён')) onChanged()
  }
  async function remove() {
    if (!confirm(`Удалить курс «${course.title}» и все его уроки? Задачи останутся в банке, но прогресс учеников по курсу перестанет отображаться.`)) return
    if (await act(() => api.del(`/api/admin/courses/${course.id}`), 'Курс удалён')) onDeleted()
  }

  return (
    <div className="pad">
      <div className="panel-title">
        Курс #{course.id}
        <span>
          <a className="b" href={`/course/${course.id}`} target="_blank" rel="noreferrer">
            Открыть как ученик ↗
          </a>
          <button className="b b--primary" onClick={save}>
            Сохранить
          </button>
          <button className="b b--danger" onClick={remove}>
            Удалить курс
          </button>
        </span>
      </div>
      <div className="grid-form grid-form--4">
        <label className="span2">
          Название
          <input value={f.title} onChange={set('title')} />
        </label>
        <label>
          Адрес (латиница)
          <input value={f.slug} onChange={set('slug')} />
        </label>
        <label className="chk chk--field">
          <input type="checkbox" checked={f.published} onChange={set('published')} /> виден ученикам
        </label>
        <label className="span2">
          Плашка над названием
          <input value={f.badge} onChange={set('badge')} />
        </label>
        <label>
          Преподаватель
          <input value={f.teacherName} onChange={set('teacherName')} />
        </label>
        <label>
          Фото преподавателя (ссылка)
          <input value={f.teacherPhoto} onChange={set('teacherPhoto')} />
        </label>
        <label>
          XP за задачу по умолчанию
          <input type="number" min="1" value={f.defaultTaskXp} onChange={set('defaultTaskXp')} />
        </label>
        <label className="span3">
          Доля XP за 1-ю, 2-ю, … попытку (через «;»). Число значений = число попыток
          <input value={f.attemptMultipliers} onChange={set('attemptMultipliers')} />
        </label>
        <label className="span4">
          О курсе
          <textarea rows={5} value={f.about} onChange={set('about')} />
        </label>
      </div>
      <table className="t t--auto">
        <thead>
          <tr>
            <th>#</th>
            <th>Урок</th>
            <th>Задач</th>
            <th>Бесплатный</th>
            <th>Опубликован</th>
          </tr>
        </thead>
        <tbody>
          {course.lessons.map((l, i) => (
            <tr key={l.id}>
              <td className="num">{i + 1}</td>
              <td>{l.title}</td>
              <td className="num">{l.taskCount}</td>
              <td>{l.free ? 'да' : ''}</td>
              <td>{l.published ? 'да' : 'черновик'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Урок: поля + состав ----------
function LessonPanel({ data, courses, onChanged, onDeleted, onDuplicated, setTasks, addTask, openTask }) {
  const act = useAction()
  const { lesson, tasks } = data
  const [f, setF] = useState(lesson)
  const [dirty, setDirty] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
    setDirty(true)
  }

  async function save() {
    const { title, description, videoUrl, videoVertical, free, published, courseId } = f
    if (await act(() => api.patch(`/api/admin/lessons/${lesson.id}`, { title, description, videoUrl, videoVertical, free, published, courseId: Number(courseId) }), 'Урок сохранён')) {
      setDirty(false)
      onChanged()
    }
  }
  async function remove() {
    if (!confirm(`Удалить урок «${lesson.title}»? Задачи останутся в банке.`)) return
    if (await act(() => api.del(`/api/admin/lessons/${lesson.id}`), 'Урок удалён')) onDeleted()
  }
  async function duplicate() {
    const r = await act(() => api.post(`/api/admin/lessons/${lesson.id}/duplicate`), 'Копия урока создана')
    if (r) onDuplicated(r.lesson)
  }

  const ids = tasks.map((t) => t.id)
  const move = (from, to) => {
    if (to < 0 || to >= ids.length || from === to) return
    const a = [...ids]
    const [x] = a.splice(from, 1)
    a.splice(to, 0, x)
    setTasks(a)
  }
  function onDrop(e, idx) {
    e.preventDefault()
    const bankId = e.dataTransfer.getData('application/x-task')
    if (bankId) addTask(Number(bankId), idx)
    else if (dragIdx !== null) move(dragIdx, idx > dragIdx ? idx - 1 : idx)
    setDragIdx(null)
    setOverIdx(null)
  }
  const allow = (e) => {
    if (e.dataTransfer.types.includes('application/x-task') || dragIdx !== null) {
      e.preventDefault()
      return true
    }
  }

  return (
    <div className="pad">
      <div className="panel-title">
        Урок #{lesson.id} {dirty && <span className="warn">• не сохранено</span>}
        <span>
          <a className="b" href={`/course/${lesson.courseId}/lesson/${lesson.id}`} target="_blank" rel="noreferrer">
            Открыть как ученик ↗
          </a>
          <button className="b b--primary" onClick={save} disabled={!dirty}>
            Сохранить
          </button>
          <button className="b" onClick={duplicate}>
            Дублировать
          </button>
          <button className="b b--danger" onClick={remove}>
            Удалить
          </button>
        </span>
      </div>
      <div className="grid-form grid-form--4">
        <label className="span3">
          Название урока
          <input value={f.title} onChange={set('title')} />
        </label>
        <label>
          Курс
          <select value={f.courseId} onChange={set('courseId')}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="span2">
          Ссылка на видео Rutube
          <input value={f.videoUrl} onChange={set('videoUrl')} placeholder="https://rutube.ru/video/…" />
        </label>
        <label className="chk chk--field">
          <input type="checkbox" checked={f.videoVertical} onChange={set('videoVertical')} /> вертикальное видео
        </label>
        <span className="chk-group">
          <label className="chk">
            <input type="checkbox" checked={f.free} onChange={set('free')} /> бесплатный
          </label>
          <label className="chk">
            <input type="checkbox" checked={f.published} onChange={set('published')} /> опубликован
          </label>
        </span>
        <label className="span4">
          Описание (каждый пункт с новой строки)
          <textarea rows={3} value={f.description} onChange={set('description')} />
        </label>
      </div>

      <div className="panel-title">
        Задачи урока ({tasks.length}) <span className="muted">— перетаскивайте строки, чтобы поменять порядок</span>
      </div>
      <div className="tablewrap">
        <table className="t lesson-tasks">
          <thead>
            <tr>
              <th />
              <th>№</th>
              <th>#</th>
              <th>Название</th>
              <th>Тема</th>
              <th title="Полей ответа">Отв.</th>
              <th title="Подсказок">Подск.</th>
              <th title="Начали / решили верно">Нач./Реш.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr
                key={t.id}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(t.id))
                }}
                onDragEnd={() => (setDragIdx(null), setOverIdx(null))}
                onDragOver={(e) => allow(e) && setOverIdx(i)}
                onDrop={(e) => onDrop(e, i)}
                className={`${overIdx === i ? 'drop-before' : ''} ${dragIdx === i ? 'is-dragging' : ''}`}
              >
                <td className="grip">⋮⋮</td>
                <td className="num">{i + 1}</td>
                <td className="num muted">{t.id}</td>
                <td className="t__title">
                  <button className="lnk" onClick={() => openTask(t.id)} title={t.text?.slice(0, 400)}>
                    {t.title}
                  </button>
                </td>
                <td className="ell">{t.topic}</td>
                <td className="num">{t.parts.length}</td>
                <td className="num">{t.hints.length}</td>
                <td className="num">
                  {t.stats?.started ?? 0} / {t.stats?.solved ?? 0} {t.stats?.started ? <span className="muted">({pct(t.stats.solved, t.stats.started)})</span> : ''}
                </td>
                <td className="nowrap">
                  <button className="b b--xs" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                  <button className="b b--xs" disabled={i === tasks.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                  <button className="b b--xs b--danger" title="Убрать из урока (задача останется в банке)" onClick={() => setTasks(ids.filter((x) => x !== t.id))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr className={`drop-zone ${overIdx === tasks.length ? 'drop-before' : ''}`} onDragOver={(e) => allow(e) && setOverIdx(tasks.length)} onDrop={(e) => onDrop(e, tasks.length)}>
              <td colSpan={9}>{tasks.length ? 'Перетащите сюда задачу из банка, чтобы добавить в конец' : 'В уроке пока нет задач. Перетащите их сюда из банка справа или нажмите «+»'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
