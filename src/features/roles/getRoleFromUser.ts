// src/features/roles/getRoleFromUser.ts
import type { User } from '@supabase/supabase-js'
import { DEFAULT_ROLE, normalizeRole, type Role } from './roles'

/**
 * Role source (A):
 * - Prefer app_metadata.role (more secure / server-controlled)
 * - Fallback to user_metadata.role (handy for quick testing)
 * - Else DEFAULT_ROLE
 */
export function getRoleFromUser(user: User | null | undefined): Role {
  if (!user) return DEFAULT_ROLE
  const fromApp = (user as any)?.app_metadata?.role
  if (fromApp) return normalizeRole(fromApp)

  const fromUser = (user as any)?.user_metadata?.role
  if (fromUser) return normalizeRole(fromUser)

  return DEFAULT_ROLE
}
