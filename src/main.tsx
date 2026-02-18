import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// ✅ Mode Provider
import { ModeProvider } from './lib/mode'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModeProvider>
      <App />
    </ModeProvider>
  </React.StrictMode>
)
