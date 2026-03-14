const keyFor = (recipeId: string) => `gc_allergens__${recipeId}`

export function getAllergens(recipeId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(recipeId))
    const arr = raw ? (JSON.parse(raw) as any) : []
    if (!Array.isArray(arr)) return []
    return arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 20)
  } catch {
    return []
  }
}

export function setAllergens(recipeId: string, tags: string[]) {
  try {
    const clean = (tags || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 20)
    localStorage.setItem(keyFor(recipeId), JSON.stringify(clean))
  } catch {}
}

