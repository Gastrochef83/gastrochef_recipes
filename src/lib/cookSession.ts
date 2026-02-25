export type CookSession = {
  recipeId: string
  servings: number
  checkedSteps: Record<number, boolean>
  checkedLines: Record<string, boolean>
  timers: Record<number, number> // seconds remaining
  updatedAt: string
}

// v2 adds checkedLines (ingredient/prep checklist)
const KEY_PREFIX_V2 = 'gc_cook_session_v2:'
const KEY_PREFIX_V1 = 'gc_cook_session_v1:'

function keyV2(recipeId: string) {
  return `${KEY_PREFIX_V2}${recipeId}`
}

function keyV1(recipeId: string) {
  return `${KEY_PREFIX_V1}${recipeId}`
}

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export function loadCookSession(recipeId: string): CookSession | null {
  // Prefer v2
  const raw2 = localStorage.getItem(keyV2(recipeId))
  const s2 = safeParse<CookSession | null>(raw2, null)
  if (s2 && s2.recipeId === recipeId) return s2

  // Migrate v1 → v2
  const raw1 = localStorage.getItem(keyV1(recipeId))
  const s1 = safeParse<any>(raw1, null)
  if (!s1 || s1.recipeId !== recipeId) return null

  const migrated: CookSession = {
    recipeId,
    servings: Number(s1.servings) > 0 ? Number(s1.servings) : 1,
    checkedSteps: (s1.checkedSteps ?? {}) as Record<number, boolean>,
    checkedLines: {},
    timers: (s1.timers ?? {}) as Record<number, number>,
    updatedAt: new Date().toISOString(),
  }

  localStorage.setItem(keyV2(recipeId), JSON.stringify(migrated))
  return migrated
}

export function saveCookSession(recipeId: string, patch: Partial<CookSession>) {
  const current =
    loadCookSession(recipeId) ||
    ({
      recipeId,
      servings: 1,
      checkedSteps: {},
      checkedLines: {},
      timers: {},
      updatedAt: new Date().toISOString(),
    } satisfies CookSession)

  const next: CookSession = {
    ...current,
    ...patch,
    recipeId,
    updatedAt: new Date().toISOString(),
  }

  localStorage.setItem(keyV2(recipeId), JSON.stringify(next))
  return next
}

export function clearCookSession(recipeId: string) {
  localStorage.removeItem(keyV2(recipeId))
  localStorage.removeItem(keyV1(recipeId))
}
