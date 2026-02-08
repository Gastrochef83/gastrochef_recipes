import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const nav = useNavigate()
  const [kitchenName, setKitchenName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)

    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) { setBusy(false); return setErr(signUpError.message) }

    const { error: rpcError } = await supabase.rpc('bootstrap_kitchen', { kitchen_name: kitchenName || 'My Kitchen' })
    setBusy(false)
    if (rpcError) return setErr(rpcError.message)

    nav('/')
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-xl font-semibold">Create account</div>
          <div className="mt-1 text-sm text-neutral-500">Start your first kitchen workspace</div>

          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="text-xs font-semibold text-neutral-600">Kitchen name</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2" value={kitchenName} onChange={(e) => setKitchenName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-600">Email</label>
              <input className="mt-1 w-full rounded-xl border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-600">Password</label>
              <input type="password" className="mt-1 w-full rounded-xl border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
            <button disabled={busy} className="w-full rounded-xl bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-800 disabled:opacity-60">
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-sm text-neutral-600">
            Already have an account? <Link className="font-semibold underline" to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
