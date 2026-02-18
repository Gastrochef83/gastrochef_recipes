import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ✅ keep your styles
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ✅ IMPORTANT: do NOT wrap router here.
        App.tsx already contains HashRouter in your project. */}
    <App />
  </React.StrictMode>
)
