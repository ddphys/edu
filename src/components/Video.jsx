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

const IFRAME_ALLOW = 'autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write'

// Плеер одной из платформ. Сообщает текущее время через onTime(секунды)
// и кладёт в api.current функции play() и pause().
function Player({ source, title, withApi, onTime, api }) {
  const frame = useRef(null)
  const host = useRef(null)
  const timeCb = useRef(onTime)
  timeCb.current = onTime

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
          if (msg?.type !== 'player:currentTime') return
          const t = msg.data?.time ?? msg.data?.currentTime
          if (typeof t === 'number') timeCb.current(t)
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
          const timer = setInterval(() => {
            const t = player.getCurrentTime?.()
            if (typeof t === 'number') timeCb.current(t)
          }, 300)
          api.current = { play: () => player.playVideo?.(), pause: () => player.pauseVideo?.() }
          stop = () => clearInterval(timer)
        })
        .catch(() => {})
    }

    if (source.type === 'kinescope') {
      const el = document.createElement('div')
      el.id = `kinescope-${source.id}`
      host.current.append(el)
      loadScript(
        'https://player.kinescope.io/latest/iframe.player.js',
        'onKinescopeIframeAPIReady',
        (factory) => factory ?? window.Kinescope?.IframePlayer,
      )
        .then((factory) => factory.create(el.id, { url: source.embed, size: { width: '100%', height: '100%' } }))
        .then((player) => {
          if (!alive) return player.destroy?.()
          const timer = setInterval(() => {
            Promise.resolve(player.getCurrentTime?.())
              .then((t) => typeof t === 'number' && timeCb.current(t))
              .catch(() => {})
          }, 300)
          api.current = { play: () => player.play(), pause: () => player.pause() }
          stop = () => {
            clearInterval(timer)
            player.destroy?.()
          }
        })
        .catch(() => {})
      const hostEl = host.current
      return () => {
        alive = false
        stop()
        api.current = null
        hostEl.replaceChildren()
      }
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
          api.current = el && { play: () => el.play().catch(() => {}), pause: () => el.pause() }
        }}
        src={source.src}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
      />
    )
  }

  // Kinescope с вопросами создаёт свой iframe сам — ему нужен пустой контейнер
  if (source.type === 'kinescope' && withApi) return <div className="video__host" ref={host} />

  let src = source.embed
  if (source.type === 'youtube' && withApi) {
    src += `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
  }
  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      allow={IFRAME_ALLOW}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

function Quiz({ quiz, number, total, saved, onAnswer, onSkip, onContinue }) {
  const answered = saved?.choice != null
  return (
    <div className="video__quiz">
      <div className="quiz">
        <div className="quiz__head">
          Вопрос {number} из {total} · {fmtTime(quiz.time)}
        </div>
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
            <b>{saved.ok ? 'Верно!' : 'Неверно.'}</b>
            {quiz.explain && <MathText text={quiz.explain} />}
          </div>
        )}
        <div className="quiz__actions">
          {answered ? (
            <button className="btn btn--primary" onClick={onContinue}>
              Продолжить просмотр
            </button>
          ) : (
            <button className="link-btn" onClick={onSkip}>
              Пропустить вопрос
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Video({ url, title, vertical = false, quiz = [], quizState = {}, onQuizAnswer }) {
  const source = parseVideo(url)
  const api = useRef(null)
  const skipped = useRef(new Set())
  const [active, setActive] = useState(null)

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

  const answeredCount = quiz.filter((_, i) => quizState[i]?.choice != null).length

  function onTime(t) {
    if (active !== null) return
    // Перемотали назад — пропущенный вопрос появится снова
    for (const i of skipped.current) if (t < quiz[i].time - 1) skipped.current.delete(i)
    const i = quiz.findIndex(
      (q, k) => t >= q.time && t < q.time + 2 && quizState[k]?.choice == null && !skipped.current.has(k),
    )
    if (i === -1) return
    api.current?.pause()
    // Вопрос рисуется на странице, поэтому из полноэкранного режима нужно выйти
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setActive(i)
  }

  function close() {
    skipped.current.add(active)
    setActive(null)
    api.current?.play()
  }

  return (
    <>
      <div className={`video ${vertical ? 'video--vertical' : ''}`}>
        <div className="video__frame">
          <Player source={source} title={title} withApi={quiz.length > 0} onTime={onTime} api={api} />
        </div>
        {active !== null && (
          <Quiz
            quiz={quiz[active]}
            number={active + 1}
            total={quiz.length}
            saved={quizState[active]}
            onAnswer={(choice) => onQuizAnswer(active, { choice, ok: choice === quiz[active].correct })}
            onSkip={close}
            onContinue={close}
          />
        )}
      </div>
      {quiz.length > 0 && (
        <div className="video__note">
          По ходу видео появятся вопросы: {quiz.map((q) => fmtTime(q.time)).join(', ')}. Отвечено {answeredCount} из{' '}
          {quiz.length}.
        </div>
      )}
    </>
  )
}
