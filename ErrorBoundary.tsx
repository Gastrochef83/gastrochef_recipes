import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  children: React.ReactNode
  /** where to send unauth users */
  redirectTo?: string
}

/**
 * ✅ AuthGate (HashRouter-safe)
 * - Prevents accessing app pages without a valid session
 * - Prevents weird "bounce back" after logout by hard redirect
 * - No changes to your recipe/ingredient logic — only routing safety
 */
export default function AuthGate({ children, redirectTo = '/login' }: Props) {
  const base = useMemo(() => (import.meta as any).env?.BASE_URL || '/', [])
  const [checking, setChecking] = useState(true)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let alive = true

    async function run() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!alive) return
        const has = !!data?.session
        setOk(has)

        if (!has) {
          // ✅ hard redirect avoids outlet stuck / cached renders
          window.location.assign(`${base}#${redirectTo}`)
        }
      } catch {
        if (!alive) return
        setOk(false)
        window.location.assign(`${base}#${redirectTo}`)
      } finally {
        if (alive) setChecking(false)
      }
    }

    run()

    // Also listen for auth state changes (logout/login)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const has = !!session
      setOk(has)
      if (!has) window.location.assign(`${base}#${redirectTo}`)
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [base, redirectTo])

  if (checking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f6f8fb',
          color: '#64748b',
          fontSize: 14,
        }}
      >
        Checking session…
      </div>
    )
  }

  if (!ok) return null

  return <>{children}</>
}
