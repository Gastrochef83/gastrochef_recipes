import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ✅ CRITICAL — styles must be imported here
import './styles.css'

import { ModeProvider } from './lib/mode'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModeProvider>
      <App />
    </ModeProvider>
  </React.StrictMode>
)
