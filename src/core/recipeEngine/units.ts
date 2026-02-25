// src/core/recipeEngine/units.ts
// Minimal unit normalization + pack unit conversion.
// NOTE: This file MUST keep export `convertQtyToPackUnit` because compute.ts depends on it.

export function safeUnit(u: string): string {
  return (u ?? '').trim().toLowerCase() || 'g'
}

/**
 * Convert a line quantity (in lineUnit) into the ingredient's pack unit.
 * Supports the conversions currently used by GastroChef.
 */
export function convertQtyToPackUnit(qty: number, lineUnit: string, packUnit: string): number {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  let conv = qty

  // Mass
  if (u === 'g' && p === 'kg') conv = qty / 1000
  else if (u === 'kg' && p === 'g') conv = qty * 1000

  // Volume
  else if (u === 'ml' && p === 'l') conv = qty / 1000
  else if (u === 'l' && p === 'ml') conv = qty * 1000

  return conv
}

// Convenience helpers (V1) used by the Global Units layer
export function convertGramsToKg(g: number): number {
  return g / 1000
}

export function convertKgToGrams(kg: number): number {
  return kg * 1000
}
