import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ✅ IMPORTANT: keep one global stylesheet
import './styles.css'

import { ModeProvider } from './lib/mode'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModeProvider>
      <App />
    </ModeProvider>
  </React.StrictMode>
)
