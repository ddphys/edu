import katex from 'katex'

// Рендерит текст с формулами: $...$ — в строке, $$...$$ — отдельным блоком.
// Пустая строка между абзацами = новый абзац.
function renderInline(text) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g)
  return parts
    .map((p) => {
      if (p.startsWith('$$')) {
        return katex.renderToString(p.slice(2, -2), { displayMode: true, throwOnError: false })
      }
      if (p.startsWith('$')) {
        return katex.renderToString(p.slice(1, -1), { throwOnError: false })
      }
      return p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    })
    .join('')
}

export default function MathText({ text, className = '' }) {
  const paragraphs = text.split(/\n\s*\n/)
  return (
    <div className={`math ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p.trim()) }} />
      ))}
    </div>
  )
}
