import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

// ✅ Tailwind utilities (your app uses Tailwind classes heavily)
import './index.css'

// ✅ GastroChef theme
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
