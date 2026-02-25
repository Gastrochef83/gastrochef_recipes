// src/core/recipeEngine/compute.ts
// Core computations extracted from RecipeEditor useMemo blocks.
// IMPORTANT: No business logic changes — this is a pure extraction.

import { clamp, toNum } from './math'
import { convertQtyToPackUnit } from './units'

export type IngredientCostPick = {
  id: string
  net_unit_cost?: number | null
  pack_unit?: string | null
}

export type LineCore = {
  id: string
  line_type: 'ingredient' | 'subrecipe' | 'group'
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  yield_percent: number
  gross_qty_override: number | null
}

export type LineComputed = {
  net: number
  gross: number
  yieldPct: number
  unitCost: number
  lineCost: number
  warnings: string[]
}

export function computeLineComputed(
  lines: LineCore[],
  ingById: Map<string, IngredientCostPick>,
  subrecipeCostById?: Map<string, number>
): Map<string, LineComputed> {
  const res = new Map<string, LineComputed>()

  for (const l of lines) {
    const warnings: string[] = []

    const net = Math.max(0, toNum(l.qty, 0))
    const yieldPct = clamp(toNum(l.yield_percent, 100), 0.0001, 100)

    // gross logic: if override exists use it else compute from yield
    const gross =
      l.gross_qty_override != null && l.gross_qty_override > 0
        ? Math.max(0, l.gross_qty_override)
        : net / (yieldPct / 100)

    let unitCost = 0
    let lineCost = 0

    if (l.line_type === 'ingredient') {
      const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
      unitCost = toNum(ing?.net_unit_cost, 0)
      if (!ing) warnings.push('Missing ingredient')
      if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')

      const packUnit = ing?.pack_unit || l.unit
      const qtyInPack = convertQtyToPackUnit(gross, l.unit, packUnit)
      lineCost = qtyInPack * unitCost
    } else if (l.line_type === 'subrecipe') {
      const subCost = l.sub_recipe_id ? toNum(subrecipeCostById?.get(l.sub_recipe_id) ?? 0, 0) : 0
      if (!l.sub_recipe_id) warnings.push('Missing sub-recipe')
      unitCost = subCost
      lineCost = gross * unitCost
    } else {
      // group
      unitCost = 0
      lineCost = 0
    }

    res.set(l.id, { net, gross, yieldPct, unitCost, lineCost, warnings })
  }

  return res
}

export type RecipeTotals = {
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  warnings: string[]
}

export function computeRecipeTotals(args: {
  lines: LineCore[]
  lineComputed: Map<string, LineComputed>
  portions: number
  sellingPrice: number
}): RecipeTotals {
  const { lines, lineComputed, portions, sellingPrice } = args

  let totalCost = 0
  let warnings: string[] = []

  for (const l of lines) {
    if (l.line_type === 'group') continue
    const c = lineComputed.get(l.id)
    if (!c) continue
    totalCost += c.lineCost
    if (c.warnings.length) warnings = warnings.concat(c.warnings)
  }

  const p = Math.max(1, toNum(portions, 1))
  const cpp = p > 0 ? totalCost / p : 0

  const sell = Math.max(0, toNum(sellingPrice, 0))
  const fcPct = sell > 0 ? (cpp / sell) * 100 : null
  const margin = sell - cpp
  const marginPct = sell > 0 ? (margin / sell) * 100 : null

  const uniqWarnings = Array.from(new Set(warnings)).slice(0, 4)

  return { totalCost, cpp, fcPct, margin, marginPct, warnings: uniqWarnings }
}
