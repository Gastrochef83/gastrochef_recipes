import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import Wordmark from '../components/Wordmark'

export default function Login() {
  const base = useMemo(() => (import.meta as any).env?.BASE_URL || '/', [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  // ✅ If already signed in, go straight to the app (prevents weird loop / blank state)
  useEffect(() => {
    let alive = true

    async function check() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!alive) return
        const hasSession = !!data?.session
        if (hasSession) {
          window.location.assign(`${base}#/dashboard`)
          return
        }
      } catch {
        // ignore
      } finally {
        if (alive) setChecking(false)
      }
    }

    check()
    return () => {
      alive = false
    }
  }, [base])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

    setBusy(true)
    setErr(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setErr(error.message)
        return
      }

      // ✅ HashRouter-safe redirect
      window.location.assign(`${base}#/dashboard`)
    } catch (e: any) {
      setErr(e?.message || 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  const logoSrc = `${base}gastrochef-logo.png`
  const logoFallback = `${base}gastrochef-icon-512.png`

  return (
    <div className="gc-auth">
      <div className="gc-auth-card">
        {/* ✅ BRAND LOGO (Centered, crisp, Vercel-safe) */}
        <div className="gc-auth-head">
          <div className="gc-auth-hero">
            <img
              className="gc-auth-hero-logo"
              src={logoSrc}
              alt="GastroChef"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).src = logoFallback
              }}
            />
            <div className="gc-auth-hero-text">
              <h1><Wordmark size="lg" /></h1>
              <p>Professional Kitchen Intelligence Platform</p>
            </div>
          </div>
        </div>

        <div className="gc-auth-body">
          {checking ? (
            <div style={{ padding: 18, color: 'var(--gc-muted)', fontSize: 14, textAlign: 'center' }}>Checking session…</div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="gc-label">ENTER EMAIL</div>
                <input
                  className="gc-input"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  style={{ marginTop: 6 }}
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <div className="gc-label">ENTER PASSWORD</div>
                <input
                  className="gc-input"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
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

              <button type="submit" disabled={busy} className="gc-btn gc-btn-primary" style={{ width: '100%' }}>
                {busy ? 'Signing in…' : 'Login'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--gc-muted)' }}>
            New here?{' '}
            <Link to="/register" style={{ fontWeight: 900, textDecoration: 'underline', color: 'var(--accent)' }}>
              Create an account
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: 'var(--soft)' }}>
          Tip: If logout “bounces”, this build uses hard redirect for stability.
        </div>
      </div>
    </div>
  )
}