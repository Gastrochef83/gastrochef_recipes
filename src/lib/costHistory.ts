export type CostPoint = {
  id: string
  createdAt: number
  totalCost: number
  cpp: number
  portions: number
  currency: string
}

type StoredPayloadV1 = {
  v: 1
  points: CostPoint[]
}

const MAX_POINTS = 60

const keyFor = (recipeId: string) => `gc_cost_history__${recipeId}`

function safeParse<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function clampPoints(points: CostPoint[]) {
  // Ensure newest-first order by createdAt
  const cleaned = points
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id ?? ''),
      createdAt: Number(p.createdAt) || 0,
      totalCost: Number(p.totalCost) || 0,
      cpp: Number(p.cpp) || 0,
      portions: Math.max(1, Number(p.portions) || 1),
      currency: String(p.currency || 'USD').toUpperCase(),
    }))
    .filter((p) => p.id && p.createdAt > 0)

  cleaned.sort((a, b) => b.createdAt - a.createdAt)
  return cleaned.slice(0, MAX_POINTS)
}

function readRaw(recipeId: string): CostPoint[] {
  try {
    const raw = localStorage.getItem(keyFor(recipeId))
    if (!raw) return []

    // Accept either:
    // - legacy: CostPoint[]
    // - v1: { v: 1, points: CostPoint[] }
    const payload = safeParse<any>(raw)
    if (!payload) return []

    if (Array.isArray(payload)) return clampPoints(payload as CostPoint[])

    if (payload && typeof payload === 'object' && payload.v === 1 && Array.isArray(payload.points)) {
      return clampPoints(payload.points as CostPoint[])
    }

    return []
  } catch {
    return []
  }
}

function writeSafe(recipeId: string, points: CostPoint[]) {
  try {
    const payload: StoredPayloadV1 = { v: 1, points: clampPoints(points) }
    localStorage.setItem(keyFor(recipeId), JSON.stringify(payload))
    return true
  } catch {
    // localStorage quota or blocked
    return false
  }
}

export function listCostPoints(recipeId: string): CostPoint[] {
  return readRaw(recipeId)
}

export function addCostPoint(
  recipeId: string,
  point: Omit<CostPoint, 'id' | 'createdAt'> & { createdAt?: number }
) {
  try {
    const prev = readRaw(recipeId)

    const next: CostPoint = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: point.createdAt ?? Date.now(),
      totalCost: Number(point.totalCost) || 0,
      cpp: Number(point.cpp) || 0,
      portions: Math.max(1, Number(point.portions) || 1),
      currency: String(point.currency || 'USD').toUpperCase(),
    }

    // De-dupe: if same as most recent
    const last = prev[0]
    if (
      last &&
      Math.abs(last.totalCost - next.totalCost) < 1e-9 &&
      Math.abs(last.cpp - next.cpp) < 1e-9 &&
      last.portions === next.portions &&
      last.currency === next.currency
    ) {
      return
    }

    // Insert as newest, then clamp
    const merged = clampPoints([next, ...prev])

    // Write, if fails try shrinking a bit then write again
    if (writeSafe(recipeId, merged)) return

    // Fallback: keep only 20 points if quota is tight
    writeSafe(recipeId, merged.slice(0, 20))
  } catch {
    // ignore
  }
}

export function clearCostPoints(recipeId: string) {
  try {
    localStorage.removeItem(keyFor(recipeId))
  } catch {}
}

export function deleteCostPoint(recipeId: string, pointId: string) {
  try {
    const prev = readRaw(recipeId)
    const next = prev.filter((p) => p.id !== pointId)
    writeSafe(recipeId, next)
  } catch {}
}
