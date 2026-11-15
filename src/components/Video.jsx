import { useEffect, useRef, useState } from 'react'
import MathText from './Math.jsx'
import { parseVideo } from '../lib.js'

// Видео встроено прямо в страницу урока. Поддерживаются YouTube, Rutube, Kinescope
// и прямая ссылка на видеофайл (mp4/webm). Если у урока есть вопросы (quiz),
// плеер в нужный момент ставится на паузу и поверх видео появляется вопрос.

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Скрипт стороннего плеера подключается один раз на всю страницу
const scripts = {}
function loadScript(src, readyName, getApi) {
  return (scripts[src] ??= new Promise((resolve, reject) => {
    if (getApi()) return resolve(getApi())
    const prev = window[readyName]
    window[readyName] = (arg) => {
      prev?.(arg)
      resolve(getApi(arg))
    }
    const el = document.createElement('script')
    el.src = src
    el.onerror = reject
    document.head.append(el)
  }))
}

const IFRAME_ALLOW = 'autoplay; picture-in-picture; encrypted-media; clipboard-write'

// Плеер одной из платформ. Сообщает текущее время через onTime(секунды), конец видео
// через onEnded() и кладёт в api.current функции play() и pause().
// withApi включается, когда у урока есть вопросы: тогда родная кнопка «на весь экран»
// у плеера отключается — вместо неё работает наша, с ней вопрос виден поверх видео.
function Player({ source, title, withApi, onTime, onEnded, api }) {
  const frame = useRef(null)
  const cb = useRef({})
  cb.current = { onTime, onEnded }

  useEffect(() => {
    if (!withApi || source.type === 'file') return
    let alive = true
    let stop = () => {}

    if (source.type === 'rutube') {
      // Rutube общается с плеером сообщениями postMessage в виде JSON-строк
      const send = (type) => frame.current?.contentWindow?.postMessage(JSON.stringify({ type, data: {} }), '*')
      const onMessage = (e) => {
        if (e.source !== frame.current?.contentWindow) return
        try {
          const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
          if (msg?.type === 'player:currentTime') {
            const t = msg.data?.time ?? msg.data?.currentTime
            if (typeof t === 'number') cb.current.onTime(t)
          }
          if (msg?.type === 'player:playComplete' || (msg?.type === 'player:changeState' && msg.data?.state === 'completed')) {
            cb.current.onEnded()
          }
        } catch {
          /* чужое сообщение — пропускаем */
        }
      }
      window.addEventListener('message', onMessage)
      api.current = { play: () => send('player:play'), pause: () => send('player:pause') }
      stop = () => window.removeEventListener('message', onMessage)
    }

    if (source.type === 'youtube') {
      loadScript('https://www.youtube.com/iframe_api', 'onYouTubeIframeAPIReady', () => window.YT?.Player && window.YT)
        .then((YT) => {
          if (!alive) return
          // Подключаемся к уже стоящему на странице iframe
          const player = new YT.Player(frame.current, {})
          let wasEnded = false
          const timer = setInterval(() => {
            const t = player.getCurrentTime?.()
            if (typeof t === 'number') cb.current.onTime(t)
            const ended = player.getPlayerState?.() === 0
            if (ended && !wasEnded) cb.current.onEnded()
            wasEnded = ended
          }, 300)
          api.current = { play: () => player.playVideo?.(), pause: () => player.pauseVideo?.() }
          stop = () => clearInterval(timer)
        })
        .catch(() => {})
    }

    if (source.type === 'kinescope') {
      loadScript(
        'https://player.kinescope.io/latest/iframe.player.js',
        'onKinescopeIframeAPIReady',
        (factory) => factory ?? window.Kinescope?.IframePlayer,
      )
        // Передаём id уже стоящего на странице iframe — API подключается к нему
        .then((factory) => alive && factory.create(frame.current.id, { url: source.embed }))
        .then((player) => {
          if (!alive || !player) return
          const timer = setInterval(() => {
            Promise.resolve(player.getCurrentTime?.())
              .then((t) => typeof t === 'number' && cb.current.onTime(t))
              .catch(() => {})
          }, 300)
          if (player.Events?.Ended) player.on?.(player.Events.Ended, () => cb.current.onEnded())
          api.current = { play: () => player.play(), pause: () => player.pause() }
          stop = () => clearInterval(timer)
        })
        .catch(() => {})
    }

    return () => {
      alive = false
      stop()
      api.current = null
    }
  }, [source.type, source.id, source.embed, withApi, api])

  if (source.type === 'file') {
    return (
      <video
        ref={(el) => {
          api.current = el && {
            play: () => el.play().catch(() => {}),
            pause: () => el.pause(),
            // На айфоне видео может развернуться средствами системы — страница этого не видит иначе
            inNativeFullscreen: () => Boolean(el.webkitDisplayingFullscreen),
          }
        }}
        src={source.src}
        controls
        controlsList={withApi ? 'nofullscreen' : undefined}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onEnded={onEnded}
      />
    )
  }

  let src = source.embed
  if (source.type === 'youtube' && withApi) {
    src += `&fs=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
  }
  return (
    <iframe
      ref={frame}
      id={`player-${source.type}-${source.id}`}
      src={src}
      title={title}
      allow={withApi ? IFRAME_ALLOW : `${IFRAME_ALLOW}; fullscreen`}
      allowFullScreen={!withApi}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

function Quiz({ quiz, head, saved, onAnswer, onSkip, onContinue, continueLabel }) {
  const answered = saved?.choice != null
  return (
    <div className="quiz">
      <div className="quiz__head">{head}</div>
      <MathText text={quiz.question} className="quiz__question" />
      <div className="quiz__options">
        {quiz.options.map((o, i) => {
          let cls = ''
          if (answered && i === quiz.correct) cls = 'is-right'
          else if (answered && i === saved.choice) cls = 'is-wrong'
          return (
            <button key={i} className={`quiz__option ${cls}`} disabled={answered} onClick={() => onAnswer(i)}>
              <MathText text={o} />
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={`quiz__result ${saved.ok ? 'is-ok' : 'is-bad'}`}>
          <b>{saved.ok ? 'Верно!' : 'Неверно — правильный ответ выделен зелёным.'}</b>
          {quiz.explain && <MathText text={quiz.explain} />}
        </div>
      )}
      <div className="quiz__actions">
        {answered ? (
          <button className="btn btn--primary" onClick={onContinue}>
            {continueLabel}
          </button>
        ) : (
          <button className="link-btn" onClick={onSkip}>
            Пропустить вопрос
          </button>
        )}
      </div>
    </div>
  )
}

const FullscreenIcon = ({ exit }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {exit ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
)

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement

export default function Video({ url, title, vertical = false, quiz = [], quizState = {}, onQuizAnswer }) {
  const source = parseVideo(url)
  const api = useRef(null)
  const box = useRef(null)
  const skipped = useRef(new Set())
  const endedAt = useRef(0)
  // Вопрос по ходу видео: номер вопроса или null
  const [active, setActive] = useState(null)
  // Повтор в конце видео: { queue: номера вопросов, pos, fresh: ответил ли уже в этом повторе, right }
  const [review, setReview] = useState(null)
  // Наш полноэкранный режим: 'native' — средствами браузера, 'css' — растянутый блок (айфон)
  const [fs, setFs] = useState(null)

  useEffect(() => {
    const sync = () => setFs((v) => (fullscreenElement() === box.current ? 'native' : v === 'native' ? null : v))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  // В растянутом режиме страница под видео не должна прокручиваться
  useEffect(() => {
    if (fs !== 'css') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && setFs(null)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fs])

  if (!source) {
    return (
      <div className="video video--empty">
        <div>
          <strong>Запись занятия пока не добавлена</strong>
          <p>
            Вставьте ссылку на YouTube, Rutube, Kinescope или mp4-файл в поле <code>videoUrl</code> этого
            урока в файле <code>src/data/course.js</code>
          </p>
        </div>
      </div>
    )
  }

  const hasQuiz = quiz.length > 0
  const isAnswered = (i) => quizState[i]?.choice != null
  const answeredCount = quiz.filter((_, i) => isAnswered(i)).length
  const rightCount = quiz.filter((_, i) => quizState[i]?.ok).length

  // Плеер развёрнут не нашей кнопкой — показать вопрос поверх него нельзя
  const foreignFullscreen = () => {
    const el = fullscreenElement()
    return Boolean((el && el !== box.current) || api.current?.inNativeFullscreen?.())
  }

  async function toggleFullscreen() {
    const el = box.current
    if (fs === 'css') return setFs(null)
    if (fs === 'native') return (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    try {
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el)
      setFs('native')
      // На телефоне сразу поворачиваем в альбомную ориентацию, где это разрешено
      if (!vertical) screen.orientation?.lock?.('landscape').catch(() => {})
    } catch {
      // Браузер не умеет разворачивать блок (айфон) — растягиваем его на всё окно
      setFs('css')
    }
  }

  function onTime(t) {
    if (active !== null || review) return
    // Перемотали назад — пропущенный вопрос появится снова
    for (const i of skipped.current) if (t < quiz[i].time - 1) skipped.current.delete(i)
    const i = quiz.findIndex((q, k) => t >= q.time && t < q.time + 2 && !isAnswered(k) && !skipped.current.has(k))
    if (i === -1) return
    // Из чужого полноэкранного режима не выбиваем: вопрос уйдёт в повтор в конце видео
    if (foreignFullscreen()) return skipped.current.add(i)
    api.current?.pause()
    setActive(i)
  }

  // Видео закончилось — ещё раз задаём вопросы с ошибкой и пропущенные.
  // Каждый вопрос повторяется в конце только один раз.
  function onEnded() {
    if (!hasQuiz || review || Date.now() - endedAt.current < 2000) return
    endedAt.current = Date.now()
    const queue = quiz.map((_, i) => i).filter((i) => !isAnswered(i) || (!quizState[i].ok && !quizState[i].retried))
    if (queue.length === 0) return
    setActive(null)
    setReview({ queue, pos: 0, fresh: false, right: 0 })
  }

  function closeActive() {
    skipped.current.add(active)
    setActive(null)
    api.current?.play()
  }

  const reviewNext = () => setReview((r) => ({ ...r, pos: r.pos + 1, fresh: false }))

  let overlay = null
  if (active !== null) {
    overlay = (
      <Quiz
        quiz={quiz[active]}
        head={`Вопрос ${active + 1} из ${quiz.length} · ${fmtTime(quiz[active].time)}`}
        saved={quizState[active]}
        onAnswer={(choice) => onQuizAnswer(active, { choice, ok: choice === quiz[active].correct })}
        onSkip={closeActive}
        onContinue={closeActive}
        continueLabel="Продолжить просмотр"
      />
    )
  } else if (review && review.pos < review.queue.length) {
    const i = review.queue[review.pos]
    const last = review.pos === review.queue.length - 1
    overlay = (
      <Quiz
        key={i}
        quiz={quiz[i]}
        head={`Повторим · вопрос ${review.pos + 1} из ${review.queue.length}`}
        saved={review.fresh ? quizState[i] : null}
        onAnswer={(choice) => {
          const ok = choice === quiz[i].correct
          onQuizAnswer(i, { choice, ok, retried: true })
          setReview((r) => ({ ...r, fresh: true, right: r.right + (ok ? 1 : 0) }))
        }}
        onSkip={reviewNext}
        onContinue={reviewNext}
        continueLabel={last ? 'Готово' : 'Следующий вопрос'}
      />
    )
  } else if (review) {
    overlay = (
      <div className="quiz">
        <div className="quiz__head">Вопросы по видео</div>
        <div className="quiz__question">
          Верных ответов: {rightCount} из {quiz.length}
        </div>
        <div className="quiz__actions">
          <button className="btn btn--primary" onClick={() => setReview(null)}>
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={box} className={`video ${vertical ? 'video--vertical' : ''} ${fs ? 'is-fs' : ''}`}>
      <div className="video__stage">
        <div className="video__frame">
          <Player source={source} title={title} withApi={hasQuiz} onTime={onTime} onEnded={onEnded} api={api} />
        </div>
        {overlay && <div className="video__quiz">{overlay}</div>}
      </div>
      {hasQuiz && (
        <div className="video__bar">
          <span>
            Отвечено вопросов: {answeredCount} из {quiz.length}
          </span>
          <button onClick={toggleFullscreen}>
            <FullscreenIcon exit={Boolean(fs)} />
            {fs ? 'Свернуть' : 'На весь экран'}
          </button>
        </div>
      )}
    </div>
  )
}
