import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export default function TopBar() {
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-neutral-900" />
          <div>
            <div className="text-sm font-semibold tracking-wide">GastroChef</div>
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
