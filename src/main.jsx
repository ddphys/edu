import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
// Шрифт заголовков лежит в сборке сайта: с чужих серверов ничего не грузится
import '@fontsource-variable/unbounded/wght.css'
import './styles.css'
import App from './App.jsx'
import { api } from './api/index.js'
import { StoreProvider } from './store.jsx'

createRoot(document.getElementById('root')).render(
  <StoreProvider api={api}>
    <App />
  </StoreProvider>,
)
