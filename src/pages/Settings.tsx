import React from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import Button from '../components/ui/Button'

export default function Settings() {
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }} data-theme={theme}>
      <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>Settings</h1>
      <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>App preferences</p>

      <div style={{ marginTop: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Theme</div>
            <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{theme === 'light' ? 'Light' : 'Dark'}</div>
          </div>
          <Button variant="secondary" onClick={toggleTheme}>Toggle Theme</Button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Account</div>
          <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>{user?.email || '—'}</div>
        </div>
      </div>
    </div>
  )
}
