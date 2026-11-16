// Единственное место, через которое страница получает контент, хранит прогресс и проверяет ответы.
// Компоненты не знают, что стоит за этими методами: сейчас это localStorage и проверка в браузере
// (local.js), позже — запросы к серверу. Чтобы перейти на сервер, нужно написать вторую
// реализацию с теми же методами и подставить её здесь; компоненты менять не придётся.
//
// Все методы асинхронные.
//
//   getContent()  → { site, courses }   открытая часть контента (без ответов и разборов)
//   getViewer()   → { features: { attachSolution } }   что доступно ученику (позже — по тарифу)
//   getProgress() → { version, courses: { [id курса]: { tasks: { [id]: состояние }, quiz } } }
//
//   getRevealed(courseId, taskIds) → { [id задачи]: revealed }
//       revealed = { hints: [открытые подсказки], solution, answer } — то, что ученику
//       уже можно видеть: подсказки, которые он взял; после завершения — разбор и верный ответ
//
//   takeHint(courseId, taskId)             → { kind: 'hint' | 'noop', state, revealed }
//   submitAnswer(courseId, taskId, input)  → { kind, state, revealed, message?, note?, xpLost? }
//       kind: 'correct' | 'wrong' | 'invalid' (ввод не разобран, XP не снимается) | 'locked' | 'noop'
//   skipTask(courseId, taskId)             → { kind: 'skipped' | 'noop', state, revealed }
//
//   answerQuiz(courseId, lessonId, index, choice, { retry }) → { saved, correct, explain }
//   skipQuizRetry(courseId, lessonId, index)                 → { saved }
//   resetProgress(courseId?)                                 → прогресс после сброса
//
//   imageUrl(courseId, name) → адрес картинки курса (синхронно)
//
//   listAttachments(courseId, taskId)       → [{ id, name, url, size }]   фото решений ученика
//   addAttachment(courseId, taskId, file)   → обновлённый список
//   removeAttachment(courseId, taskId, id)  → обновлённый список
import { httpSource } from '../content/load.js'
import { idbFiles } from './files.js'
import { createLocalApi } from './local.js'
import { browserKv } from './progress.js'

export const api = createLocalApi({ source: httpSource, kv: browserKv, files: idbFiles() })
