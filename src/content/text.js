// Разметка текста условий, подсказок, разборов и вариантов ответа:
//   $...$ — формула в строке, $$...$$ — формула отдельной строкой (LaTeX);
//   **жирный**;
//   пустая строка — новый абзац, обычный перенос строки — перенос строки;
//   ![Подпись](файл.png) — картинка с подписью; ![Подпись](файл.png|320) — с шириной в пикселях.
// Здесь только разбор текста на части. Рисует их компонент components/Math.jsx,
// а проверка контента по этим же частям ищет битые формулы и картинки.

const IMAGE = /!\[([^\]\n]*)\]\(([^)\s|]+)(?:\|(\d+))?\)/g
const MATH = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g

// Имя файла картинки: латиница, цифры, точка, дефис, подчёркивание
export const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|gif|webp|svg)$/i

// Строка → куски: обычный текст и формулы
export function parseInline(text) {
  return String(text ?? '')
    .split(MATH)
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith('$$') && p.length > 4) return { type: 'math', value: p.slice(2, -2), display: true }
      if (p.startsWith('$') && p.endsWith('$') && p.length > 2) return { type: 'math', value: p.slice(1, -1), display: false }
      return { type: 'text', value: p }
    })
}

// Текст → блоки: абзацы { type: 'p', inline } и картинки { type: 'image', name, caption, width }
export function parseText(text) {
  const blocks = []
  const pushText = (s) => {
    const t = s.trim()
    if (t) blocks.push({ type: 'p', inline: parseInline(t) })
  }
  for (const para of String(text ?? '').split(/\n\s*\n/)) {
    let last = 0
    for (const m of para.matchAll(IMAGE)) {
      pushText(para.slice(last, m.index))
      blocks.push({ type: 'image', name: m[2], caption: m[1].trim(), width: m[3] ? Number(m[3]) : null })
      last = m.index + m[0].length
    }
    pushText(para.slice(last))
  }
  return blocks
}

// Имена всех картинок, на которые ссылается текст
export const textImages = (text) => parseText(text).filter((b) => b.type === 'image').map((b) => b.name)

// Все формулы текста (включая подписи к картинкам) и «хвосты» с непарным знаком $
export function textFormulas(text) {
  const formulas = []
  let strayDollar = false
  const scan = (inline) => {
    for (const part of inline) {
      if (part.type === 'math') formulas.push({ src: part.value, display: part.display })
      else if (part.value.includes('$')) strayDollar = true
    }
  }
  for (const b of parseText(text)) scan(b.type === 'p' ? b.inline : parseInline(b.caption))
  return { formulas, strayDollar }
}

// Разметка для вставки картинки в текст
export const imageMarkup = (name, caption = '', width) => `![${caption}](${name}${width ? `|${width}` : ''})`
