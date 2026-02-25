// src/core/recipeEngine/scaling.ts
// Global Scaling Engine V1 (servings scaling). Pure + safe.
// UI can call this to scale Net/Gross quantities when servings change.

export function scaleQuantity(qty: number, fromServings: number, toServings: number): number {
  const a = Number(fromServings)
  const b = Number(toServings)
  const q = Number(qty)

  if (!Number.isFinite(q)) return 0
  if (!Number.isFinite(a) || a <= 0) return q
  if (!Number.isFinite(b) || b <= 0) return q

  const factor = b / a
  // 3 decimals is enough for kitchen work; avoids long floats.
  return Math.round(q * factor * 1000) / 1000
}
