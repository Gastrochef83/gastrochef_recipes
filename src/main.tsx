import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// ✅ Tailwind utilities (your app uses Tailwind classes heavily)
import './index.css'

// ✅ GastroChef theme
import './styles.css'

import { ModeProvider } from './lib/mode'
import ErrorBoundary from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ModeProvider>
        {/* ✅ Prevents "blank screen" by catching render-time crashes */}
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ModeProvider>
    </HashRouter>
  </React.StrictMode>
)
