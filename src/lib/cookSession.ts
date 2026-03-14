export type CookSession = {
  recipeId: string
  servings: number
  checkedSteps: Record<number, boolean>
  timers: Record<number, number> // seconds remaining
  updatedAt: string
}

const KEY_PREFIX = 'gc_cook_session_v1:'

function key(recipeId: string) {
  return `${KEY_PREFIX}${recipeId}`
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
  const raw = localStorage.getItem(key(recipeId))
  const s = safeParse<CookSession | null>(raw, null)
  if (!s || s.recipeId !== recipeId) return null
  return s
}

export function saveCookSession(recipeId: string, patch: Partial<CookSession>) {
  const current = loadCookSession(recipeId) || {
    recipeId,
    servings: 1,
    checkedSteps: {},
    timers: {},
    updatedAt: new Date().toISOString(),
  }
  const next: CookSession = {
    ...current,
    ...patch,
    recipeId,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(key(recipeId), JSON.stringify(next))
  return next
}

export function clearCookSession(recipeId: string) {
  localStorage.removeItem(key(recipeId))
}
