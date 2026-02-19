import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// ✅ Tailwind utilities (your components already use Tailwind classes like text-neutral-600)
import './index.css'

// ✅ GastroChef premium theme (gc-* classes)
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
