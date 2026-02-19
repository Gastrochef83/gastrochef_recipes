import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

/**
 * ✅ IMPORTANT
 * 1) index.css = Tailwind (your pages depend on it)
 * 2) styles.css = GastroChef Premium Shell (layout/theme)
 */
import './index.css'
import './styles.css'

import { ModeProvider } from './lib/mode'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModeProvider>
      <App />
    </ModeProvider>
  </React.StrictMode>
)
