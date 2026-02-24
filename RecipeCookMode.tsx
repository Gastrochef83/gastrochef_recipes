// src/lib/nutritionCalc.ts
export type NutritionPer100g = {
  kcal_per_100g: number | null
  protein_per_100g: number | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
}

export type IngredientForCalc = NutritionPer100g & {
  id: string
  name: string
  density_g_per_ml: number | null
  grams_per_piece: number | null
}

export type RecipeLineForCalc = {
  id: string
  ingredient_id: string | null
  qty: number | null
  unit: string | null
  ingredient?: IngredientForCalc | null
}

type Totals = {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

type SkipReason =
  | 'NO_INGREDIENT_ID'
  | 'NO_INGREDIENT_JOIN'
  | 'BAD_QTY'
  | 'UNSUPPORTED_UNIT'
  | 'MISSING_DENSITY'
  | 'MISSING_GRAMS_PER_PIECE'
  | 'MISSING_NUTRITION'

export type CalcDiagnostics = {
  total_lines: number
  used_lines: number
  skipped_lines: number
  skipped: Array<{
    line_id: string
    ingredient_name?: string
    unit?: string
    qty?: number | null
    reason: SkipReason
    detail?: string
  }>
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ------------- Unit Normalization -------------
function safeUnit(u: string | null | undefined): string {
  return (u ?? '').trim().toLowerCase()
}

function normalizeUnit(uRaw: string | null | undefined): string {
  const u = safeUnit(uRaw)

  // mass
  if (u === 'g' || u === 'gram' || u === 'grams') return 'g'
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'kg'
  if (u === 'mg' || u === 'milligram' || u === 'milligrams') return 'mg'
  if (u === 'oz' || u === 'ounce' || u === 'ounces') return 'oz'
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb'

  // volume
  if (u === 'ml' || u === 'milliliter' || u === 'millilitre') return 'ml'
  if (u === 'l' || u === 'lt' || u === 'liter' || u === 'litre') return 'l'
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return 'tsp'
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return 'tbsp'
  if (u === 'cup' || u === 'cups') return 'cup'
  if (u === 'floz' || u === 'fl oz' || u === 'fluidounce' || u === 'fluid ounce') return 'floz'

  // pieces
  if (u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces' || u === 'ea' || u === 'each') return 'pcs'

  return u // unknown => will be unsupported later
}

// ------------- Unit Conversion -------------
function gramsFromMass(qty: number, unit: string): number | null {
  // returns grams
  switch (unit) {
    case 'g':
      return qty
    case 'kg':
      return qty * 1000
    case 'mg':
      return qty / 1000
    case 'oz':
      return qty * 28.349523125
    case 'lb':
      return qty * 453.59237
    default:
      return null
  }
}

function mlFromVolume(qty: number, unit: string): number | null {
  // returns milliliters
  switch (unit) {
    case 'ml':
      return qty
    case 'l':
      return qty * 1000
    case 'tsp':
      return qty * 4.92892159375
    case 'tbsp':
      return qty * 14.78676478125
    case 'cup':
      return qty * 236.5882365
    case 'floz':
      return qty * 29.5735295625
    default:
      return null
  }
}

/**
 * Convert line qty+unit to grams using:
 * - mass units directly
 * - volume units => ml * density_g_per_ml
 * - pcs => qty * grams_per_piece
 */
function toGrams(
  qty: number,
  unitRaw: string | null | undefined,
  ing: IngredientForCalc
): { grams: number | null; reason?: SkipReason; detail?: string; unit?: string } {
  const unit = normalizeUnit(unitRaw)

  // 1) mass
  const gMass = gramsFromMass(qty, unit)
  if (gMass != null) return { grams: gMass, unit }

  // 2) volume => need density
  const ml = mlFromVolume(qty, unit)
  if (ml != null) {
    const density = ing.density_g_per_ml
    if (!density || density <= 0) {
      return { grams: null, reason: 'MISSING_DENSITY', detail: 'density_g_per_ml is null/0', unit }
    }
    return { grams: ml * density, unit }
  }

  // 3) pieces => need grams_per_piece
  if (unit === 'pcs') {
    const gpp = ing.grams_per_piece
    if (!gpp || gpp <= 0) {
      return { grams: null, reason: 'MISSING_GRAMS_PER_PIECE', detail: 'grams_per_piece is null/0', unit }
    }
    return { grams: qty * gpp, unit }
  }

  return { grams: null, reason: 'UNSUPPORTED_UNIT', detail: `unit="${unitRaw ?? ''}"`, unit }
}

// ------------- Nutrition calc -------------
function hasAnyNutrition(n: NutritionPer100g): boolean {
  const k = n.kcal_per_100g ?? 0
  const p = n.protein_per_100g ?? 0
  const c = n.carbs_per_100g ?? 0
  const f = n.fat_per_100g ?? 0
  return k !== 0 || p !== 0 || c !== 0 || f !== 0
}

function per100ToTotal(per100: number, grams: number): number {
  // per 100g => for grams
  return (per100 * grams) / 100
}

export function calcRecipeNutrition(lines: RecipeLineForCalc[]): {
  totals: Totals
  diagnostics: CalcDiagnostics
} {
  const totals: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

  const diag: CalcDiagnostics = {
    total_lines: lines.length,
    used_lines: 0,
    skipped_lines: 0,
    skipped: [],
  }

  for (const line of lines) {
    const qty = line.qty ?? null
    const unit = line.unit ?? null

    if (!line.ingredient_id) {
      diag.skipped_lines++
      diag.skipped.push({
        line_id: line.id,
        unit: unit ?? undefined,
        qty,
        reason: 'NO_INGREDIENT_ID',
        detail: 'ingredient_id is null (likely sub-recipe line)',
      })
      continue
    }

    const ing = line.ingredient ?? null
    if (!ing) {
      diag.skipped_lines++
      diag.skipped.push({
        line_id: line.id,
        unit: unit ?? undefined,
        qty,
        reason: 'NO_INGREDIENT_JOIN',
        detail: 'ingredient join missing',
      })
      continue
    }

    if (!qty || qty <= 0) {
      diag.skipped_lines++
      diag.skipped.push({
        line_id: line.id,
        ingredient_name: ing.name,
        unit: unit ?? undefined,
        qty,
        reason: 'BAD_QTY',
        detail: 'qty is null/0',
      })
      continue
    }

    if (!hasAnyNutrition(ing)) {
      diag.skipped_lines++
      diag.skipped.push({
        line_id: line.id,
        ingredient_name: ing.name,
        unit: unit ?? undefined,
        qty,
        reason: 'MISSING_NUTRITION',
        detail: 'all nutrition per 100g are null/0',
      })
      continue
    }

    const g = toGrams(qty, unit, ing)
    if (g.grams == null) {
      diag.skipped_lines++
      diag.skipped.push({
        line_id: line.id,
        ingredient_name: ing.name,
        unit: g.unit ?? unit ?? undefined,
        qty,
        reason: g.reason ?? 'UNSUPPORTED_UNIT',
        detail: g.detail,
      })
      continue
    }

    // accumulate
    totals.kcal += per100ToTotal(ing.kcal_per_100g ?? 0, g.grams)
    totals.protein_g += per100ToTotal(ing.protein_per_100g ?? 0, g.grams)
    totals.carbs_g += per100ToTotal(ing.carbs_per_100g ?? 0, g.grams)
    totals.fat_g += per100ToTotal(ing.fat_per_100g ?? 0, g.grams)

    diag.used_lines++
  }

  // round for UI
  totals.kcal = round2(totals.kcal)
  totals.protein_g = round2(totals.protein_g)
  totals.carbs_g = round2(totals.carbs_g)
  totals.fat_g = round2(totals.fat_g)

  return { totals, diagnostics: diag }
}
