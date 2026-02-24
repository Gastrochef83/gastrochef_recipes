export type Snapshot = {
  id: string
  createdAt: string
  label: string
  recipeId: string
  payload: any
}

const KEY_PREFIX = 'gc_recipe_snapshots_v1:'

function key(recipeId: string) {
  return `${KEY_PREFIX}${recipeId}`
}

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export function listSnapshots(recipeId: string): Snapshot[] {
  const raw = localStorage.getItem(key(recipeId))
  const arr = safeJsonParse<Snapshot[]>(raw, [])
  return Array.isArray(arr) ? arr : []
}

export function saveSnapshot(recipeId: string, label: string, payload: any): Snapshot {
  const snap: Snapshot = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    label: (label || 'Version').trim() || 'Version',
    recipeId,
    payload,
  }

  const all = listSnapshots(recipeId)
  const next = [snap, ...all].slice(0, 30) // keep last 30
  localStorage.setItem(key(recipeId), JSON.stringify(next))
  return snap
}

export function deleteSnapshot(recipeId: string, snapshotId: string) {
  const all = listSnapshots(recipeId)
  const next = all.filter((s) => s.id !== snapshotId)
  localStorage.setItem(key(recipeId), JSON.stringify(next))
}

export function clearSnapshots(recipeId: string) {
  localStorage.removeItem(key(recipeId))
}
