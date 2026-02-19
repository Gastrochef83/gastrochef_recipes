import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// ✅ Tailwind entry (fixes “HTML-looking” pages)
import './index.css'

// ✅ Your custom UI theme
import './styles.css'

import { ModeProvider } from './lib/mode'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ModeProvider>
        <App />
      </ModeProvider>
    </HashRouter>
  </React.StrictMode>
)
