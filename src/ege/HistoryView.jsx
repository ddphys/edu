// Экран «История»: график тестового балла и список пробников ученика
import { useState } from 'react'
import { TOTAL, calc, dShort, goalOf, okDate } from './calc.js'
import { HistoryChart } from './charts.jsx'
import { ArmButton } from './ui.jsx'

function ExamRow({ exam, open, onToggle, onOpen, actions }) {
  const c = calc(exam)
  return (
    <li>
      <button type="button" className="e-lrow" aria-expanded={open} onClick={onToggle}>
        <span className="e-d">{dShort(exam.date)}</span>
        <span className="e-t">{exam.title || 'Пробник'}</span>
        <span className="e-p">{c.checked ? `${c.p}/${TOTAL}` : ''}</span>
        <span className={'e-s' + (c.checked ? '' : ' is-none')}>{c.checked ? c.test : '–'}</span>
      </button>
      {open && (
        <div className="e-edit">
          <label className="e-sr" htmlFor="e-etitle">
            Название
          </label>
          <input id="e-etitle" type="text" maxLength={60} value={exam.title || ''} onChange={(ev) => actions.updateExam(exam, { title: ev.target.value })} />
          <label className="e-sr" htmlFor="e-edate">
            Дата
          </label>
          <input
            id="e-edate"
            type="date"
            value={okDate(exam.date) ? exam.date : ''}
            onChange={(ev) => okDate(ev.target.value) && actions.updateExam(exam, { date: ev.target.value })}
          />
          <button className="e-btn e-btn--pri" type="button" onClick={() => onOpen(exam.id)}>
            Открыть
          </button>
          <span className="e-sp" />
          <ArmButton confirmLabel="Точно удалить?" onConfirm={() => actions.deleteExam(exam.id)} />
        </div>
      )}
    </li>
  )
}

export default function HistoryView({ student, exams, selectedId, actions, onOpen }) {
  const [openId, setOpenId] = useState(null)
  return (
    <section className="e-stack">
      <div className="e-card">
        <div className="e-ch">
          <h2>Тестовый балл по пробникам</h2>
        </div>
        <div className="e-histwrap">
          <HistoryChart exams={exams} goal={goalOf(student)} selectedId={selectedId} onPick={onOpen} />
        </div>
      </div>
      <div className="e-card">
        <div className="e-ch">
          <h2>Пробники</h2>
          <button className="e-btn e-btn--ghost" type="button" disabled={!student} onClick={actions.newExam}>
            + Новый пробник
          </button>
        </div>
        <ul className="e-list">
          {!student ? (
            <li className="e-hnote">Сначала добавь ученика.</li>
          ) : !exams.length ? (
            <li className="e-hnote">Пробников пока нет.</li>
          ) : (
            exams
              .slice()
              .reverse()
              .map((e) => (
                <ExamRow key={e.id} exam={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} onOpen={onOpen} actions={actions} />
              ))
          )}
        </ul>
      </div>
    </section>
  )
}
