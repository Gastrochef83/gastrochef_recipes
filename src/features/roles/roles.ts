// src/features/roles/roles.ts
export type Role = 'chef' | 'manager' | 'owner'

export const DEFAULT_ROLE: Role = 'chef'

/**
 * Rank-based permissions:
 * chef < manager < owner
 */
export const ROLE_RANK: Record<Role, number> = {
  chef: 1,
  manager: 2,
  owner: 3,
}

export function normalizeRole(value: unknown): Role {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'owner') return 'owner'
  if (v === 'manager') return 'manager'
  return 'chef'
}

export function canAnyOf(role: Role, anyOf: Role[]): boolean {
  if (!anyOf || anyOf.length === 0) return true
  const r = ROLE_RANK[role] ?? ROLE_RANK[DEFAULT_ROLE]
  return anyOf.some((x) => r >= (ROLE_RANK[x] ?? 999))
}

export function atLeast(role: Role, minRole: Role): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
}
