// Экран «Ученики»: список, добавление, изменение, удаление. Ниже блок «Данные» (только у локальной версии).
import { useEffect, useRef, useState } from 'react'
import { EGE } from './config.js'
import { calc, clampGoal, examsOf, goalOf, today } from './calc.js'
import { asciiName } from './data.js'
import { plural } from '../lib.js'
import { ArmButton, download } from './ui.jsx'


function StudentForm({ student, onSave, onCancel, onDelete, toast }) {
  const [name, setName] = useState(student?.name ?? '')
  const [goal, setGoal] = useState(String(student?.goal ?? EGE.defaultGoal))
  const nameRef = useRef(null)
  useEffect(() => nameRef.current?.focus(), [])
  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <form
      className="e-sform"
      autoComplete="off"
      onSubmit={(ev) => {
        ev.preventDefault()
        const n = name.trim()
        if (!n) {
          nameRef.current?.focus()
          toast('Введи имя ученика')
          return
        }
        onSave(n, clampGoal(goal))
      }}
    >
      <label className="e-grow">
        Имя
        <input ref={nameRef} maxLength={60} placeholder="Например, Алина К." value={name} onChange={(ev) => setName(ev.target.value)} />
      </label>
      <label>
        Цель
        <input className="e-goal" type="number" min={EGE.minTest} max="100" step="1" inputMode="numeric" value={goal} onChange={(ev) => setGoal(ev.target.value)} />
      </label>
      <button className="e-btn e-btn--pri" type="submit">
        Сохранить
      </button>
      <button className="e-btn" type="button" onClick={onCancel}>
        Отмена
      </button>
      <span className="e-sp" />
      {student && <ArmButton confirmLabel="Удалить вместе с пробниками?" onConfirm={onDelete} />}
    </form>
  )
}

const FILE_TEXT = {
  unsupported:
    'Этот браузер не умеет сам писать в файл. Данные хранятся внутри браузера, после проверки нажимай «Скачать копию». Для автосохранения в файл открой страницу в Chrome или Edge на компьютере.',
  ready: (name) => `Подключён файл «${name}». Каждый выставленный балл сразу записывается в него.`,
  needsperm: (name) => `Файл «${name}» запомнен, но браузер просит подтвердить доступ. Нажми «Подключить снова». Всё, что ты успел ввести, добавится в файл.`,
  lost: (name) => `Не удалось открыть файл «${name}». Возможно, его переместили или переименовали. Открой его заново, данные из браузера не пропадут.`,
  none: 'Файл не подключён. Сейчас данные хранятся только внутри браузера. Создай файл данных или открой существующий, и всё будет записываться в него сразу.',
}

function DataCard({ file, fileState, toast }) {
  const inputRef = useRef(null)
  const { state, name } = fileState
  const text = typeof FILE_TEXT[state] === 'function' ? FILE_TEXT[state](name) : FILE_TEXT[state]
  const ready = state === 'ready'
  return (
    <div className="e-card">
      <div className="e-ch">
        <h2>Данные</h2>
      </div>
      <div className="e-storebody">
        <p>{text}</p>
        <div className="e-acts">
          {file.supported && state === 'needsperm' && (
            <button className="e-btn e-btn--pri" type="button" onClick={file.reconnect}>
              Подключить снова
            </button>
          )}
          {file.supported && (
            <>
              <button className="e-btn e-btn--pri" type="button" onClick={file.create}>
                {ready ? 'Новый файл данных' : 'Создать файл данных'}
              </button>
              <button className="e-btn" type="button" onClick={file.open}>
                {ready ? 'Другой файл данных' : 'Открыть файл данных'}
              </button>
            </>
          )}
          <button className="e-btn" type="button" onClick={() => download(new Blob([file.exportText()], { type: 'application/json' }), asciiName(`ege-backup-${today()}.json`))}>
            Скачать копию
          </button>
          <button className="e-btn" type="button" onClick={() => inputRef.current?.click()}>
            Загрузить копию
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (ev) => {
              const f = ev.target.files?.[0]
              ev.target.value = ''
              if (!f) return
              try {
                const r = file.importText(await f.text())
                toast(r.students || r.exams ? `Добавлено из копии: учеников ${r.students}, пробников ${r.exams}` : 'Всё из копии уже есть в бланке', 4000)
              } catch (e) {
                toast(e.message, 4000)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function StudentsView({ ready, students, allExams, file, fileState, formFor, setFormFor, actions, onPick, toast }) {
  const editing = formFor && formFor !== 'new' ? students.find((s) => s.id === formFor) : null
  const close = () => setFormFor(null)
  return (
    <section className="e-stack">
      <div className="e-card">
        <div className="e-ch">
          <h2>Ученики</h2>
          <button className="e-btn e-btn--ghost" type="button" onClick={() => setFormFor('new')}>
            + Ученик
          </button>
        </div>
        {formFor && (
          <StudentForm
            key={formFor}
            student={editing}
            toast={toast}
            onCancel={close}
            onSave={(name, goal) => actions.saveStudent(editing?.id, name, goal)}
            onDelete={() => actions.deleteStudent(editing.id)}
          />
        )}
        <ul className="e-list">
          {!students.length ? (
            <li className="e-hnote">{ready ? 'Учеников пока нет. Нажми «+ Ученик».' : 'Загружаю…'}</li>
          ) : (
            students.map((s) => {
              const ex = examsOf(allExams, s.id)
              const last = ex.map(calc).findLast((c) => c.checked)
              return (
                <li key={s.id} className="e-st">
                  <button type="button" className="e-lrow" onClick={() => onPick(s.id)}>
                    <span className="e-t">
                      {s.name || 'Без имени'}
                      <span className="e-meta">
                        цель {goalOf(s)} · {ex.length} {plural(ex.length, 'пробник', 'пробника', 'пробников')}
                      </span>
                    </span>
                    <span className={'e-s' + (last ? '' : ' is-none')}>{last ? last.test : '–'}</span>
                  </button>
                  <button className="e-btn e-btn--ghost" type="button" onClick={() => setFormFor(s.id)}>
                    Изменить
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
      {file && <DataCard file={file} fileState={fileState} toast={toast} />}
    </section>
  )
}
