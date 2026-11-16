import { useState } from 'react'
import { VIDEO_PLATFORMS, isGroup, parseNumber, parseVideo, taskMaxXp } from '../lib.js'
import { types, typeOf } from '../types/index.js'
import { Check, Field, Issues, Lines, Num, Rich, RowTools, Select, Text, useAdmin } from './fields.jsx'
import { countUnder } from './issues.js'
import { moveItem, newGroup, newQuizItem, newTask, shift, uid } from './model.js'
import { typeEditors } from './typeEditors.js'

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// «1:35» или «95» → секунды
function parseTime(text) {
  const m = text.trim().match(/^(\d+):(\d{1,2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : parseNumber(text)
}

// Значок с числом замечаний
export function Badge({ path }) {
  const { issues } = useAdmin()
  const { errors, warns } = countUnder(issues, path)
  if (!errors && !warns) return null
  return (
    <span className="adm-badges">
      {errors > 0 && <span className="adm-badge adm-badge--error" title="Ошибки">{errors}</span>}
      {warns > 0 && <span className="adm-badge adm-badge--warn" title="Предупреждения">{warns}</span>}
    </span>
  )
}

// ---------- Видео ----------
function VideoFields({ lesson, change, path }) {
  const url = lesson.videoUrl ?? ''
  const video = parseVideo(url)
  return (
    <section className="adm-card">
      <h3>Видео</h3>
      <Text
        label="Ссылка на запись"
        path={`${path}/videoUrl`}
        value={url}
        onChange={(v) => change((l) => void (l.videoUrl = v))}
        placeholder="YouTube, Rutube, Kinescope или прямая ссылка на mp4"
      />
      {url.trim() !== '' && video && (
        <div className="adm-note adm-note--ok">
          Распознано: {VIDEO_PLATFORMS[video.type]}
          {video.id ? ` · ${video.id}` : ''}
        </div>
      )}
      {url.trim() === '' && <div className="adm-hint">Пока ссылки нет, ученик видит заглушку «Запись занятия пока не добавлена».</div>}
      <Check label="Вертикальное видео (шортс)" checked={lesson.videoVertical} onChange={(v) => change((l) => void (l.videoVertical = v))} />
    </section>
  )
}

// ---------- Вопросы по ходу видео ----------
function QuizTime({ value, onChange, path }) {
  const [text, setText] = useState(() => (typeof value === 'number' ? fmtTime(value) : String(value ?? '')))
  return (
    <Field label="Время" path={path} hint="мин:сек или секунды">
      <input
        className="adm-input"
        aria-label="Время вопроса"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = e.target.value.trim() === '' ? undefined : parseTime(e.target.value)
          onChange(n === null ? e.target.value : n)
        }}
        onBlur={() => typeof value === 'number' && setText(fmtTime(value))}
      />
    </Field>
  )
}

function QuizFields({ lesson, change, path }) {
  const quiz = lesson.quiz ?? []
  return (
    <section className="adm-card">
      <h3>Вопросы по ходу видео</h3>
      <p className="adm-hint">В указанный момент видео встаёт на паузу и поверх него появляется вопрос. XP за эти вопросы не начисляется.</p>
      {quiz.map((q, i) => {
        const qPath = `${path}/quiz/${i}`
        const options = q.options ?? []
        return (
          <div className="adm-sub" key={q._key}>
            <div className="adm-sub__head">
              <b>Вопрос {i + 1}</b>
              <Badge path={qPath} />
              <RowTools what={`Вопрос ${i + 1}`} onDelete={() => change((l) => void l.quiz.splice(i, 1))} />
            </div>
            <div className="adm-row adm-row--time">
              <QuizTime value={q.time} path={`${qPath}/time`} onChange={(v) => change((l) => void (l.quiz[i].time = v))} />
              <Rich label="Текст вопроса" path={`${qPath}/question`} rows={2} value={q.question} onChange={(v) => change((l) => void (l.quiz[i].question = v))} />
            </div>
            <Field label="Варианты — отметьте верный" path={`${qPath}/options`}>
              {options.map((o, k) => (
                <div className="adm-option" key={k}>
                  <label className="adm-option__mark" title="Верный вариант">
                    <input type="radio" name={`quiz-${q._key}`} aria-label={`Вариант ${k + 1} верный`} checked={q.correct === k} onChange={() => change((l) => void (l.quiz[i].correct = k))} />
                  </label>
                  <Rich compact label={`Вариант ${k + 1}`} path={`${qPath}/options/${k}`} rows={1} value={o} onChange={(v) => change((l) => void (l.quiz[i].options[k] = v))} />
                  <RowTools
                    what={`Вариант ${k + 1}`}
                    onDelete={
                      options.length > 2
                        ? () =>
                            change((l) => {
                              const item = l.quiz[i]
                              item.options.splice(k, 1)
                              if (item.correct === k) item.correct = null
                              else if (item.correct > k) item.correct -= 1
                            })
                        : null
                    }
                  />
                </div>
              ))}
              <button type="button" className="adm-link" onClick={() => change((l) => void l.quiz[i].options.push(''))}>
                ＋ Вариант
              </button>
            </Field>
            <Field path={`${qPath}/correct`} />
            <Rich label="Пояснение после ответа" path={`${qPath}/explain`} rows={2} value={q.explain} onChange={(v) => change((l) => void (l.quiz[i].explain = v))} />
          </div>
        )
      })}
      <button
        type="button"
        className="btn btn--ghost adm-btn"
        onClick={() =>
          change((l) => {
            l.quiz ??= []
            l.quiz.push(newQuizItem())
          })
        }
      >
        ＋ Вопрос к видео
      </button>
      {quiz.length > 1 && (
        <button type="button" className="adm-link adm-link--gap" onClick={() => change((l) => void l.quiz.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)))}>
          Расставить по времени
        </button>
      )}
    </section>
  )
}

