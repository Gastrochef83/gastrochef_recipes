import { FormEvent, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function Register() {
  const base = useMemo(() => (import.meta as any).env?.BASE_URL || '/', [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

    setErr(null)
    setOkMsg(null)

    const em = email.trim()
    if (!em.includes('@')) {
      setErr('Please enter a valid email.')
      return
    }
    if (password.length < 6) {
      setErr('Password must be at least 6 characters.')
      return
    }
    if (password !== password2) {
      setErr('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: em,
        password,
      })

      if (error) {
        setErr(error.message)
        return
      }

      // If email confirmations are enabled, session may be null.
      const hasSession = !!data?.session

      if (hasSession) {
        window.location.assign(`${base}#/dashboard`)
        return
      }

      setOkMsg('Account created. Please check your email to confirm, then login.')
    } catch (e: any) {
      setErr(e?.message || 'Register failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gc-auth">
      <div className="gc-auth-grid">
        <div className="gc-auth-hero" aria-hidden="true">
          <div className="gc-auth-hero-badge">Chef Setup</div>
          <div className="gc-auth-hero-title">
            Create your <span className="gc-brand-accent">GastroChef</span> account.
          </div>
          <div className="gc-auth-hero-sub">
            You’re building a professional kitchen system — this account unlocks recipes, costing, cook mode, and print cards.
          </div>
          <div className="gc-auth-hero-kpis">
            <div className="gc-auth-hero-chip">Professional UI</div>
            <div className="gc-auth-hero-chip">Supabase Auth</div>
            <div className="gc-auth-hero-chip">Audit‑ready</div>
          </div>
        </div>

        <div className="gc-auth-card">
          <div className="gc-auth-head">
            <div className="gc-auth-logo-centered" style={{ gridTemplateColumns: '1fr' }}>
              <div>
                <div className="gc-auth-title" style={{ fontSize: 28 }}>
                  Gastro<span className="gc-brand-accent">Chef</span>
                </div>
                <div className="gc-auth-sub">CREATE ACCOUNT</div>
              </div>
            </div>
          </div>

          <div className="gc-auth-body">
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="gc-label">EMAIL</div>
                <input
                  className="gc-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.com"
                  style={{ marginTop: 6 }}
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <div className="gc-label">PASSWORD</div>
                <input
                  className="gc-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  style={{ marginTop: 6 }}
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <div className="gc-label">CONFIRM PASSWORD</div>
                <input
                  className="gc-input"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••••"
                  style={{ marginTop: 6 }}
                />
              </div>

              {err && (
                <div
                  style={{
                    borderRadius: 14,
                    background: 'rgba(220,38,38,.08)',
                    border: '1px solid rgba(220,38,38,.18)',
                    color: '#b91c1c',
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  {err}
                </div>
              )}

              {okMsg && (
                <div
                  style={{
                    borderRadius: 14,
                    background: 'rgba(16,185,129,.10)',
                    border: '1px solid rgba(16,185,129,.22)',
                    color: '#065f46',
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  {okMsg}
                </div>
              )}

              <button type="submit" disabled={busy} className="gc-btn gc-btn-primary gc-btn--full">
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </form>

            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--gc-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ fontWeight: 900, textDecoration: 'underline', color: 'var(--gc-text)' }}>
                Login
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: 'var(--soft)' }}>
            Secure auth powered by Supabase.
          </div>
        </div>
      </div>
    </div>
  )
}
