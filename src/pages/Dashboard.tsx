import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useKitchen } from '../lib/kitchen'
import { seedDemoData } from '../lib/demoSeed'
import EmptyState from '../components/EmptyState'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'

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
  const nav = useNavigate()
  const kitchen = useKitchen()
  const [toast, setToast] = useState<string | null>(null)
  const lastId = (() => {
    try { return localStorage.getItem('gc_last_recipe_id') || '' } catch { return '' }
  })()
  const lastName = (() => {
    try { return localStorage.getItem('gc_last_recipe_name') || '' } catch { return '' }
  })()

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
  }, [kitchen.loading, kitchen.kitchenId])

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

  // ✅ FIX (Metric): DISTINCT ingredients USED IN non-archived recipes missing a valid cost.
  // Definition:
  // - DISTINCT ingredient_id referenced by recipe_lines where parent recipe is NOT archived.
  // - Missing cost = ingredient net_unit_cost is null/undefined/NaN OR <= 0.
  const ingredientsUsedMissingCost = useMemo(() => {
    const activeRecipeIds = new Set(activeRecipes.map((r) => r.id))
    const used = new Set<string>()
    for (const l of lines) {
      if (!activeRecipeIds.has(l.recipe_id)) continue
      if (!l.ingredient_id) continue
      used.add(l.ingredient_id)
    }

    const byId = new Map<string, Ingredient>()
    for (const ing of ingredients) byId.set(ing.id, ing)

    let c = 0
    for (const id of used) {
      const v = Number(byId.get(id)?.net_unit_cost)
      if (!Number.isFinite(v) || v <= 0) c += 1
    }
    return c
  }, [activeRecipes, lines, ingredients])

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
    <div className="gc-dashboard space-y-6">
      <div className="gc-card p-6 gc-page-header">
        <div className="gc-label">DASHBOARD</div>
        <div className="mt-2 text-2xl font-extrabold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">Your kitchen snapshot: recipes, ingredients, and cost diagnostics.</div>
      </div>

      {(!loading && (recipes?.length ?? 0) === 0) ? (
        <EmptyState
          title="No recipes yet"
          subtitle="Create your first recipe, or load demo data to explore the full workflow (editor → cost → print)."
        >
          <Button onClick={() => nav('/recipes')}>Create Recipe</Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                if (!kitchen.kitchenId) return
                setToast('Loading demo data…')
                const res = await seedDemoData(kitchen.kitchenId)
                setToast(res.skipped ? 'Demo data already loaded.' : `Demo loaded: ${res.createdRecipes} recipes.`)
                // refresh by nudging lastId
                try { localStorage.removeItem('gc_last_recipe_id') } catch {}
              } catch (e: any) {
                setToast(e?.message || 'Failed to load demo data')
              }
            }}
          >
            Load Demo Data
          </Button>
        </EmptyState>
      ) : null}

      <div className="gc-card p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Continue Cooking</div>
          <div className="mt-1 text-xs text-neutral-600">
            {lastId ? <>Jump back to <span className="font-semibold">{lastName || 'your last recipe'}</span>.</> : <>Open Recipes and start cooking.</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (lastId) nav(`/cook?id=${encodeURIComponent(lastId)}`)
              else nav('/recipes')
            }}
          >
            Continue Cooking 🍳
          </Button>
          {lastId ? (
            <Button
              variant="ghost"
              onClick={() => nav(`/recipe?id=${encodeURIComponent(lastId)}`)}
            >
              Open Editor
            </Button>
          ) : null}
        </div>
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
          {activeRecipes.length === 0 && activeIngredientsCount === 0 && (
            <div className="gc-card p-6">
              <div className="gc-empty">
                <div className="gc-empty-ico">✨</div>
                <div>
                  <div className="text-lg font-extrabold">You’re one minute away from WOW.</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    Add a few ingredients, then create your first recipe. This dashboard will instantly show cost insights.
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    <div className="gc-empty-step">
                      <span className="gc-empty-dot">1</span>
                      <span>Add 5–10 ingredients (with pack unit + net cost)</span>
                    </div>
                    <div className="gc-empty-step">
                      <span className="gc-empty-dot">2</span>
                      <span>Create 1 recipe and add ingredients</span>
                    </div>
                    <div className="gc-empty-step">
                      <span className="gc-empty-dot">3</span>
                      <span>Return here to see Top Costs + Diagnostics</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🍳
                </span>
                <div className="gc-label">RECIPES</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{activeRecipes.length}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🧩
                </span>
                <div className="gc-label">SUB-RECIPES</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{subRecipeCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🧂
                </span>
                <div className="gc-label">INGREDIENTS</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{activeIngredientsCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  💵
                </span>
                <div className="gc-label">AVG COST / PORTION</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{money(avgCostPerPortion)}</div>
              <div className="mt-1 text-xs text-neutral-500">Across active recipes</div>
            </div>

            <div className="gc-card p-5 md:col-span-2">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  ∑
                </span>
                <div className="gc-label">TOTAL ACTIVE COST</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{money(totalActiveCost)}</div>
              <div className="mt-1 text-xs text-neutral-500">Sum of all active recipe totals</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🟢
                </span>
                <div className="gc-label">CHEAPEST RECIPE</div>
              </div>
              <div className="mt-2 text-lg font-extrabold">{cheapestRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(cheapestRecipe?.total ?? 0)}</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🔴
                </span>
                <div className="gc-label">MOST EXPENSIVE</div>
              </div>
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
                  <div className="text-xs font-semibold text-neutral-600">Ingredients used in recipes missing cost</div>
                  <div className="mt-1 text-2xl font-extrabold">{ingredientsUsedMissingCost}</div>
                  <div className="mt-2 text-xs text-neutral-500">
                    DISTINCT ingredients referenced in non-archived recipe lines with missing or ≤ 0 net unit cost.
                  </div>
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
