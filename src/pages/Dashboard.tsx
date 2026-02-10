import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Recipe = { id: string; name: string; portions: number; yield_qty: number | null; yield_unit: string | null; is_archived: boolean; is_subrecipe: boolean }
type Line = { recipe_id: string; ingredient_id: string | null; sub_recipe_id: string | null; qty: number; unit: string }
type Ingredient = { id: string; name?: string | null; pack_unit?: string | null; net_unit_cost?: number | null; is_active?: boolean }

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function safeUnit(u: string) {
  const x = (u ?? '').trim().toLowerCase()
  return x || 'g'
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

  useEffect(() => { load() }, [])

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

  const recipeTotalCost = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of recipes) totals.set(r.id, 0)

    const maxPass = 10
    for (let pass = 0; pass < maxPass; pass++) {
      let changed = false

      for (const r of recipes) {
        const rLines = lines.filter((l) => l.recipe_id === r.id)
        let sum = 0

        for (const l of rLines) {
          const qty = toNum(l.qty, 0)

          if (l.ingredient_id) {
            const ing = ingById.get(l.ingredient_id)
            const packUnit = safeUnit(ing?.pack_unit ?? 'g')
            const net = toNum(ing?.net_unit_cost, 0)
            const conv = convertQty(qty, l.unit, packUnit)
            sum += conv.value * net
            continue
          }

          if (l.sub_recipe_id) {
            const sub = recipeById.get(l.sub_recipe_id)
            const subTotal = totals.get(l.sub_recipe_id) ?? 0
            const u = safeUnit(l.unit)

            if (sub) {
              const subPortions = Math.max(1, toNum(sub.portions, 1))
              const cpp = subTotal / subPortions

              if (u === 'portion') {
                sum += qty * cpp
                continue
              }

              const yq = toNum(sub.yield_qty, 0)
              const yu = safeUnit(sub.yield_unit ?? '')
              if (yq > 0 && yu) {
                const costPerYieldUnit = subTotal / yq
                const conv = convertQty(qty, l.unit, yu)
                sum += conv.value * costPerYieldUnit
                continue
              }

              sum += qty * cpp
              continue
            }
          }
        }

        const prev = totals.get(r.id) ?? 0
        if (Math.abs(prev - sum) > 1e-9) {
          totals.set(r.id, sum)
          changed = true
        }
      }

      if (!changed) break
    }

    return totals
  }, [recipes, lines, ingById, recipeById])

  const activeRecipes = useMemo(() => recipes.filter((r) => !r.is_archived), [recipes])
  const activeIngredientsCount = useMemo(() => ingredients.filter((i) => (i.is_active ?? true)).length, [ingredients])

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
    let best: { name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotalCost.get(r.id) ?? 0
      if (!best || total > best.total) best = { name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotalCost])

  const subRecipeCount = useMemo(() => recipes.filter((r) => r.is_subrecipe && !r.is_archived).length, [recipes])

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="gc-label">DASHBOARD (UPGRADE D)</div>
        <div className="mt-2 text-2xl font-extrabold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">KPIs with sub-recipe costing and unit conversion.</div>
      </div>

      {loading && <div className="gc-card p-6">Loading…</div>}
      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
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

          <div className="gc-card p-5 md:col-span-4">
            <div className="gc-label">MOST EXPENSIVE RECIPE</div>
            <div className="mt-2 text-lg font-extrabold">{mostExpensiveRecipe?.name ?? '—'}</div>
            <div className="mt-1 text-xs text-neutral-500">{money(mostExpensiveRecipe?.total ?? 0)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
