export type CostPoint = {
  id: string
  createdAt: number
  totalCost: number
  cpp: number
  portions: number
  currency: string
}

const keyFor = (recipeId: string) => `gc_cost_history__${recipeId}`

function safeParse<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export function listCostPoints(recipeId: string): CostPoint[] {
  try {
    const raw = localStorage.getItem(keyFor(recipeId))
    const parsed = safeParse<CostPoint[]>(raw) || []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addCostPoint(
  recipeId: string,
  point: Omit<CostPoint, 'id' | 'createdAt'> & { createdAt?: number }
) {
  try {
    const prev = listCostPoints(recipeId)
    const next: CostPoint = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: point.createdAt ?? Date.now(),
      totalCost: Number(point.totalCost) || 0,
      cpp: Number(point.cpp) || 0,
      portions: Math.max(1, Number(point.portions) || 1),
      currency: (point.currency || 'USD').toUpperCase(),
    }

    // de-dupe if same values as last point (avoid spam autosave)
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

    const merged = [next, ...prev].slice(0, 60)
    localStorage.setItem(keyFor(recipeId), JSON.stringify(merged))
  } catch {}
}

export function clearCostPoints(recipeId: string) {
  try {
    localStorage.removeItem(keyFor(recipeId))
  } catch {}
}

export function deleteCostPoint(recipeId: string, pointId: string) {
  try {
    const prev = listCostPoints(recipeId)
    const next = prev.filter((p) => p.id !== pointId)
    localStorage.setItem(keyFor(recipeId), JSON.stringify(next))
  } catch {}
}
