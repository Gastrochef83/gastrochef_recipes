// src/core/recipeEngine/math.ts
// Shared numeric helpers for Recipe Engine.
// NOTE: Keep logic identical to existing UI helpers. No business logic changes.

export function toNum(x: unknown, fallback = 0): number {
  const n = Number(x as any)
  return Number.isFinite(n) ? n : fallback
}

export function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}
