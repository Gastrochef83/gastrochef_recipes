// src/lib/license.ts
export type GCPlan = 'FREE' | 'PRO' | 'TEAM'

export type GCFeature =
  | 'PUBLIC_SHARE'
  | 'EXCEL_EXPORT'
  | 'BACKUP_IMPORT'
  | 'BACKUP_EXPORT'

const KEY_DEMO = 'gc_demo_mode'
const KEY_PLAN = 'gc_plan'
const KEY_LICENSE = 'gc_license_key'

export function getDemoMode(): boolean {
  try {
    return localStorage.getItem(KEY_DEMO) === '1'
  } catch {
    return false
  }
}

export function setDemoMode(v: boolean) {
  try {
    localStorage.setItem(KEY_DEMO, v ? '1' : '0')
  } catch {
    // ignore
  }
}

export function getPlan(): GCPlan {
  // Prefer build-time config if provided
  const envPlan = (import.meta as any)?.env?.VITE_GC_PLAN as string | undefined
  const normalized = (envPlan || '').toUpperCase()
  if (normalized === 'PRO' || normalized === 'TEAM' || normalized === 'FREE') return normalized as GCPlan

  try {
    const p = (localStorage.getItem(KEY_PLAN) || 'FREE').toUpperCase()
    if (p === 'PRO' || p === 'TEAM' || p === 'FREE') return p as GCPlan
    return 'FREE'
  } catch {
    return 'FREE'
  }
}

export function setPlan(p: GCPlan) {
  try {
    localStorage.setItem(KEY_PLAN, p)
  } catch {
    // ignore
  }
}

export function getLicenseKey(): string {
  try {
    return localStorage.getItem(KEY_LICENSE) || ''
  } catch {
    return ''
  }
}

export function setLicenseKey(key: string) {
  try {
    localStorage.setItem(KEY_LICENSE, key || '')
  } catch {
    // ignore
  }
}

/**
 * Lightweight placeholder validation (UI only).
 * Examples:
 * - GC-PRO-XXXX-XXXX
 * - GC-TEAM-XXXX-XXXX
 */
export function validateLicenseKey(key: string): { ok: boolean; plan?: GCPlan; reason?: string } {
  const k = (key || '').trim().toUpperCase()
  if (!k) return { ok: false, reason: 'Missing key' }

  if (/^GC-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return { ok: true, plan: 'PRO' }
  if (/^GC-TEAM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return { ok: true, plan: 'TEAM' }

  return { ok: false, reason: 'Invalid format' }
}

export function canUse(feature: GCFeature): boolean {
  const plan = getPlan()
  if (plan === 'TEAM') return true
  if (plan === 'PRO') {
    // Pro gets everything in this UI pack
    return true
  }
  // FREE
  if (feature === 'BACKUP_EXPORT') return true
  return false
}

export function getLicenseLabel(): string {
  const plan = getPlan()
  if (plan === 'TEAM') return 'Licensed • Team'
  if (plan === 'PRO') return 'Licensed • Pro'
  return 'Community • Free'
}
