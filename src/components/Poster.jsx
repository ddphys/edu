// Плакатная шапка каталога, курса и урока: цветной блок с крупным заголовком.
// Устроена как ячейка таблицы Менделеева: мелкая надпись, огромное название, под ним — строки данных.
// На телефоне от плаката остаётся узкая цветная полоса с названием (poster__head); описание и
// преподаватель встают под ней на белом, а список тем, числа и обложка не показываются.
//   back  — { href, text } ссылка назад (в предпросмотре её нет)
//   label — мелкая надпись в верхней строке («Урок 1»)
//   mark  — крупный знак на фоне (номер урока)
//   facts — числа под заголовком: [{ value, label }]
//   aside — картинка справа от текста (обложка курса)
//   done  — всё решено: шапка зелёная, на фоне галочка
// Остальное содержимое (описание, преподаватель) передаётся внутрь.
export default function Poster({ back, label, mark, title, facts = [], aside, done = false, className = '', children }) {
  const long = String(title ?? '').length > 34
  return (
    <header className={`poster ${done ? 'poster--done' : ''} ${className}`}>
      {done ? (
        <svg className="poster__mark poster__mark--check" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path d="M6 52 36 82 94 20" fill="none" stroke="currentColor" strokeWidth="19" />
        </svg>
      ) : (
        mark != null && (
          <span className="poster__mark" aria-hidden="true">
            {mark}
          </span>
        )
      )}
      <div className="poster__head">
        {(back || label) && (
          <div className="poster__top">
            {back && (
              <a className="poster__back" href={back.href}>
                ← {back.text}
              </a>
            )}
            {label && <span className="poster__label">{label}</span>}
          </div>
        )}
        <h1 className={`poster__title ${long ? 'poster__title--long' : ''}`}>{title}</h1>
      </div>
      <div className={`poster__body ${aside ? 'poster__body--aside' : ''}`}>
        <div className="poster__main">
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
        </div>
        {aside && <div className="poster__aside">{aside}</div>}
      </div>
    </header>
  )
}
