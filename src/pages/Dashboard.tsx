import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  name: string
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_archived: boolean
  is_subrecipe: boolean
}

type Line = {
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function unitFamily(u: string) {
  const x = safeUnit(u)
  if (x === 'g' || x === 'kg') return 'mass'
  if (x === 'ml' || x === 'l') return 'volume'
  if (x === 'pcs') return 'count'
  if (x === 'portion') return 'portion'
  return 'other'
}

function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const from = safeUnit(fromUnit)
  const to = safeUnit(toUnit)
  if (from === to) return { ok: true, value: qty }

  const ff = unitFamily(from)
  const tf = unitFamily(to)
  if (ff !== tf) return { ok: false, value: qty }

  if (ff === 'mass') {
    if (from === 'g' && to === 'kg') return { ok: true, value: qty / 1000 }
    if (from === 'kg' && to === 'g') return { ok: true, value: qty * 1000 }
  }
  if (ff === 'volume') {
    if (from === 'ml' && to === 'l') return { ok: true, value: qty / 1000 }
    if (from === 'l' && to === 'ml') return { ok: true, value: qty * 1000 }
  }

  // pcs/portion/other: no conversion
  return { ok: true, value: qty }
}

function money(n: number, currency = 'USD') {
  const v = Number.isFinite(n) ? n : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data: r, error: re } = await supabase
        .from('recipes')
        .select('id,name,portions,yield_qty,yield_unit,is_archived,is_subrecipe')
      if (re) throw re

      const { data: l, error: le } = await supabase
        .from('recipe_lines')
        .select('recipe_id,ingredient_id,sub_recipe_id,qty,unit')
      if (le) throw le

      const { data: i, error: ie } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
      if (ie) throw ie

      setRecipes((r ?? []) as Recipe[])
      setLines((l ?? []) as Line[])
      setIngredients((i ?? []) as Ingredient[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])

  const activeRecipes = useMemo(() => recipes.filter((r) => !r.is_archived), [recipes])
  const activeIngredientsCount = useMemo(() => ingredients.filter((i) => i.is_active !== false).length, [ingredients])
  const subRecipeCount = useMemo(() => recipes.filter((r) => r.is_subrecipe && !r.is_archived).length, [recipes])

  // === cost engine with diagnostics ===
  const costEngine = useMemo(() => {
    const totals = new Map<string, number>()
    const diag = {
      unitMismatchCount: 0,
      missingYieldSubrecipeCount: 0,
      missingIngredientCostCount: 0,
    }

    for (const r of recipes) totals.set(r.id, 0)

    const linesByRecipe = new Map<string, Line[]>()
    for (const l of lines) {
      if (!linesByRecipe.has(l.recipe_id)) linesByRecipe.set(l.recipe_id, [])
      linesByRecipe.get(l.recipe_id)!.push(l)
    }

    const maxPass = 12
    for (let pass = 0; pass < maxPass; pass++) {
      let changed = false

      for (const r of recipes) {
        const rLines = linesByRecipe.get(r.id) ?? []
        let sum = 0

        for (const l of rLines) {
          const qty = Math.max(0, toNum(l.qty, 0))
          const u = safeUnit(l.unit)

          // Ingredient line
          if (l.ingredient_id) {
            const ing = ingById.get(l.ingredient_id)
            if (!ing || ing.is_active === false) continue

            const net = toNum(ing.net_unit_cost, 0)
            const packUnit = safeUnit(ing.pack_unit ?? 'g')

            if (!Number.isFinite(net) || net <= 0) {
              diag.missingIngredientCostCount += 1
              continue
            }

            const conv = convertQty(qty, u, packUnit)
            if (!conv.ok) diag.unitMismatchCount += 1

            sum += conv.value * net
            continue
          }

          // Sub-recipe line
          if (l.sub_recipe_id) {
            const sub = recipeById.get(l.sub_recipe_id)
            const subTotal = totals.get(l.sub_recipe_id) ?? 0

            if (!sub) continue
            const subPortions = Math.max(1, toNum(sub.portions, 1))
            const subCpp = subTotal / subPortions

            // If line uses "portion"
            if (u === 'portion') {
              sum += qty * subCpp
              continue
            }

            // If subrecipe has yield => use yield-based costing
            const yq = toNum(sub.yield_qty, 0)
            const yu = safeUnit(sub.yield_unit ?? '')

            if (yq > 0 && yu && (unitFamily(u) === unitFamily(yu))) {
              const costPerYieldUnit = subTotal / yq
              const conv = convertQty(qty, u, yu)
              if (!conv.ok) diag.unitMismatchCount += 1
              sum += conv.value * costPerYieldUnit
              continue
            }

            // Missing yield (but line is not portion)
            if (sub.is_subrecipe) diag.missingYieldSubrecipeCount += 1

            // Fallback to cpp
            sum += qty * subCpp
            continue
          }
        }

        const prev = totals.get(r.id) ?? 0
        if (Math.abs(prev - sum) > 1e-7) {
          totals.set(r.id, sum)
          changed = true
        }
      }

      if (!changed) break
    }

    return { totals, diag }
  }, [recipes, lines, ingById, recipeById])

  const recipeTotalCost = costEngine.totals
  const diag = costEngine.diag

  const avgCostPerPortion = useMemo(() => {
    if (activeRecipes.length === 0) return 0
    const cps = activeRecipes.map((r) => {
      const total = recipeTotalCost.get(r.id) ?? 0
      const portions = Math.max(1, toNum(r.portions, 1))
      return total / portions
    })
    return cps.reduce((a, b) => a + b, 0) / cps.length
  }, [activeRecipes, recipeTotalCost])

  const mostExpensiveRecipe = useMemo(() => {
    let best: { id: string; name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotalCost.get(r.id) ?? 0
      if (!best || total > best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotalCost])

  const cheapestRecipe = useMemo(() => {
    let best: { id: string; name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotalCost.get(r.id) ?? 0
      if (!best || total < best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotalCost])

  const totalActiveCost = useMemo(() => {
    return activeRecipes.reduce((sum, r) => sum + (recipeTotalCost.get(r.id) ?? 0), 0)
  }, [activeRecipes, recipeTotalCost])

  const top5 = useMemo(() => {
    return [...activeRecipes]
      .map((r) => ({
        id: r.id,
        name: r.name,
        total: recipeTotalCost.get(r.id) ?? 0,
        cpp: (recipeTotalCost.get(r.id) ?? 0) / Math.max(1, toNum(r.portions, 1)),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [activeRecipes, recipeTotalCost])

  const subRecipesMissingYield = useMemo(() => {
    return recipes
      .filter((r) => r.is_subrecipe && !r.is_archived)
      .filter((r) => toNum(r.yield_qty, 0) <= 0 || !safeUnit(r.yield_unit ?? ''))
  }, [recipes])

  // Detect insane costs (to help you debug pack_unit/net_unit_cost)
  const hasOutliers = useMemo(() => {
    const big = top5.find((x) => x.total > 10000) // threshold
    return !!big
  }, [top5])

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="gc-label">DASHBOARD (UPGRADE PRO)</div>
        <div className="mt-2 text-2xl font-extrabold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">KPIs + diagnostics (yield-based sub-recipes + unit checks).</div>
      </div>

      {loading && <div className="gc-card p-6">Loading…</div>}

      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <>
          {hasOutliers && (
            <div className="gc-card p-6">
              <div className="gc-label">WARNING</div>
              <div className="mt-2 text-sm text-amber-700">
                Some recipe costs are extremely high. This is usually caused by an incorrect <span className="font-semibold">pack_unit</span> or{' '}
                <span className="font-semibold">net_unit_cost</span> (e.g., cost per kg but pack_unit set to g).
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="gc-card p-5">
              <div className="gc-label">RECIPES</div>
              <div className="mt-2 text-2xl font-extrabold">{activeRecipes.length}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">SUB-RECIPES</div>
              <div className="mt-2 text-2xl font-extrabold">{subRecipeCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">INGREDIENTS</div>
              <div className="mt-2 text-2xl font-extrabold">{activeIngredientsCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">AVG COST / PORTION</div>
              <div className="mt-2 text-2xl font-extrabold">{money(avgCostPerPortion)}</div>
              <div className="mt-1 text-xs text-neutral-500">Across active recipes</div>
            </div>

            <div className="gc-card p-5 md:col-span-2">
              <div className="gc-label">TOTAL ACTIVE COST</div>
              <div className="mt-2 text-2xl font-extrabold">{money(totalActiveCost)}</div>
              <div className="mt-1 text-xs text-neutral-500">Sum of all active recipe totals</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">CHEAPEST RECIPE</div>
              <div className="mt-2 text-lg font-extrabold">{cheapestRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(cheapestRecipe?.total ?? 0)}</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">MOST EXPENSIVE</div>
              <div className="mt-2 text-lg font-extrabold">{mostExpensiveRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(mostExpensiveRecipe?.total ?? 0)}</div>
            </div>

            <div className="gc-card p-5 md:col-span-4">
              <div className="gc-label">TOP 5 RECIPES BY TOTAL COST</div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="grid grid-cols-[1.2fr_.6fr_.6fr] gap-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
                  <div>Recipe</div>
                  <div className="text-right">Total</div>
                  <div className="text-right">Cost/Portion</div>
                </div>
                <div className="divide-y divide-neutral-200">
                  {top5.map((x) => (
                    <div key={x.id} className="grid grid-cols-[1.2fr_.6fr_.6fr] items-center px-4 py-3 text-sm">
                      <div className="font-semibold">{x.name}</div>
                      <div className="text-right">{money(x.total)}</div>
                      <div className="text-right">{money(x.cpp)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="gc-card p-5 md:col-span-4">
              <div className="gc-label">DIAGNOSTICS</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-neutral-600">Unit mismatches</div>
                  <div className="mt-1 text-2xl font-extrabold">{diag.unitMismatchCount}</div>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-neutral-600">Missing yield (sub-recipes)</div>
                  <div className="mt-1 text-2xl font-extrabold">{subRecipesMissingYield.length}</div>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-neutral-600">Ingredients missing cost</div>
                  <div className="mt-1 text-2xl font-extrabold">{diag.missingIngredientCostCount}</div>
                </div>
              </div>

              {subRecipesMissingYield.length > 0 && (
                <div className="mt-4 text-sm text-amber-700">
                  Missing yield examples: {subRecipesMissingYield.slice(0, 6).map((x) => x.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
