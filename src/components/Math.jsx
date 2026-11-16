import { createContext, useContext } from 'react'
import katex from 'katex'
import { parseInline, parseText } from '../content/text.js'

// Рендерит текст с разметкой (она описана в content/text.js):
// формулы $...$ и $$...$$, **жирный**, абзацы и картинки с подписью ![Подпись](файл.png).

// Откуда брать картинки: функция (имя файла) → { src, w, h } или null, если такой картинки нет.
// На странице курса это картинки курса, в редакторе — картинки из черновика.
export const ImagesContext = createContext(() => null)

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderInline(inline) {
  return inline
    .map((part) =>
      part.type === 'math'
        ? katex.renderToString(part.value, { displayMode: part.display, throwOnError: false })
        : escapeHtml(part.value).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>'),
    )
    .join('')
}

// Картинка с подписью. Размер известен заранее (он записан в курсе), поэтому место под картинку
// занято ещё до загрузки и страница не дёргается; шире своего блока картинка не становится.
function Figure({ block, eager }) {
  const info = useContext(ImagesContext)(block.name)
  if (!info) return <div className="figure figure--missing">Картинка «{block.name}» не найдена</div>
  const width = block.width ?? Math.min(info.w, 640)
  return (
    <figure className="figure" style={{ '--fig-w': `${width}px` }}>
      <img src={info.src} width={info.w} height={info.h} alt={block.caption.replace(/\$/g, '')} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      {block.caption && <figcaption dangerouslySetInnerHTML={{ __html: renderInline(parseInline(block.caption)) }} />}
    </figure>
  )
}

// eager — грузить картинки сразу, а не когда до них долистают (нужно листу для печати)
export default function MathText({ text, className = '', eager = false }) {
  return (
    <div className={`math ${className}`}>
      {parseText(text).map((block, i) =>
        block.type === 'image' ? (
          <Figure key={i} block={block} eager={eager} />
        ) : (
          <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(block.inline) }} />
        ),
      )}
    </div>
  )
}
