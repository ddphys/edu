import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles.css'
import App from './App.jsx'
import { api } from './api/index.js'
import { StoreProvider } from './store.jsx'

createRoot(document.getElementById('root')).render(
  <StoreProvider api={api}>
    <App />
  </StoreProvider>,
)
