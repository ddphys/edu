// Уровень 1. Горизонтальный стол: опора неподвижна, тело — брусок.
// Ситуации и ответы — из docs/trainer-friction-tasks.md (ключ), менять их нельзя.
//
// Ситуация записана «в прямом виде», как в ключе: направления — для рисунка без зеркала.
//   text(h), why(h), motion(h) — тексты; h.right / h.left — слова «вправо» / «влево»,
//     в зеркальном варианте они меняются местами (см. instance.js);
//   figure — что нарисовать (см. draw/geometry.js);
//   type — rest | slide | none | unknown;  dir — left | right (для none и unknown нет).
//   why — фраза «Почему» из ключа, motion — шаг 3 разбора («куда поехало бы тело» / «куда едет»).
const base = { level: 1, surface: 'table', body: 'брусок', support: 'стола' }

const F = (sub, suffix) => ({ main: 'F', sub, suffix })

export const level1 = [
  {
    ...base,
    id: '1.1',
    text: () => 'Брусок лежит на столе. Горизонтальных сил нет.',
    figure: { arrows: [] },
    type: 'none',
    why: () => 'Ничто не тянет брусок вдоль стола — ему некуда скользить.',
    motion: () => 'Вдоль стола ничто не тянет брусок.',
    trap: 'трение есть всегда',
  },
  {
    ...base,
    id: '1.2',
    text: (h) => `Брусок толкают ${h.right}, но он не сдвигается.`,
    figure: { arrows: [{ kind: 'F', dir: 'right', mode: 'push', label: F() }] },
    type: 'rest',
    dir: 'left',
    why: (h) => `Без трения брусок поехал бы ${h.right}. Трение покоя мешает этому.`,
    motion: (h) => `Без трения брусок поехал бы ${h.right}.`,
  },
  {
    ...base,
    id: '1.3',
    text: (h) => `Брусок тянут за нить ${h.right}-вверх под углом. Брусок покоится.`,
    figure: { arrows: [{ kind: 'thread', dir: 'right', angle: 30, label: F() }] },
    type: 'rest',
    dir: 'left',
    why: (h) => `Горизонтальная часть силы тянет брусок ${h.right}, трение покоя — против.`,
    motion: (h) => `Горизонтальная часть силы тянет брусок ${h.right}: без трения он поехал бы ${h.right}.`,
  },
  {
    ...base,
    id: '1.4',
    text: (h) => `Брусок толкнули ${h.right} и отпустили. Он скользит по столу.`,
    figure: { arrows: [{ kind: 'v', dir: 'right', label: { main: 'v' } }] },
    type: 'slide',
    dir: 'left',
    why: (h) => `Брусок скользит ${h.right} относительно стола — трение против скорости.`,
    motion: (h) => `Относительно стола брусок едет ${h.right}.`,
    trap: 'нет силы — нет трения',
  },
  {
    ...base,
    id: '1.5',
    text: (h) => `Брусок тянут ${h.right}, он равномерно скользит ${h.right}.`,
    figure: {
      arrows: [
        { kind: 'F', dir: 'right', mode: 'pull', label: F() },
        { kind: 'v', dir: 'right', label: { main: 'v' } },
      ],
    },
    type: 'slide',
    dir: 'left',
    why: () => 'Трение скольжения направлено против скорости бруска относительно стола.',
    motion: (h) => `Относительно стола брусок едет ${h.right}.`,
  },
  {
    ...base,
    id: '1.6',
    text: (h) => `Брусок скользит ${h.right}. Его тянут ${h.left}, он замедляется.`,
    figure: {
      arrows: [
        { kind: 'v', dir: 'right', label: { main: 'v' } },
        { kind: 'F', dir: 'left', mode: 'pull', label: F() },
      ],
    },
    type: 'slide',
    dir: 'left',
    why: () => 'Трение против скорости, а не против силы. Здесь оно совпадает с F.',
    motion: (h) => `Относительно стола брусок едет ${h.right}.`,
    trap: 'трение против силы',
  },
  {
    ...base,
    id: '1.7',
    text: (h) => `Брусок скользит ${h.left}. Его тянут ${h.right}, он замедляется.`,
    figure: {
      arrows: [
        { kind: 'v', dir: 'left', label: { main: 'v' } },
        { kind: 'F', dir: 'right', mode: 'pull', label: F() },
      ],
    },
    type: 'slide',
    dir: 'right',
    why: (h) => `Брусок едет ${h.left} — трение ${h.right}. На силу F не смотрим.`,
    motion: (h) => `Относительно стола брусок едет ${h.left}.`,
    trap: 'трение против силы',
  },
  {
    ...base,
    id: '1.8',
    text: (h) => `Брусок тянут в разные стороны: ${h.right} с силой 5 Н, ${h.left} — 3 Н. Брусок покоится.`,
    figure: {
      arrows: [
        { kind: 'F', dir: 'right', mode: 'pull', len: 80, label: F('1', ' = 5 Н') },
        { kind: 'F', dir: 'left', mode: 'pull', len: 48, label: F('2', ' = 3 Н') },
      ],
    },
    type: 'rest',
    dir: 'left',
    why: (h) => `Вместе силы тянут ${h.right} (5 > 3). Трение покоя — ${h.left}.`,
    motion: (h) => `Силы вместе тянут ${h.right} (5 − 3 = 2 Н): без трения брусок поехал бы ${h.right}.`,
  },
  {
    ...base,
    id: '1.9',
    text: () => 'Брусок тянут в разные стороны с силами по 4 Н. Брусок покоится.',
    figure: {
      arrows: [
        { kind: 'F', dir: 'right', mode: 'pull', len: 60, label: F('1', ' = 4 Н') },
        { kind: 'F', dir: 'left', mode: 'pull', len: 60, label: F('2', ' = 4 Н') },
      ],
    },
    type: 'none',
    why: () => 'Силы уравновешены, брусок никуда не тянет — трение не нужно.',
    motion: () => 'Силы равны и направлены в разные стороны: вдоль стола они уравновешены.',
    trap: 'трение есть всегда',
  },
  {
    ...base,
    id: '1.10',
    text: () => 'Брусок тянут в разные стороны силами $F_1$ и $F_2$. Брусок покоится. Какая сила больше — неизвестно.',
    // Длины стрелок неизвестны, поэтому они пунктиром: по рисунку «больше / равны» не угадать
    figure: {
      arrows: [
        { kind: 'F', dir: 'right', mode: 'pull', len: 60, dash: true, label: F('1') },
        { kind: 'F', dir: 'left', mode: 'pull', len: 60, dash: true, label: F('2') },
      ],
    },
    type: 'unknown',
    why: () => 'Куда тянет сильнее — неизвестно, значит, и куда трение — тоже.',
    motion: () => 'Какая из сил $F_1$ и $F_2$ больше, неизвестно.',
    trap: 'учит вариант «?»',
  },
]
