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
      <div className="gc-auth-card">
        <div className="gc-auth-head">
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

          <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>Create your account</div>

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

        <div className="gc-auth-body">
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
                autoComplete="new-password"
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Confirm Password</div>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
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

            {okMsg && (
              <div
                style={{
                  borderRadius: 14,
                  background: '#ecfdf5',
                  border: '1px solid rgba(16,185,129,.20)',
                  color: '#065f46',
                  padding: 12,
                  fontSize: 13,
                }}
              >
                {okMsg}
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
              {busy ? 'Creating…' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ fontWeight: 800, textDecoration: 'underline', color: '#0f172a' }}>
              Login
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>
          Secure auth powered by Supabase.
        </div>
      </div>
    </div>
  )
}
