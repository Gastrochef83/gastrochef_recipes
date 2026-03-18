// src/pages/Dashboard.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'

// استيراد أنماط التصميم
import '../styles/tokens.css'
import '../styles/globals.css'

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

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const [
        { data: r, error: re },
        { data: i, error: ie }
      ] = await Promise.all([
        supabase
          .from('recipes')
          .select('id,name,portions,yield_qty,yield_unit,is_archived,is_subrecipe'),
        supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost,is_active')
      ])
      if (re) throw re
      if (ie) throw ie

      const { data: l, error: le } = await supabase
        .from('recipe_lines')
        .select('recipe_id,ingredient_id,sub_recipe_id,qty,unit')
      if (le) throw le

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
  const activeIngredientsCount = useMemo(
    () => ingredients.filter((i) => i.is_active !== false).length,
    [ingredients]
  )
  const subRecipeCount = useMemo(
    () => recipes.filter((r) => r.is_subrecipe && !r.is_archived).length,
    [recipes]
  )

  type CostEngineResult = {
    totals: Map<string, number>
    diag: {
      unitMismatchCount: number
      missingYieldSubrecipeCount: number
      missingIngredientCostCount: number
    }
  }

  const [costEngine, setCostEngine] = useState<CostEngineResult | null>(null)
  const [costEngineLoading, setCostEngineLoading] = useState(false)

  const computeCostEngine = useCallback((): CostEngineResult => {
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

          if (l.sub_recipe_id) {
            const sub = recipeById.get(l.sub_recipe_id)
            const subTotal = totals.get(l.sub_recipe_id) ?? 0
            if (!sub) continue

            const subPortions = Math.max(1, toNum(sub.portions, 1))
            const subCpp = subTotal / subPortions

            if (u === 'portion') {
              sum += qty * subCpp
              continue
            }

            const yq = toNum(sub.yield_qty, 0)
            const yu = safeUnit(sub.yield_unit ?? '')

            if (yq > 0 && yu && unitFamily(u) === unitFamily(yu)) {
              const costPerYieldUnit = subTotal / yq
              const conv = convertQty(qty, u, yu)
              if (!conv.ok) diag.unitMismatchCount += 1
              sum += conv.value * costPerYieldUnit
              continue
            }

            if (sub.is_subrecipe) diag.missingYieldSubrecipeCount += 1
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

  useEffect(() => {
    if (loading || err) return

    let cancelled = false
    setCostEngineLoading(true)

    const t = window.setTimeout(() => {
      if (cancelled) return
      try {
        const res = computeCostEngine()
        setCostEngine(res)
      } finally {
        if (!cancelled) setCostEngineLoading(false)
      }
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [loading, err, computeCostEngine])


  const recipeTotalCost = costEngine?.totals ?? new Map<string, number>()
  const diag =
    costEngine?.diag ??
    {
      unitMismatchCount: 0,
      missingYieldSubrecipeCount: 0,
      missingIngredientCostCount: 0,
    }

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

  const hasOutliers = useMemo(() => {
    const big = top5.find((x) => x.total > 10000)
    return !!big
  }, [top5])

  return (
    <div className="gc-dashboard">
      {/* Header */}
      <div className="gc-card gc-page-header">
        <div className="gc-card-body">
          <div className="gc-label">DASHBOARD</div>
          <div className="gc-page-title">Overview</div>
          <div className="gc-hint" style={{ marginTop: 'var(--gc-8)' }}>
            Your kitchen snapshot: recipes, ingredients, and cost diagnostics.
          </div>
        </div>
      </div>

      {/* Continue Cooking Card */}
      <div className="gc-card is-interactive" style={{ marginTop: 'var(--gc-16)' }}>
        <div className="gc-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--gc-12)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--gc-fs-lg)' }}>Continue Cooking</div>
            <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>
              {lastId ? (
                <>
                  Jump back to <span style={{ fontWeight: 800 }}>{lastName || 'your last recipe'}</span>.
                </>
              ) : (
                <>Open Recipes and start cooking.</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
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
      </div>

      {/* Skeleton Loading */}
      {loading && (
        <div style={{ marginTop: 'var(--gc-16)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gc-16)' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="gc-card is-interactive">
                <div className="gc-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-12)' }}>
                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 'var(--gc-radius)' }} />
                    <div className="skeleton" style={{ width: 112, height: 16 }} />
                  </div>
                  <div style={{ marginTop: 'var(--gc-12)' }}>
                    <div className="skeleton" style={{ width: 112, height: 32 }} />
                    <div style={{ marginTop: 'var(--gc-8)' }}>
                      <div className="skeleton" style={{ width: 96, height: 12 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="gc-card is-interactive" style={{ marginTop: 'var(--gc-16)' }}>
            <div className="gc-card-body">
              <div className="skeleton" style={{ width: 224, height: 16 }} />
              <div style={{ marginTop: 'var(--gc-16)' }}>
                {Array.from({ length: 5 }).map((_, r) => (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: r === 0 ? 0 : 'var(--gc-12)' }}>
                    <div className="skeleton" style={{ width: '40%', height: 16 }} />
                    <div className="skeleton" style={{ width: 112, height: 16 }} />
                    <div className="skeleton" style={{ width: 112, height: 16 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {err && (
        <div style={{ marginTop: 'var(--gc-16)' }}>
          <ErrorState
            title="We couldn't load your dashboard"
            message="Please check your connection and try again."
            details={err}
            onRetry={load}
            variant="banner"
          />
        </div>
      )}

      {/* Main Content */}
      {!loading && !err && (
        <>
          {/* Empty States */}
          {activeRecipes.length === 0 && activeIngredientsCount === 0 && (
            <div style={{ marginTop: 'var(--gc-16)' }}>
              <EmptyState
                title="Your kitchen is ready"
                description="Add a few ingredients, then create your first recipe. This dashboard will instantly show cost insights."
                primaryAction={{
                  label: 'Add Ingredient',
                  onClick: () => nav('/ingredients')
                }}
                secondaryAction={{
                  label: 'Create Recipe',
                  onClick: () => nav('/recipes')
                }}
                icon="✨"
              />
            </div>
          )}

          {activeRecipes.length === 0 && activeIngredientsCount > 0 && (
            <div style={{ marginTop: 'var(--gc-16)' }}>
              <EmptyState
                title="Create your first recipe"
                description="You already have ingredients. Now create a recipe and the dashboard will show costs, food cost %, and margins."
                primaryAction={{
                  label: 'Create Recipe',
                  onClick: () => nav('/recipes')
                }}
                secondaryAction={{
                  label: 'Add more ingredients',
                  onClick: () => nav('/ingredients')
                }}
                icon="🍳"
              />
            </div>
          )}

          {activeIngredientsCount === 0 && activeRecipes.length > 0 && (
            <div style={{ marginTop: 'var(--gc-16)' }}>
              <EmptyState
                title="Add ingredients to unlock costing"
                description="Recipes are ready, but ingredient costs are missing. Add ingredients (with pack size + price) to see accurate cost insights."
                primaryAction={{
                  label: 'Add Ingredient',
                  onClick: () => nav('/ingredients')
                }}
                secondaryAction={{
                  label: 'View recipes',
                  onClick: () => nav('/recipes')
                }}
                icon="🧂"
              />
            </div>
          )}

          {/* Warning Card */}
          {hasOutliers && (
            <div className="gc-card is-interactive" style={{ marginTop: 'var(--gc-16)' }}>
              <div className="gc-card-body">
                <div className="gc-label" style={{ color: 'var(--gc-warn)' }}>WARNING</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-8)', color: 'var(--gc-warn)' }}>
                  Some recipe costs are extremely high. This is usually caused by an incorrect{' '}
                  <span style={{ fontWeight: 800 }}>pack_unit</span> or <span style={{ fontWeight: 800 }}>net_unit_cost</span>{' '}
                  (e.g., cost per kg but pack_unit set to g).
                </div>
              </div>
            </div>
          )}

          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gc-16)', marginTop: 'var(--gc-16)' }}>
            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>🍳</span>
                  <div className="gc-label">RECIPES</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{activeRecipes.length}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>Active</div>
              </div>
            </div>

            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>🧩</span>
                  <div className="gc-label">SUB-RECIPES</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{subRecipeCount}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>Active</div>
              </div>
            </div>

            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>🧂</span>
                  <div className="gc-label">INGREDIENTS</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{activeIngredientsCount}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>Active</div>
              </div>
            </div>

            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>💵</span>
                  <div className="gc-label">AVG COST / PORTION</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{money(avgCostPerPortion)}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>Across active recipes</div>
              </div>
            </div>
          </div>

          {/* Second Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gc-16)', marginTop: 'var(--gc-16)' }}>
            <div className="gc-card is-interactive" style={{ gridColumn: 'span 2' }}>
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>∑</span>
                  <div className="gc-label">TOTAL ACTIVE COST</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{money(totalActiveCost)}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>Sum of all active recipe totals</div>
              </div>
            </div>

            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>🟢</span>
                  <div className="gc-label">CHEAPEST RECIPE</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{cheapestRecipe?.name ?? '—'}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>{money(cheapestRecipe?.total ?? 0)}</div>
              </div>
            </div>

            <div className="gc-card is-interactive">
              <div className="gc-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-8)' }}>
                  <span style={{ fontSize: 24 }}>🔴</span>
                  <div className="gc-label">MOST EXPENSIVE</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 950, marginTop: 'var(--gc-8)' }}>{mostExpensiveRecipe?.name ?? '—'}</div>
                <div className="gc-hint" style={{ marginTop: 'var(--gc-4)' }}>{money(mostExpensiveRecipe?.total ?? 0)}</div>
              </div>
            </div>
          </div>

          {/* Top 5 Table */}
          <div className="gc-card is-interactive" style={{ marginTop: 'var(--gc-16)' }}>
            <div className="gc-card-body">
              <div className="gc-label">TOP 5 RECIPES BY TOTAL COST</div>
              <div className="gc-data-table-wrap" style={{ marginTop: 'var(--gc-12)' }}>
                <table className="gc-data-table">
                  <thead>
                    <tr>
                      <th>Recipe</th>
                      <th className="gc-th-right">Total</th>
                      <th className="gc-th-right">Cost/Portion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((x) => (
                      <tr key={x.id}>
                        <td style={{ fontWeight: 800 }}>{x.name}</td>
                        <td className="gc-td-right">{money(x.total)}</td>
                        <td className="gc-td-right">{money(x.cpp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Diagnostics */}
          <div className="gc-card is-interactive" style={{ marginTop: 'var(--gc-16)' }}>
            <div className="gc-card-body">
              <div className="gc-label">DIAGNOSTICS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gc-12)', marginTop: 'var(--gc-8)' }}>
                <div className="gc-card-soft">
                  <div className="gc-card-body">
                    <div className="gc-hint" style={{ fontWeight: 800 }}>Unit mismatches</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-4)' }}>{diag.unitMismatchCount}</div>
                  </div>
                </div>
                <div className="gc-card-soft">
                  <div className="gc-card-body">
                    <div className="gc-hint" style={{ fontWeight: 800 }}>Missing yield (sub-recipes)</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-4)' }}>{subRecipesMissingYield.length}</div>
                  </div>
                </div>
                <div className="gc-card-soft">
                  <div className="gc-card-body">
                    <div className="gc-hint" style={{ fontWeight: 800 }}>Ingredients missing cost</div>
                    <div style={{ fontSize: 28, fontWeight: 950, marginTop: 'var(--gc-4)' }}>{ingredientsUsedMissingCost}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