// ---------- Задача ----------
function TaskEditor({ task, number, path, change, course, tools, drag }) {
  const { isOpen, toggleOpen } = useAdmin()
  const open = isOpen(task._key)
  const type = typeOf(task)
  const Editor = typeEditors[type?.id]
  const hints = task.hints ?? []
  const rubric = task.rubric ?? []

  const setType = (id) => {
    if (id === (task.type ?? 'number')) return
    change((t) => {
      for (const field of typeOf(t)?.fields ?? []) delete t[field]
      t.type = id
      Object.assign(t, types[id].create())
    })
  }

  const levels = [
    ['', `По умолчанию (уровень ${course.defaultLevel} — ${course.levelXp?.[course.defaultLevel]} XP)`],
    ...[1, 2, 3, 4, 5].map((l) => [String(l), `${l} — ${course.levelXp?.[l]} XP`]),
  ]

  return (
    <div className={`adm-task ${open ? 'is-open' : ''}`} data-path={path}>
      <div className="adm-task__head" draggable {...drag}>
        <span className="adm-grip" title="Перетащите, чтобы переставить" aria-hidden="true">
          ⠿
        </span>
        <button type="button" className="adm-task__title" aria-expanded={open} onClick={() => toggleOpen(task._key)}>
          <span className="adm-task__num">{number}</span>
          <span className="adm-task__name">{task.title || 'Без названия'}</span>
          <span className="adm-chip">{type?.title ?? 'неизвестный тип'}</span>
          {task.attach && <span className="adm-chip">фото решения</span>}
          <span className="adm-chip adm-chip--mono">{task.id}</span>
        </button>
        <Badge path={path} />
        {tools}
      </div>

      {open && (
        <div className="adm-task__body">
          <div className="adm-row adm-row--3">
            <Text label="id задачи" path={`${path}/id`} hint="По id хранится прогресс учеников" value={task.id} onChange={(v) => change((t) => void (t.id = v.trim()))} />
            <Select label="Тип задачи" path={`${path}/type`} hint={type?.hint} value={task.type ?? 'number'} onChange={setType} options={Object.values(types).map((t) => [t.id, t.title])} />
            <Select label="Сложность" path={`${path}/level`} value={task.level ? String(task.level) : ''} onChange={(v) => change((t) => void (v ? (t.level = Number(v)) : delete t.level))} options={levels} />
          </div>
          <div className="adm-row adm-row--title">
            <Text label="Название" path={`${path}/title`} value={task.title} onChange={(v) => change((t) => void (t.title = v))} />
            <Num label="Точная цена, XP" path={`${path}/xp`} hint={`Пусто — по сложности (${taskMaxXp({ level: task.level }, course)} XP)`} value={task.xp} onChange={(v) => change((t) => void (v === undefined ? delete t.xp : (t.xp = v)))} />
          </div>
          <Rich label="Условие" path={`${path}/text`} rows={5} value={task.text} onChange={(v) => change((t) => void (t.text = v))} hint="Формулы: $...$ в строке, $$...$$ отдельной строкой. Жирный: **текст**. Пустая строка — новый абзац." />

          {Editor ? <Editor task={task} change={change} path={path} /> : <div className="adm-issue adm-issue--error">Для этого типа задачи нет формы в редакторе.</div>}

          <Field label="Подсказки" hint="Открываются по одной, каждая стоит ученику часть XP." path={`${path}/hints`}>
            {hints.map((h, i) => (
              <div className="adm-option" key={i}>
                <Rich label={`Подсказка ${i + 1}`} path={`${path}/hints/${i}`} rows={2} value={h} onChange={(v) => change((t) => void (t.hints[i] = v))} />
                <RowTools
                  what={`Подсказка ${i + 1}`}
                  onUp={i > 0 ? () => change((t) => shift(t.hints, i, -1)) : null}
                  onDown={i < hints.length - 1 ? () => change((t) => shift(t.hints, i, 1)) : null}
                  onDelete={() => change((t) => void t.hints.splice(i, 1))}
                />
              </div>
            ))}
            <button type="button" className="adm-link" onClick={() => change((t) => void (t.hints = [...(t.hints ?? []), '']))}>
              ＋ Подсказка
            </button>
          </Field>

          <Rich label="Разбор решения" path={`${path}/solution`} rows={4} value={task.solution} onChange={(v) => change((t) => void (t.solution = v))} hint="Показывается после ответа или «Я не знаю»." />

          <Check
            label="Можно приложить фото решения"
            hint="Ученик вводит ответ как обычно и дополнительно может сфотографировать своё решение. Пока фото хранится только в его браузере."
            checked={task.attach}
            onChange={(v) => change((t) => void (v ? (t.attach = true) : delete t.attach))}
          />
          {(task.attach || rubric.length > 0) && (
            <Field label="Критерии проверки решения" hint="Что должно быть в решении. Ученик их не видит — они понадобятся для проверки решений." path={`${path}/rubric`}>
              {rubric.map((r, i) => (
                <div className="adm-option" key={i}>
                  <Text label={`Критерий ${i + 1}`} path={`${path}/rubric/${i}`} value={r} onChange={(v) => change((t) => void (t.rubric[i] = v))} />
                  <RowTools what={`Критерий ${i + 1}`} onDelete={() => change((t) => void t.rubric.splice(i, 1))} />
                </div>
              ))}
              <button type="button" className="adm-link" onClick={() => change((t) => void (t.rubric = [...(t.rubric ?? []), '']))}>
                ＋ Критерий
              </button>
            </Field>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Список задач и групп с перетаскиванием ----------
function TasksFields({ lesson, change, path, course }) {
  const { toggleOpen } = useAdmin()
  const [drag, setDrag] = useState(null) // что тащим: { key, group: это группа }
  const [over, setOver] = useState(null) // над каким местом вставки сейчас курсор
  const items = lesson.tasks ?? []

  const dragProps = (key, group = false) => ({
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', key)
      setDrag({ key, group })
    },
    onDragEnd: () => {
      setDrag(null)
      setOver(null)
    },
  })

  // Место вставки: полоска между задачами. Группу внутрь группы положить нельзя.
  const slot = ({ group = null, before = null, label } = {}) => {
    const id = `${group ?? ''}:${before ?? ''}`
    const allowed = drag && !(drag.group && group) && drag.key !== before
    return (
      <div
        key={`slot-${id}`}
        className={`adm-slot ${allowed && over === id ? 'is-over' : ''} ${label && drag && allowed ? 'adm-slot--label' : ''}`}
        onDragOver={(e) => {
          if (!allowed) return
          e.preventDefault()
          setOver(id)
        }}
        onDragLeave={() => setOver((v) => (v === id ? null : v))}
        onDrop={(e) => {
          e.preventDefault()
          if (allowed) change((l) => moveItem(l, drag.key, { group, before }))
          setDrag(null)
          setOver(null)
        }}
      >
        {label && drag && allowed ? label : null}
      </div>
    )
  }

  const add = (typeId, groupIndex = null) => {
    const task = newTask(course, lesson, typeId)
    toggleOpen(task._key, true)
    change((l) => {
      l.tasks ??= []
      ;(groupIndex === null ? l.tasks : l.tasks[groupIndex].tasks).push(task)
    })
  }

  const duplicate = (task) => ({ ...structuredClone(task), _key: uid(), _orig: undefined, id: newTask(course, lesson, task.type ?? 'number').id, title: `${task.title} (копия)` })

  const addButtons = (groupIndex = null) => (
    <span className="adm-add">
      {Object.values(types).map((t) => (
        <button type="button" key={t.id} className="adm-link" onClick={() => add(t.id, groupIndex)}>
          ＋ {t.title}
        </button>
      ))}
    </span>
  )

  let number = 0
  return (
    <section className="adm-card">
      <h3>Домашнее задание</h3>
      <p className="adm-hint">Задачи идут на странице одна под другой. Группа собирает несколько коротких задач в одну ячейку с номерами. Порядок меняется перетаскиванием или стрелками.</p>
      <div className="adm-tasks">
        {items.map((item, ti) => {
          const iPath = `${path}/tasks/${ti}`
          const topTools = (
            <RowTools
              what="Задача"
              onUp={ti > 0 ? () => change((l) => shift(l.tasks, ti, -1)) : null}
              onDown={ti < items.length - 1 ? () => change((l) => shift(l.tasks, ti, 1)) : null}
              onDelete={() => confirm(isGroup(item) ? 'Удалить группу вместе с задачами?' : `Удалить задачу «${item.title || item.id}»?`) && change((l) => void l.tasks.splice(ti, 1))}
            />
          )
          if (isGroup(item))
            return (
              <div key={item._key}>
                {slot({ before: item._key })}
                <div className="adm-group" data-path={iPath}>
                  <div className="adm-group__head" draggable {...dragProps(item._key, true)}>
                    <span className="adm-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span className="adm-chip">Группа</span>
                    <input className="adm-input" aria-label="Название группы" placeholder="Название группы, например «Тренировочные задачи»" value={item.title ?? ''} onChange={(e) => change((l) => void (l.tasks[ti].title = e.target.value))} />
                    <Badge path={iPath} />
                    {topTools}
                  </div>
                  <Issues path={iPath} />
                  {item.tasks.map((task, k) => {
                    number += 1
                    return (
                      <div key={task._key}>
                        {slot({ group: item._key, before: task._key })}
                        <TaskEditor
                          task={task}
                          number={number}
                          path={`${iPath}/tasks/${k}`}
                          course={course}
                          change={(fn) => change((l) => fn(l.tasks[ti].tasks[k]))}
                          drag={dragProps(task._key)}
                          tools={
                            <span className="adm-tools">
                              <button type="button" className="adm-icon" title="Вынести из группы" aria-label="Вынести из группы" onClick={() => change((l) => moveItem(l, task._key, { group: null, before: item._key }))}>
                                ⇤
                              </button>
                              <button type="button" className="adm-icon" title="Сделать копию" aria-label="Сделать копию задачи" onClick={() => change((l) => void l.tasks[ti].tasks.splice(k + 1, 0, duplicate(task)))}>
                                ⧉
                              </button>
                              <RowTools
                                what="Задача"
                                onUp={k > 0 ? () => change((l) => shift(l.tasks[ti].tasks, k, -1)) : null}
                                onDown={k < item.tasks.length - 1 ? () => change((l) => shift(l.tasks[ti].tasks, k, 1)) : null}
                                onDelete={() => confirm(`Удалить задачу «${task.title || task.id}»?`) && change((l) => void l.tasks[ti].tasks.splice(k, 1))}
                              />
                            </span>
                          }
                        />
                      </div>
                    )
                  })}
                  {slot({ group: item._key, label: 'Перенести в конец группы' })}
                  <div className="adm-group__foot">
                    В группу: {addButtons(ti)}
                  </div>
                </div>
              </div>
            )
          number += 1
          const groups = items.filter(isGroup)
          return (
            <div key={item._key}>
              {slot({ before: item._key })}
              <TaskEditor
                task={item}
                number={number}
                path={iPath}
                course={course}
                change={(fn) => change((l) => fn(l.tasks[ti]))}
                drag={dragProps(item._key)}
                tools={
                  <span className="adm-tools">
                    {groups.length > 0 && (
                      <button type="button" className="adm-icon" title="Перенести в группу" aria-label="Перенести в группу" onClick={() => change((l) => moveItem(l, item._key, { group: groups[0]._key, before: null }))}>
                        ⇥
                      </button>
                    )}
                    <button type="button" className="adm-icon" title="Сделать копию" aria-label="Сделать копию задачи" onClick={() => change((l) => void l.tasks.splice(ti + 1, 0, duplicate(item)))}>
                      ⧉
                    </button>
                    {topTools}
                  </span>
                }
              />
            </div>
          )
        })}
        {slot({ label: 'Перенести в конец урока' })}
      </div>
      <div className="adm-add-row">
        {addButtons()}
        <button
          type="button"
          className="adm-link"
          onClick={() =>
            change((l) => {
              l.tasks ??= []
              l.tasks.push(newGroup())
            })
          }
        >
          ＋ Группа задач
        </button>
      </div>
    </section>
  )
}

// ---------- Урок ----------
export default function LessonEditor({ ci, li }) {
  const { content, update } = useAdmin()
  const course = content.courses[ci]
  const lesson = course.lessons[li]
  const path = `courses/${ci}/lessons/${li}`
  const change = (fn) => update((c) => fn(c.courses[ci].lessons[li]))

  return (
    <div className="adm-form">
      <section className="adm-card">
        <h2>Урок {li + 1}</h2>
        <div className="adm-row adm-row--title">
          <Text label="Название урока" path={`${path}/title`} value={lesson.title} onChange={(v) => change((l) => void (l.title = v))} />
          <Text label="id урока" path={`${path}/id`} hint="Попадает в адрес страницы" value={lesson.id} onChange={(v) => change((l) => void (l.id = v.trim()))} />
        </div>
        <Lines label="Темы урока" path={`${path}/description`} hint="Каждая строка — отдельный пункт под названием урока." value={lesson.description} onChange={(v) => change((l) => void (l.description = v))} />
        <Check label="Метка «Бесплатно»" checked={lesson.free} onChange={(v) => change((l) => void (l.free = v))} />
      </section>
      <VideoFields lesson={lesson} change={change} path={path} />
      <QuizFields lesson={lesson} change={change} path={path} />
      <TasksFields lesson={lesson} change={change} path={path} course={course} />
    </div>
  )
}
