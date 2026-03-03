import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/Skeleton'

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
  ingredient_id: string
  net_qty: number | null
  net_unit: string | null
}

type Ingredient = {
  id: string
  name: string
  net_unit_cost: number | null
  pack_unit: string | null
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
  const lastId = (() => {
    try {
      return localStorage.getItem('gc_last_recipe_id') || ''
    } catch {
      return ''
    }
  })()
  const lastName = (() => {
    try {
      return localStorage.getItem('gc_last_recipe_name') || ''
    } catch {
      return ''
    }
  })()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setErr(null)
      try {
        const { data: r, error: re } = await supabase
          .from('recipes')
          .select('id,name,portions,yield_qty,yield_unit,is_archived,is_subrecipe')
        if (re) throw re

        const { data: l, error: le } = await supabase
          .from('recipe_ingredients')
          .select('recipe_id,ingredient_id,net_qty,net_unit')
        if (le) throw le

        const { data: i, error: ie } = await supabase
          .from('ingredients')
          .select('id,name,net_unit_cost,pack_unit')
        if (ie) throw ie

        if (!alive) return
        setRecipes((r as any) ?? [])
        setLines((l as any) ?? [])
        setIngredients((i as any) ?? [])
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message ?? 'Failed to load dashboard')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  const activeRecipes = useMemo(() => recipes.filter((x) => !x.is_archived), [recipes])
  const subRecipeCount = useMemo(() => activeRecipes.filter((x) => x.is_subrecipe).length, [activeRecipes])

  const activeIngredientsCount = useMemo(() => ingredients.length, [ingredients])

  const recipeTotals = useMemo(() => {
    const ingMap = new Map<string, Ingredient>()
    for (const ing of ingredients) ingMap.set(ing.id, ing)

    const totals = new Map<string, number>()
    const perPortion = new Map<string, number>()
    const unitMismatch = new Set<string>()

    for (const r of activeRecipes) {
      totals.set(r.id, 0)
      perPortion.set(r.id, 0)
    }

    const byRecipe = new Map<string, Line[]>()
    for (const ln of lines) {
      if (!byRecipe.has(ln.recipe_id)) byRecipe.set(ln.recipe_id, [])
      byRecipe.get(ln.recipe_id)!.push(ln)
    }

    for (const r of activeRecipes) {
      const rows = byRecipe.get(r.id) ?? []
      let total = 0
      for (const ln of rows) {
        const ing = ingMap.get(ln.ingredient_id)
        if (!ing) continue
        const netCost = Number(ing.net_unit_cost ?? 0)
        const qty = Number(ln.net_qty ?? 0)
        const fromUnit = safeUnit(ln.net_unit ?? ing.pack_unit ?? 'g')
        const toUnit = safeUnit(ing.pack_unit ?? 'g')

        const conv = convertQty(qty, fromUnit, toUnit)
        if (!conv.ok) unitMismatch.add(ing.id)

        total += Math.max(0, conv.value) * Math.max(0, netCost)
      }
      totals.set(r.id, total)

      const portions = Math.max(1, Number(r.portions ?? 1))
      perPortion.set(r.id, total / portions)
    }

    return { totals, perPortion, unitMismatchCount: unitMismatch.size }
  }, [activeRecipes, lines, ingredients])

  const totalActiveCost = useMemo(() => {
    let s = 0
    for (const r of activeRecipes) s += recipeTotals.totals.get(r.id) ?? 0
    return s
  }, [activeRecipes, recipeTotals])

  const avgCostPerPortion = useMemo(() => {
    if (activeRecipes.length === 0) return 0
    let s = 0
    for (const r of activeRecipes) s += recipeTotals.perPortion.get(r.id) ?? 0
    return s / activeRecipes.length
  }, [activeRecipes, recipeTotals])

  const cheapestRecipe = useMemo(() => {
    let best: any = null
    for (const r of activeRecipes) {
      const total = recipeTotals.totals.get(r.id) ?? 0
      if (!best || total < best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotals])

  const mostExpensiveRecipe = useMemo(() => {
    let best: any = null
    for (const r of activeRecipes) {
      const total = recipeTotals.totals.get(r.id) ?? 0
      if (!best || total > best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotals])

  const top5 = useMemo(() => {
    const arr = activeRecipes
      .map((r) => ({
        id: r.id,
        name: r.name,
        total: recipeTotals.totals.get(r.id) ?? 0,
        cpp: recipeTotals.perPortion.get(r.id) ?? 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
    return arr
  }, [activeRecipes, recipeTotals])

  const diag = useMemo(() => {
    return { unitMismatchCount: recipeTotals.unitMismatchCount }
  }, [recipeTotals])

  const ingredientsUsedMissingCost = useMemo(() => {
    const ingMap = new Map<string, Ingredient>()
    for (const ing of ingredients) ingMap.set(ing.id, ing)

    const used = new Set<string>()
    for (const ln of lines) {
      const ing = ingMap.get(ln.ingredient_id)
      if (!ing) continue
      const net = Number(ing.net_unit_cost ?? 0)
      if (!Number.isFinite(net) || net <= 0) used.add(ing.id)
    }
    return used.size
  }, [ingredients, lines])

  const subRecipesMissingYield = useMemo(() => {
    return activeRecipes.filter((r) => r.is_subrecipe && (!r.yield_qty || r.yield_qty <= 0))
  }, [activeRecipes])

  const hasOutliers = useMemo(() => {
    // "extremely high" heuristic
    return avgCostPerPortion > 200 || totalActiveCost > 5000
  }, [avgCostPerPortion, totalActiveCost])

  return (
    <div className="gc-dashboard space-y-6">
      <div className="gc-card p-6 gc-page-header">
        <div className="gc-label">DASHBOARD</div>
        <div className="mt-2 text-2xl font-extrabold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">Your kitchen snapshot: recipes, ingredients, and cost diagnostics.</div>
      </div>

      <div className="gc-card is-interactive p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Continue Cooking</div>
          <div className="mt-1 text-xs text-neutral-600">
            {lastId ? (
              <>
                Jump back to <span className="font-semibold">{lastName || 'your last recipe'}</span>.
              </>
            ) : (
              <>Open Recipes and start cooking.</>
            )}
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
            <Button variant="ghost" onClick={() => nav(`/recipe?id=${encodeURIComponent(lastId)}`)}>
              Open Editor
            </Button>
          ) : null}
        </div>
      </div>

      {/* ✅ Skeleton Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {/* 4 small KPI cards */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="gc-card is-interactive p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="h-4 w-28 rounded-md" />
                </div>
                <div className="mt-3">
                  <Skeleton className="h-8 w-28 rounded-lg" />
                  <div className="mt-2">
                    <Skeleton className="h-3 w-24 rounded-md" />
                  </div>
                </div>
              </div>
            ))}

            {/* One medium KPI (md:col-span-2) */}
            <div className="gc-card is-interactive p-5 md:col-span-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-2xl" />
                <Skeleton className="h-4 w-44 rounded-md" />
              </div>
              <div className="mt-3">
                <Skeleton className="h-8 w-44 rounded-lg" />
                <div className="mt-2">
                  <Skeleton className="h-3 w-64 rounded-md" />
                </div>
              </div>
            </div>

            {/* 2 small KPI cards */}
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={`kpi2-${i}`} className="gc-card is-interactive p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="h-4 w-32 rounded-md" />
                </div>
                <div className="mt-3">
                  <Skeleton className="h-6 w-40 rounded-lg" />
                  <div className="mt-2">
                    <Skeleton className="h-3 w-24 rounded-md" />
                  </div>
                </div>
              </div>
            ))}

            {/* Top 5 table card (md:col-span-4) */}
            <div className="gc-card is-interactive p-5 md:col-span-4">
              <Skeleton className="h-4 w-56 rounded-md" />
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-44 rounded-md" />
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-4 w-28 rounded-md" />
                </div>
                {Array.from({ length: 5 }).map((_, r) => (
                  <div key={r} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-1/2 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded-md" />
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostics card (md:col-span-4) */}
            <div className="gc-card is-interactive p-5 md:col-span-4">
              <Skeleton className="h-4 w-32 rounded-md" />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <Skeleton className="h-3 w-40 rounded-md" />
                    <div className="mt-2">
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                    <div className="mt-3">
                      <Skeleton className="h-3 w-full rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="gc-card is-interactive p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <>
          {activeRecipes.length === 0 && activeIngredientsCount === 0 && (
            <div className="gc-card is-interactive p-6">
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
            <div className="gc-card is-interactive p-6">
              <div className="gc-label">WARNING</div>
              <div className="mt-2 text-sm text-amber-700">
                Some recipe costs are extremely high. This is usually caused by an incorrect{' '}
                <span className="font-semibold">pack_unit</span> or <span className="font-semibold">net_unit_cost</span>{' '}
                (e.g., cost per kg but pack_unit set to g).
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🍳
                </span>
                <div className="gc-label">RECIPES</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{activeRecipes.length}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🧩
                </span>
                <div className="gc-label">SUB-RECIPES</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{subRecipeCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🧂
                </span>
                <div className="gc-label">INGREDIENTS</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{activeIngredientsCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Active</div>
            </div>

            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  💵
                </span>
                <div className="gc-label">AVG COST / PORTION</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{money(avgCostPerPortion)}</div>
              <div className="mt-1 text-xs text-neutral-500">Across active recipes</div>
            </div>

            <div className="gc-card is-interactive p-5 md:col-span-2">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  ∑
                </span>
                <div className="gc-label">TOTAL ACTIVE COST</div>
              </div>
              <div className="mt-2 text-2xl font-extrabold">{money(totalActiveCost)}</div>
              <div className="mt-1 text-xs text-neutral-500">Sum of all active recipe totals</div>
            </div>

            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🟢
                </span>
                <div className="gc-label">CHEAPEST RECIPE</div>
              </div>
              <div className="mt-2 text-lg font-extrabold">{cheapestRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(cheapestRecipe?.total ?? 0)}</div>
            </div>

            <div className="gc-card is-interactive p-5">
              <div className="gc-kpi-head">
                <span className="gc-kpi-ico" aria-hidden>
                  🔴
                </span>
                <div className="gc-label">MOST EXPENSIVE</div>
              </div>
              <div className="mt-2 text-lg font-extrabold">{mostExpensiveRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(mostExpensiveRecipe?.total ?? 0)}</div>
            </div>

            <div className="gc-card is-interactive p-5 md:col-span-4">
              <div className="gc-label">TOP 5 RECIPES BY TOTAL COST</div>
              <div className="mt-3 gc-data-table-wrap">
                <table className="gc-data-table text-sm">
                  <thead>
                    <tr>
                      <th>Recipe</th>
                      <th className="gc-th-right" style={{ width: 160 }}>
                        Total
                      </th>
                      <th className="gc-th-right" style={{ width: 160 }}>
                        Cost/Portion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((x) => (
                      <tr key={x.id}>
                        <td className="font-semibold">{x.name}</td>
                        <td className="gc-td-right">{money(x.total)}</td>
                        <td className="gc-td-right">{money(x.cpp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gc-card is-interactive p-5 md:col-span-4">
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
