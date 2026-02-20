import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

const LOGO_URL = '/gastrochef-logo.png'

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
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border bg-white p-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src={LOGO_URL}
              alt="GastroChef"
              className="h-12 w-12 rounded-xl border bg-white object-contain"
            />
            <div>
              <div className="text-xl font-extrabold">GastroChef</div>
              <div className="text-sm text-neutral-500">Sign in to your kitchen workspace</div>
            </div>
          </div>

          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
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
