// src/features/roles/useRole.ts
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Role } from './roles'
import { DEFAULT_ROLE } from './roles'
import { getRoleFromUser } from './getRoleFromUser'

export function useRole() {
  const [role, setRole] = useState<Role>(DEFAULT_ROLE)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        const next = getRoleFromUser(data?.user)
        if (alive) setRole(next)
      } catch {
        if (alive) setRole(DEFAULT_ROLE)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()

    // keep role in sync across login/logout/token refresh
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  return { role, loading }
}
