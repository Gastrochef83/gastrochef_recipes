import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// ✅ Tailwind utilities (your app uses Tailwind classes heavily)
import './index.css'

// ✅ GastroChef theme
import './styles.css'

import { ModeProvider } from './lib/mode'
import { AutosaveProvider } from './contexts/AutosaveContext'
import ErrorBoundary from './components/ErrorBoundary'

/**
 * ✅ FINAL GOD — render stability
 * Notes:
 * - We intentionally DO NOT wrap with React.StrictMode here
 *   to avoid double-mount/double-fetch issues in dev that can look like freezes.
 * - Production build is unchanged, but this makes local + preview behavior stable.
 */

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
