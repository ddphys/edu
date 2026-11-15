import { fmtDate, pct, useLoad } from './ui.jsx'

export default function Stats() {
  const { data, error } = useLoad('/api/admin/stats/overview')
  if (error) return <div className="pad err">{error}</div>
  if (!data) return <div className="pad muted">Загрузка…</div>
  const cards = [
    ['Учеников', data.students],
    ['Новых за 7 дней', data.new_week],
    ['Заходили за 7 дней', data.active_week],
    ['Заходили за сутки', data.active_day],
    ['Задач в банке', data.tasks],
    ['Решено задач (всего)', data.solved],
    ['Отправок ответа', data.attempts],
  ]
  return (
    <div className="pad">
      <div className="kpis">
        {cards.map(([t, v]) => (
          <div key={t} className="kpi">
            <div className="kpi__v">{v}</div>
            <div className="kpi__t">{t}</div>
          </div>
        ))}
      </div>
      <div className="panel-title">Активность за 30 дней</div>
      <table className="t t--auto">
        <thead>
          <tr>
            <th>День</th>
            <th>Учеников решали</th>
            <th>Отправок ответа</th>
            <th>Из них верных</th>
            <th>Доля верных</th>
          </tr>
        </thead>
        <tbody>
          {[...data.daily].reverse().map((d) => (
            <tr key={d.day}>
              <td className="nowrap">{fmtDate(d.day)}</td>
              <td className="num">{d.users || ''}</td>
              <td className="num">{d.attempts || ''}</td>
              <td className="num">{d.correct || ''}</td>
              <td className="num">{d.attempts ? pct(d.correct, d.attempts) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Статистика по каждой задаче — во вкладке «Банк задач» (колонки Нач., Реш.%, Ср.поп., Ср.подск.).</p>
    </div>
  )
}
