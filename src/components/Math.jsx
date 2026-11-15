import katex from 'katex'

// Рендерит текст с формулами и картинками:
//   $...$ — формула в строке, $$...$$ — отдельной строкой,
//   **жирный**, ![подпись](/uploads/файл.png) — картинка.
// Пустая строка между абзацами = новый абзац.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Картинки — только загруженные на сайт или по https
const safeUrl = (u) => /^(\/uploads\/[\w.-]+|https:\/\/[^\s"'<>]+)$/.test(u)

function renderPlain(p) {
  return esc(p)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
      safeUrl(src) ? `<img class="math__img" src="${src}" alt="${alt}" loading="lazy"/>` : m,
    )
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br/>')
}

export function renderInline(text) {
  return text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g)
    .map((p) => {
      if (p.startsWith('$$') && p.length > 4) return katex.renderToString(p.slice(2, -2), { displayMode: true, throwOnError: false })
      if (p.startsWith('$') && p.length > 2) return katex.renderToString(p.slice(1, -1), { throwOnError: false })
      return renderPlain(p)
    })
    .join('')
}

export default function MathText({ text = '', className = '', inline = false }) {
  if (inline) return <span className={`math ${className}`} dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
  const paragraphs = text.split(/\n\s*\n/)
  return (
    <div className={`math ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p.trim()) }} />
      ))}
    </div>
  )
}
