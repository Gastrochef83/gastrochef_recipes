import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

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

  return (
    <div className="gc-auth">
      <div className="gc-auth-card">
        {/* Wordmark (Kitopi-like) */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: '#0f172a',
              display: 'inline-block',
              whiteSpace: 'nowrap',
            }}
          >
            Gastro
            <span style={{ color: '#0f766e' }}>Chef</span>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>
            Sign in to your kitchen workspace
          </div>

          <div
            style={{
              width: 72,
              height: 4,
              borderRadius: 999,
              background: '#0f766e',
              margin: '14px auto 0',
            }}
          />
        </div>

        {/* Card */}
        <div className="gc-auth-body">
          {checking ? (
            <div style={{ padding: 18, color: '#64748b', fontSize: 14, textAlign: 'center' }}>Checking session…</div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Email</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(15,23,42,.14)',
                    outline: 'none',
                    background: '#eff6ff',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    padding: '11px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(15,23,42,.14)',
                    outline: 'none',
                    background: '#eff6ff',
                  }}
                />
              </div>

              {err && (
                <div
                  style={{
                    borderRadius: 14,
                    background: '#fef2f2',
                    border: '1px solid rgba(239,68,68,.20)',
                    color: '#b91c1c',
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: '#111827',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.65 : 1,
                }}
              >
                {busy ? 'Signing in…' : 'Login'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
            New here?{' '}
            <Link to="/register" style={{ fontWeight: 800, textDecoration: 'underline', color: '#0f172a' }}>
              Create an account
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>
          Tip: If logout “bounces”, this build uses hard redirect for stability.
        </div>
      </div>
    </div>
  )
}
