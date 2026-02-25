// src/core/recipeEngine/units.ts
// Minimal unit normalization + pack unit conversion.
// Currently supports the exact conversions already used in RecipeEditor.

export function safeUnit(u: string): string {
  return (u ?? '').trim().toLowerCase() || 'g'
}

/**
 * Convert a line quantity (in lineUnit) into the ingredient's pack unit.
 * This mirrors the existing logic in RecipeEditor.
 */
export function convertQtyToPackUnit(qty: number, lineUnit: string, packUnit: string): number {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  let conv = qty
  if (u === 'g' && p === 'kg') conv = qty / 1000
  else if (u === 'kg' && p === 'g') conv = qty * 1000
  else if (u === 'ml' && p === 'l') conv = qty / 1000
  else if (u === 'l' && p === 'ml') conv = qty * 1000
  return conv
}
