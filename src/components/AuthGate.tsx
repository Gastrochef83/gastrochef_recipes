import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import SplashScreen from './SplashScreen'

type Props = {
  children: React.ReactNode
  redirectTo?: string
}

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
      <SplashScreen
        title="GastroChef"
        subtitle="Signing you in…"
        hint="Verifying session & loading workspace"
      />
    )
  }

  if (!ok) return null
  return <>{children}</>
}
