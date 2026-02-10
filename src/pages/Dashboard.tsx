import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Recipe = { id: string; portions: number; is_archived: boolean; name: string }
type Line = { recipe_id: string; ingredient_id: string; qty: number }
type Ingredient = { id: string; net_unit_cost?: number | null; is_active?: boolean; name?: string }

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
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
      const { data: r, error: re } = await supabase.from('recipes').select('id,name,portions,is_archived')
      if (re) throw re
      const { data: l, error: le } = await supabase.from('recipe_lines').select('recipe_id,ingredient_id,qty')
      if (le) throw le
      const { data: i, error: ie } = await supabase.from('ingredients').select('id,name,net_unit_cost,is_active')
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

  useEffect(() => { load() }, [])

  const ingCost = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of ingredients) m.set(i.id, toNum(i.net_unit_cost, 0))
    return m
  }, [ingredients])

  const recipeTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) {
      const c = toNum(l.qty, 0) * (ingCost.get(l.ingredient_id) ?? 0)
      m.set(l.recipe_id, (m.get(l.recipe_id) ?? 0) + c)
    }
    return m
  }, [lines, ingCost])

  const activeRecipes = useMemo(() => recipes.filter(r => !r.is_archived), [recipes])
  const activeIngredientsCount = useMemo(() => ingredients.filter(i => (i.is_active ?? true)).length, [ingredients])

  const avgCostPerPortion = useMemo(() => {
    const list = activeRecipes
    if (list.length === 0) return 0
    const cps = list.map(r => {
      const total = recipeTotals.get(r.id) ?? 0
      const portions = Math.max(1, toNum(r.portions, 1))
      return total / portions
    })
    return cps.reduce((a, b) => a + b, 0) / cps.length
  }, [activeRecipes, recipeTotals])

  const mostExpensiveRecipe = useMemo(() => {
    let best: { name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotals.get(r.id) ?? 0
      if (!best || total > best.total) best = { name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotals])

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="gc-label">DASHBOARD (MANAGEMENT)</div>
        <div className="mt-2 text-2xl font-extrabold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">High-level KPIs for recipes and ingredients.</div>
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
          <div className="grid gap-4 md:grid-cols-4">
            <div className="gc-card p-5">
              <div className="gc-label">RECIPES</div>
              <div className="mt-2 text-2xl font-extrabold">{activeRecipes.length}</div>
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

            <div className="gc-card p-5">
              <div className="gc-label">MOST EXPENSIVE</div>
              <div className="mt-2 text-lg font-extrabold">{mostExpensiveRecipe?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-neutral-500">{money(mostExpensiveRecipe?.total ?? 0)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
