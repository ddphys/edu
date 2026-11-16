import { chooseTheme, useTheme } from '../theme.js'

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

// Кнопка в шапке: переключает светлую и тёмную тему. На кнопке — тема, которая включится.
export default function ThemeToggle() {
  const dark = useTheme() === 'dark'
  const label = dark ? 'Светлая тема' : 'Тёмная тема'
  return (
    <button type="button" className="theme-btn" title={label} aria-label={label} onClick={() => chooseTheme(dark ? 'light' : 'dark')}>
      {dark ? (
        <svg {...icon}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg {...icon}>
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      )}
    </button>
  )
}
