import { useRef } from 'react'
import MathText from './Math.jsx'
import { isGroup } from '../lib.js'
import { href } from '../routes.js'
import { typeOf } from '../types/index.js'

// Версия урока для печати: условия всех задач подряд, без полей ответа, подсказок и разборов.
// На экране это предпросмотр листа; на бумагу уходит только сам лист (см. @media print в styles.css).
function SheetTask({ task, number }) {
  // Что тип задачи добавляет к условию: подписи полей ответа, варианты на выбор
  const extra = typeOf(task)?.sheet?.(task)
  return (
    <li className="sheet-task">
      <h3>
        {number}. {task.title}
      </h3>
      <MathText text={task.text} eager />
      {extra && (
        <div className="sheet-task__extra">
          <div className="sheet-task__note">{extra.title}</div>
          <ol className={extra.numbered ? 'is-numbered' : ''}>
            {extra.items.map((item, i) => (
              <li key={i}>
                {extra.numbered && <span className="sheet-task__n">{i + 1})</span>}
                <MathText text={item} eager />
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}

export default function PrintSheet({ course, lesson, number }) {
  const paper = useRef(null)
  const lessonUrl = window.location.href.replace(/#.*$/, '') + href.lesson(course.id, lesson.id)

  // Печатаем, когда все картинки листа загрузились, — иначе на бумаге будут пустые места
  async function print() {
    const images = [...(paper.current?.querySelectorAll('img') ?? [])]
    await Promise.all(images.map((img) => (img.complete ? null : img.decode().catch(() => {}))))
    window.print()
  }

  // Сквозная нумерация — та же, что на странице урока
  let count = 0
  const items = lesson.tasks ?? []

  return (
    <div className="sheet">
      <div className="sheet__bar">
        <a className="back" href={href.lesson(course.id, lesson.id)}>
          ← К уроку
        </a>
        <button type="button" className="btn btn--primary" onClick={print}>
          Напечатать
        </button>
      </div>

      <article className="sheet__paper" ref={paper}>
        <header className="sheet__head">
          <div className="sheet__course">
            {course.title} · Урок {number}
          </div>
          <h1>{lesson.title}</h1>
          <div className="sheet__sub">Домашнее задание</div>
        </header>

        {items.length === 0 && <p className="muted">В этом уроке пока нет задач.</p>}
        <ol className="sheet__tasks">
          {items.map((item) => {
            if (isGroup(item)) {
              if (item.tasks.length === 0) return null
              return (
                <li key={item.tasks[0].id} className="sheet-group">
                  {item.title && <div className="sheet-group__title">{item.title}</div>}
                  <ol className="sheet__tasks">
                    {item.tasks.map((t) => (
                      <SheetTask key={t.id} task={t} number={++count} />
                    ))}
                  </ol>
                </li>
              )
            }
            return <SheetTask key={item.id} task={item} number={++count} />
          })}
        </ol>

        <footer className="sheet__foot">Ответы вводятся на сайте: {lessonUrl}</footer>
      </article>
    </div>
  )
}
