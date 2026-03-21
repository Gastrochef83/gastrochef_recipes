// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'        // Tailwind - موجود
import './styles/neo-header.css'  // أنماط الـ Header الجديدة - أضف هذا

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
