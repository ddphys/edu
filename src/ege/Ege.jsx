// Бланк проверки ЕГЭ по физике: страница преподавателя.
// Три экрана: Проверка (#/ege), История (#/ege/history), Ученики (#/ege/students).
// Подгружается отдельным файлом, на страницы ученика его код не попадает.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './ege.css'
import { href } from '../routes.js'
import { examsOf, sortStudents, today } from './calc.js'
import { createLocalEgeStore } from './store.js'
import { useOnestFont } from './ui.jsx'
import CheckView from './CheckView.jsx'
import HistoryView from './HistoryView.jsx'
import StudentsView from './StudentsView.jsx'

// Сейчас данные живут в браузере (store.js). С сервером здесь подставится другая реализация с теми же методами.
let storeInstance = null
const getStore = () => (storeInstance ??= createLocalEgeStore())


const SEL_KEY = 'ege-blank-sel'
function loadSel() {
  try {
    return JSON.parse(localStorage.getItem(SEL_KEY) || 'null') || {}
  } catch {
    return {}
  }
}
function saveSel(sel) {
  try {
    localStorage.setItem(SEL_KEY, JSON.stringify(sel))
  } catch {
    /* без запоминания выбора */
  }
}

const newId = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

const SAVE_TEXT = { loading: 'загрузка', ok: 'сохранено', saving: 'сохраняю…', err: 'не сохранилось' }

export default function Ege({ view = 'check' }) {
  useOnestFont()
  const store = getStore()
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const ready = data.status !== 'loading'
  const [sel, setSel] = useState(loadSel)
  const [toastText, setToastText] = useState(null)
  const [formFor, setFormFor] = useState(null) // null — форма закрыта, 'new' — новый ученик, иначе id
  const toastTimer = useRef(0)

  const toast = (text, ms = 2600) => {
    setToastText(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastText(null), ms)
  }

  // Сообщения хранилища (файл подключён, не записалось и т. п.)
  const noticeId = data.notice?.id
  useEffect(() => {
    if (data.notice) toast(data.notice.text, 4000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId])

  useEffect(() => {
    document.title = 'Бланк ЕГЭ'
  }, [])

  // Выбранный ученик и пробник. Если сохранённого выбора уже нет — первый ученик и его последний пробник.
  const students = sortStudents(data.students)
  const student = students.find((s) => s.id === sel.sid) ?? students[0] ?? null
  const exams = student ? examsOf(data.exams, student.id) : []
  const exam = exams.find((e) => e.id === sel.eid) ?? exams.at(-1) ?? null

  const select = (next) => {
    setSel(next)
    saveSel(next)
  }
  const go = (v) => {
    if (window.location.hash !== href.ege(v)) window.location.hash = href.ege(v)
  }

  const actions = {
    selectStudent: (id) => select({ sid: id, eid: null }),
    selectExam: (id) => select({ sid: student?.id, eid: id }),
    setScore(n, v) {
      if (!exam) return
      const scores = { ...exam.scores }
      if (scores[n] === v) delete scores[n]
      else scores[n] = v
      store.put('exams', { ...exam, scores })
    },
    newExam() {
      if (!student) return
      const e = { id: newId(), studentId: student.id, title: 'Пробник ' + (exams.length + 1), date: today(), scores: {}, createdAt: Date.now() }
      store.put('exams', e)
      select({ sid: student.id, eid: e.id })
      go('check')
    },
    updateExam: (e, patch) => store.put('exams', { ...e, ...patch }),
    deleteExam(id) {
      store.remove('exams', id)
      if (exam?.id === id) select({ sid: student?.id, eid: null })
    },
    saveStudent(id, name, goal) {
      const old = id && data.students.find((s) => s.id === id)
      if (old) store.put('students', { ...old, name, goal })
      else {
        const ns = { id: newId(), name, goal, createdAt: Date.now() }
        store.put('students', ns)
        select({ sid: ns.id, eid: null })
      }
      setFormFor(null)
    },
    deleteStudent(id) {
      for (const e of examsOf(data.exams, id)) store.remove('exams', e.id)
      store.remove('students', id)
      if (student?.id === id) select({})
      setFormFor(null)
    },
    addStudent() {
      go('students')
      setFormFor('new')
    },
  }

  const nudge =
    store.file?.supported && ready && data.file.state !== 'ready' ? (data.file.state === 'none' ? 'подключи файл данных' : 'файл не подключён') : null

  return (
    <div className="ege">
      <div className="e-app">
        <header className="e-top">
          <div className="e-brand">
            <h1>Бланк ЕГЭ</h1>
            <span className="e-savestate" data-k={data.status} role="status">
              {SAVE_TEXT[data.status]}
            </span>
            {nudge && (
              <a className="e-nudge" href={href.ege('students')}>
                {nudge}
              </a>
            )}
          </div>
          <nav className="e-nav" aria-label="Разделы">
            <a href={href.ege()} aria-current={view === 'check' ? 'page' : undefined}>
              Проверка
            </a>
            <a href={href.ege('history')} aria-current={view === 'history' ? 'page' : undefined}>
              История
            </a>
            <a href={href.ege('students')} aria-current={view === 'students' ? 'page' : undefined}>
              Ученики
            </a>
          </nav>
          <div className="e-who">
            <label className="e-sr" htmlFor="e-student">
              Ученик
            </label>
            <select id="e-student" value={student?.id ?? ''} disabled={!students.length} onChange={(ev) => actions.selectStudent(ev.target.value)}>
              {!students.length && <option value="">{ready ? 'Нет учеников' : 'Загрузка…'}</option>}
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || 'Без имени'}
                </option>
              ))}
            </select>
          </div>
        </header>

        {view === 'check' && <CheckView ready={ready} student={student} exam={exam} exams={exams} actions={actions} toast={toast} />}
        {view === 'history' && (
          <HistoryView
            student={student}
            exams={exams}
            selectedId={exam?.id}
            actions={actions}
            onOpen={(id) => {
              actions.selectExam(id)
              go('check')
            }}
          />
        )}
        {view === 'students' && (
          <StudentsView
            ready={ready}
            students={students}
            allExams={data.exams}
            file={store.file}
            fileState={data.file}
            formFor={formFor}
            setFormFor={setFormFor}
            actions={actions}
            onPick={(id) => {
              actions.selectStudent(id)
              go('check')
            }}
            toast={toast}
          />
        )}
      </div>
      {toastText && (
        <div className="e-toast" role="status">
          {toastText}
        </div>
      )}
    </div>
  )
}

