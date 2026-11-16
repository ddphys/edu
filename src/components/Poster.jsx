// Плакатная шапка страницы курса и урока: цветной блок с крупным заголовком.
// Устроена как ячейка таблицы Менделеева: мелкая надпись, огромное название, под ним — строки данных.
//   back  — { href, text } ссылка назад (в предпросмотре её нет)
//   label — мелкая надпись над заголовком («Урок 1»)
//   mark  — крупный знак на фоне (номер урока)
//   facts — числа под заголовком: [{ value, label }]
// Остальное содержимое (описание, преподаватель) передаётся внутрь.
export default function Poster({ back, label, mark, title, facts = [], className = '', children }) {
  const long = String(title ?? '').length > 34
  return (
    <header className={`poster ${className}`}>
      {mark != null && (
        <span className="poster__mark" aria-hidden="true">
          {mark}
        </span>
      )}
      {back && (
        <a className="poster__back" href={back.href}>
          ← {back.text}
        </a>
      )}
      {label && <div className="poster__label">{label}</div>}
      <h1 className={`poster__title ${long ? 'poster__title--long' : ''}`}>{title}</h1>
      {children}
      {facts.length > 0 && (
        <dl className="poster__facts">
          {facts.map((f) => (
            <div key={f.label} className="poster__fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  )
}
