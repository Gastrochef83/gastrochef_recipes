import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

import './index.css'
import './styles.css'

import { ModeProvider } from './lib/mode'
import { AutosaveProvider } from './contexts/AutosaveContext'
import ErrorBoundary from './components/ErrorBoundary'

function removePreloadSplash() {
  const el = document.getElementById('gc-preload')
  if (!el) return
  // remove after first paint to avoid white flash
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.remove())
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <ModeProvider>
      <ErrorBoundary>
        <AutosaveProvider>
          <App />
        </AutosaveProvider>
      </ErrorBoundary>
    </ModeProvider>
  </HashRouter>
)

removePreloadSplash()
