// src/lib/kitchen.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

export type KitchenProfile = {
  user_id: string
  kitchen_id: string
  role: 'owner' | 'staff' | 'viewer'
  kitchen_name?: string
}

const CACHE_KEY = 'gc_kitchen_profile_v1'

function readCache(): KitchenProfile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj?.kitchen_id || !obj?.user_id) return null
    return obj as KitchenProfile
  } catch {
    return null
  }
}

function writeCache(p: KitchenProfile) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  } catch {}
}

export function clearKitchenCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {}
}

/**
 * useKitchen()
 * - Resolves tenant (kitchen_id) from user_profiles (RLS-safe)
 * - Optionally bootstraps a kitchen via RPC if profile does not exist
 * - Caches result to avoid repeated calls
 */
export function useKitchen() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<KitchenProfile | null>(() => readCache())
  const [error, setError] = useState<string | null>(null)

  const role = profile?.role ?? 'viewer'
  const kitchenId = profile?.kitchen_id ?? null
  const kitchenName = profile?.kitchen_name ?? null

  const canEdit = role === 'owner' || role === 'staff'
  const isOwner = role === 'owner'

  async function fetchProfile() {
    setError(null)
    setLoading(true)

    try {
      const { data: u } = await supabase.auth.getUser()
      const userId = u?.user?.id
      if (!userId) throw new Error('No authenticated user.')

      // user_profiles is protected by RLS in your migration
      const { data, error: pErr } = await supabase
        .from('user_profiles')
        .select('user_id,kitchen_id,role,kitchens(name)')
        .eq('user_id', userId)
        .maybeSingle()

      if (pErr) throw pErr

      // If profile does not exist, bootstrap a kitchen (safe RPC in 001_init.sql)
      if (!data) {
        const { data: kid, error: bErr } = await supabase.rpc('bootstrap_kitchen', { kitchen_name: 'My Kitchen' })
        if (bErr) throw bErr

        const { data: data2, error: p2Err } = await supabase
          .from('user_profiles')
          .select('user_id,kitchen_id,role,kitchens(name)')
          .eq('user_id', userId)
          .maybeSingle()

        if (p2Err) throw p2Err
        if (!data2) throw new Error('Failed to create user profile.')

        const p: KitchenProfile = {
          user_id: data2.user_id,
          kitchen_id: data2.kitchen_id,
          role: data2.role,
          kitchen_name: (data2 as any)?.kitchens?.name ?? undefined,
        }

        if (mounted.current) {
          setProfile(p)
          writeCache(p)
        }
      } else {
        const p: KitchenProfile = {
          user_id: data.user_id,
          kitchen_id: data.kitchen_id,
          role: data.role,
          kitchen_name: (data as any)?.kitchens?.name ?? undefined,
        }
        if (mounted.current) {
          setProfile(p)
          writeCache(p)
        }
      }
    } catch (e: any) {
      if (mounted.current) setError(e?.message || 'Failed to resolve kitchen.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  useEffect(() => {
    // If cached profile exists, still refresh silently once
    fetchProfile().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const api = useMemo(
    () => ({
      loading,
      error,
      profile,
      kitchenId,
      kitchenName,
      role,
      canEdit,
      isOwner,
      refresh: fetchProfile,
    }),
    [loading, error, profile, kitchenId, kitchenName, role, canEdit, isOwner]
  )

  return api
}
