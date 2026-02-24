import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export default function TopBar() {
  const [email, setEmail] = useState<string>('')
  const base = (import.meta as any).env?.BASE_URL || '/'
  const logoSrc = `${base}gastrochef-logo.png`
  const iconSrc = `${base}gastrochef-icon-512.png`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Brand (Kitopi-like) */}
          <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-2xl border bg-white shadow-sm">
            <img
              src={logoSrc}
              alt="GastroChef"
              className="h-full w-full object-contain p-1"
              onError={(e) => {
                const img = e.currentTarget
                if (img.src !== iconSrc) img.src = iconSrc
              }}
            />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">
              <span className="text-neutral-900">Gastro</span>
              <span className="text-teal-600">Chef</span>
            </div>
            <div className="text-xs text-neutral-500">V4 MVP</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-600">{email}</div>
          <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-neutral-50" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
