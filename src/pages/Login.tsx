import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

const BRAND_ICON = '/gastrochef-icon-512.png'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return setErr(error.message)
    nav('/')
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(180deg, #f6f8fb 0%, #eef3f6 100%)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div style={{ width: 'min(520px, 92vw)' }}>
        {/* Hero (Kitopi-like) */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 26,
              margin: '0 auto',
              background: '#ffffff',
              border: '1px solid rgba(15,23,42,.10)',
              boxShadow: '0 18px 50px rgba(2,6,23,.10)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={BRAND_ICON}
              alt="GastroChef"
              style={{ width: 72, height: 72, objectFit: 'contain', display: 'block' }}
            />
          </div>

          <div style={{ marginTop: 14, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>
            GastroChef
          </div>

          <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>
            Sign in to your kitchen workspace
          </div>

          {/* Accent line */}
          <div
            style={{
              width: 70,
              height: 4,
              borderRadius: 99,
              background: '#0f766e',
              margin: '14px auto 0',
            }}
          />
        </div>

        {/* Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid rgba(15,23,42,.10)',
            borderRadius: 22,
            boxShadow: '0 18px 50px rgba(2,6,23,.08)',
            padding: 18,
          }}
        >
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="text-xs font-semibold text-neutral-600">Email</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-600">Password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            <button
              disabled={busy}
              className="w-full rounded-xl bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Login'}
            </button>
          </form>

          <div className="mt-4 text-sm text-neutral-600">
            New here?{' '}
            <Link className="font-semibold underline" to="/register">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
