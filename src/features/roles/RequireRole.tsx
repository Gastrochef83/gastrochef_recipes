// src/features/roles/RequireRole.tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useRole } from './useRole'
import type { Role } from './roles'
import { canAnyOf } from './roles'

type Props = {
  anyOf: Role[]
  redirectTo?: string
  children: ReactNode
}

/**
 * Usage:
 * <RequireRole anyOf={['manager','owner']}>
 *   <Settings />
 * </RequireRole>
 */
export default function RequireRole({ anyOf, redirectTo = '/dashboard', children }: Props) {
  const { role, loading } = useRole()

  if (loading) return null
  if (!canAnyOf(role, anyOf)) return <Navigate to={redirectTo} replace />

  return <>{children}</>
}
