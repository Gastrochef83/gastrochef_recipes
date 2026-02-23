import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function Login() {
  const nav = useNavigate()
  const { signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      nav('/dashboard')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gc-page" data-theme={theme} style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <div className="gc-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Sign in</h1>
          <button className="gc-btn gc-btn--secondary" type="button" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <p className="gc-muted" style={{ marginTop: 0 }}>Welcome back to GastroChef.</p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <div className="gc-warning">{error}</div> : null}
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  )
}
