import { describe, expect, it } from 'vitest'
import { IMAGE_NAME, imageMarkup, parseInline, parseText, textFormulas, textImages } from '../src/content/text.js'

describe('разметка текста', () => {
  it('формулы в строке и отдельной строкой', () => {
    expect(parseInline('Найдите $x$ и $$y = 2$$ сами')).toEqual([
      { type: 'text', value: 'Найдите ' },
      { type: 'math', value: 'x', display: false },
      { type: 'text', value: ' и ' },
      { type: 'math', value: 'y = 2', display: true },
      { type: 'text', value: ' сами' },
    ])
  })

  it('пустая строка — новый абзац', () => {
    const blocks = parseText('Первый\nвсё ещё первый\n\nВторой')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p'])
    expect(blocks[0].inline[0].value).toBe('Первый\nвсё ещё первый')
  })

  it('картинка с подписью и шириной', () => {
    expect(parseText('![Чертёж к задаче](scheme-1.png)')).toEqual([{ type: 'image', name: 'scheme-1.png', caption: 'Чертёж к задаче', width: null }])
    expect(parseText('![](a.svg|320)')).toEqual([{ type: 'image', name: 'a.svg', caption: '', width: 320 }])
  })

  it('картинка посреди абзаца делит его на части', () => {
    const blocks = parseText('До картинки ![Подпись $v_0$](a.png) после картинки')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'image', 'p'])
    expect(blocks[1]).toMatchObject({ name: 'a.png', caption: 'Подпись $v_0$' })
    expect(blocks[2].inline[0].value).toBe('после картинки')
  })

  it('пустой текст и не строка не ломают разбор', () => {
    expect(parseText('')).toEqual([])
    expect(parseText(undefined)).toEqual([])
    expect(parseText(null)).toEqual([])
  })

  it('список картинок и формул текста', () => {
    const text = 'Смотрите ![Рис. $a$](one.png) и ![](two.svg|100), где $b = 1$'
    expect(textImages(text)).toEqual(['one.png', 'two.svg'])
    expect(textFormulas(text).formulas.map((f) => f.src)).toEqual(['a', 'b = 1'])
    expect(textFormulas(text).strayDollar).toBe(false)
    expect(textFormulas('Цена 5$').strayDollar).toBe(true)
  })

  it('имя файла картинки: латиница и известное расширение', () => {
    for (const ok of ['a.png', 'scheme-1.JPG', 'graph_2.svg', 'x.webp', 'foto.jpeg']) expect(IMAGE_NAME.test(ok)).toBe(true)
    for (const bad of ['чертёж.png', 'a b.png', 'a.bmp', '.png', 'a', '../a.png']) expect(IMAGE_NAME.test(bad)).toBe(false)
  })

  it('разметка для вставки картинки читается обратно', () => {
    expect(parseText(imageMarkup('a.png', 'Подпись', 200))[0]).toEqual({ type: 'image', name: 'a.png', caption: 'Подпись', width: 200 })
    expect(imageMarkup('a.png')).toBe('![](a.png)')
  })
})
