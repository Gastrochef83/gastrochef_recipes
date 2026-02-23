import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

export default function Settings() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="gc-page" data-theme={theme}>
      <h1>Settings</h1>
      <button className="gc-btn gc-btn--secondary" onClick={toggleTheme} type="button">
        Toggle Theme
      </button>
    </div>
  )
}
