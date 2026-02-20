import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Login() {
  const nav = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

    setBusy(true)
    setErr(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setBusy(false)

    if (error) {
      setErr(error.message)
      return
    }

    // ✅ important: go to app after success
    nav('/dashboard', { replace: true })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        background: 'linear-gradient(180deg, #f6f8fb 0%, #eef3f6 100%)',
      }}
    >
      <div style={{ width: 'min(520px, 92vw)' }}>
        {/* Wordmark (Kitopi-like) */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: '#0f172a',
              // ✅ prevents splitting / weird flex from global CSS
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
        <div
          style={{
            background: '#fff',
            border: '1px solid rgba(15, 23, 42, .10)',
            borderRadius: 22,
            boxShadow: '0 18px 50px rgba(2, 6, 23, .08)',
            padding: 18,
          }}
        >
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Email</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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

          <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
            New here?{' '}
            <Link to="/register" style={{ fontWeight: 800, textDecoration: 'underline', color: '#0f172a' }}>
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
