import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type RecipeRow = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  is_subrecipe: boolean
  is_archived: boolean
  photo_url: string | null
  description: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price?: number | null
  currency?: string | null
  created_at?: string | null
  yield_qty?: number | null
  yield_unit?: string | null
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

type LineType = 'ingredient' | 'subrecipe' | 'group'

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  note: string | null
  sort_order: number
  line_type: LineType
  group_title: string | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function clampStr(s: string, max = 120) {
  const x = (s ?? '').trim()
  if (!x) return ''
  if (x.length <= max) return x
  return x.slice(0, max - 1) + '…'
}

function fmtMoney(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

// g<->kg , ml<->l , pcs only
function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const f = safeUnit(fromUnit)
  const t = safeUnit(toUnit)
  if (f === t) return { ok: true, value: qty }
  if (f === 'g' && t === 'kg') return { ok: true, value: qty / 1000 }
  if (f === 'kg' && t === 'g') return { ok: true, value: qty * 1000 }
  if (f === 'ml' && t === 'l') return { ok: true, value: qty / 1000 }
  if (f === 'l' && t === 'ml') return { ok: true, value: qty * 1000 }
  if (f === 'pcs' && t === 'pcs') return { ok: true, value: qty }
  return { ok: false, value: 0 }
}

// convert ingredient line qty to ingredient pack unit (same as editor)
function convertQtyToPackUnit(qty: number, lineUnit: string, packUnit: string) {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  let conv = qty
  if (u === 'g' && p === 'kg') conv = qty / 1000
  else if (u === 'kg' && p === 'g') conv = qty * 1000
  else if (u === 'ml' && p === 'l') conv = qty / 1000
  else if (u === 'l' && p === 'ml') conv = qty * 1000
  return conv
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RecipeRow[]>([])
  const [q, setQ] = useState('')

  // data for cost calc
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<RecipeRow[]>([])
  const [linesCache, setLinesCache] = useState<Record<string, Line[]>>({})

  // toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    try {
      // 1) recipes list (visible)
      const { data, error } = await supabase
        .from('recipes')
        .select(
          'id,kitchen_id,name,category,portions,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,created_at,yield_qty,yield_unit'
        )
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
      if (error) throw error

      const list = (data ?? []) as RecipeRow[]
      setRows(list)

      // 2) ingredients (for cost)
      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
        .order('name', { ascending: true })
      if (iErr) throw iErr
      setIngredients((i ?? []) as Ingredient[])

      // 3) all recipes in same kitchens (for subrecipe yield + currency)
      setAllRecipes(list)

      // 4) preload lines for visible recipes only
      const ids = list.map((r) => r.id)
      if (ids.length) {
        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
          .in('recipe_id', ids)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
        if (lErr) throw lErr

        const by: Record<string, Line[]> = {}
        for (const rid of ids) by[rid] = []
        for (const row of (l ?? []) as Line[]) {
          if (!by[row.recipe_id]) by[row.recipe_id] = []
          by[row.recipe_id].push(row)
        }
        setLinesCache((p) => ({ ...p, ...by }))
      }
    } catch (e: any) {
      showToast(e?.message ?? 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => {
      const a = (r.name ?? '').toLowerCase()
      const b = (r.category ?? '').toLowerCase()
      return a.includes(s) || b.includes(s)
    })
  }, [rows, q])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeRow>()
    for (const r of allRecipes) m.set(r.id, r)
    return m
  }, [allRecipes])

  const ensureLinesLoaded = async (rootRecipeId: string) => {
    const seen = new Set<string>()
    const queue: string[] = [rootRecipeId]
    const needFetch: string[] = []

    while (queue.length) {
      const rid = queue.shift()!
      if (seen.has(rid)) continue
      seen.add(rid)

      const cached = linesCache[rid]
      if (!cached) needFetch.push(rid)

      const linesHere = cached || []
      for (const l of linesHere) {
        if (l.line_type === 'subrecipe' && l.sub_recipe_id) queue.push(l.sub_recipe_id)
      }
    }

    if (needFetch.length === 0) return

    const { data, error } = await supabase
      .from('recipe_lines')
      .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
      .in('recipe_id', needFetch)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (error) throw error

    const by: Record<string, Line[]> = {}
    for (const rid of needFetch) by[rid] = []
    for (const row of (data ?? []) as Line[]) {
      if (!by[row.recipe_id]) by[row.recipe_id] = []
      by[row.recipe_id].push(row)
    }
    setLinesCache((p) => ({ ...p, ...by }))
  }

  const getRecipeTotalCost = (
    recipeId: string,
    visited: Set<string>
  ): { cost: number; warnings: string[] } => {
    const warnings: string[] = []
    if (visited.has(recipeId)) {
      warnings.push('Loop detected')
      return { cost: 0, warnings }
    }
    visited.add(recipeId)

    const rr = recipeById.get(recipeId)
    const rLines = linesCache[recipeId] ?? []
    let sum = 0

    for (const l of rLines) {
      if (l.line_type === 'group') continue

      if (l.line_type === 'ingredient') {
        if (!l.ingredient_id) continue
        const ing = ingById.get(l.ingredient_id)
        const net = toNum(ing?.net_unit_cost, 0)
        const packUnit = safeUnit(ing?.pack_unit ?? 'g')
        const conv = convertQtyToPackUnit(toNum(l.qty, 0), l.unit, packUnit)
        sum += conv * net
        continue
      }

      if (l.line_type === 'subrecipe') {
        if (!l.sub_recipe_id) continue
        const childId = l.sub_recipe_id
        const child = recipeById.get(childId)
        const childLines = linesCache[childId]

        if (!child || !childLines) {
          warnings.push('Sub-recipe not loaded')
          continue
        }

        const childRes = getRecipeTotalCost(childId, visited)
        for (const w of childRes.warnings) warnings.push(w)

        const yq = toNum(child.yield_qty, 0)
        const yu = safeUnit(child.yield_unit ?? '')
        if (yq <= 0 || !yu) {
          warnings.push('Missing yield')
          continue
        }

        const qtyParent = toNum(l.qty, 0)
        const conv = convertQty(qtyParent, l.unit, yu)
        if (!conv.ok) {
          warnings.push('Unit mismatch')
          continue
        }

        const costPerYieldUnit = childRes.cost / yq
        sum += conv.value * costPerYieldUnit
        continue
      }
    }

    visited.delete(recipeId)
    if (!rr) return { cost: sum, warnings }
    return { cost: sum, warnings }
  }

  const createNew = async () => {
    try {
      const kitchenId = rows[0]?.kitchen_id ?? 'default'
      const payload = {
        kitchen_id: kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 1,
        is_subrecipe: false,
        is_archived: false,
      }
      const { data, error } = await supabase.from('recipes').insert(payload).select('id').single()
      if (error) throw error

      const newId = (data as any)?.id
      showToast('Created ✅')
      if (newId) window.location.hash = `#/recipe?id=${newId}`
      else await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Create failed')
    }
  }

  const archive = async (id: string) => {
    try {
      const { error } = await supabase.from('recipes').update({ is_archived: true }).eq('id', id)
      if (error) throw error
      showToast('Archived ✅')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Archive failed')
    }
  }

  // ✅ compute per-card metrics (memo)
  const cardMetrics = useMemo(() => {
    const out: Record<
      string,
      { totalCost: number; cpp: number; warnings: string[]; fcPct: number | null; margin: number | null }
    > = {}
    for (const r of filtered) {
      const portions = Math.max(1, toNum(r.portions, 1))
      const res = getRecipeTotalCost(r.id, new Set())
      const cpp = res.cost / portions
      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell > 0 ? sell - cpp : null
      out[r.id] = { totalCost: res.cost, cpp, warnings: res.warnings, fcPct, margin }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, linesCache, ingById, recipeById])

  // ✅ lazy-load subrecipe lines as needed
  useEffect(() => {
    const run = async () => {
      const ids = filtered.slice(0, 24).map((r) => r.id)
      for (const rid of ids) await ensureLinesLoaded(rid)
    }
    run().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const currencyDefault = (rows[0]?.currency ?? 'USD').toUpperCase()

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="gc-label">RECIPES</div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-2xl font-extrabold">Recipe Library</div>
            <div className="mt-1 text-sm text-neutral-600">
              Premium grid with stable cards + clear stats + reliable actions.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="gc-input w-full sm:w-72"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or category…"
            />
            <button className="gc-btn" onClick={load} type="button" disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className="gc-btn-primary" onClick={createNew} type="button" disabled={loading}>
              + New
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="gc-card p-6 text-sm text-neutral-600">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="gc-card p-6 text-sm text-neutral-600">No recipes. Create your first one.</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => {
            const cur = (r.currency ?? currencyDefault).toUpperCase()
            const m = cardMetrics[r.id]
            const warn = m?.warnings?.length ? m.warnings[0] : ''
            const hasWarn = !!warn
            const portions = Math.max(1, toNum(r.portions, 1))

            return (
              <div key={r.id} className="gc-menu-card">
                {/* HERO */}
                <div className="gc-menu-hero">
                  {r.photo_url ? (
                    <img src={r.photo_url} alt={r.name ?? 'Recipe photo'} loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                      No Photo
                    </div>
                  )}
                  <div className="gc-menu-overlay" />
                </div>

                {/* BADGES */}
                <div className="gc-menu-badges">
                  <span className="gc-chip">{(r.category || 'Uncategorized').toUpperCase()}</span>
                  {r.calories != null ? (
                    <span className="gc-chip">{Math.round(toNum(r.calories, 0))} kcal</span>
                  ) : null}
                  {hasWarn ? <span className="gc-chip gc-chip-warn">⚠ {warn}</span> : null}
                </div>

                {/* BODY */}
                <div className="p-4">
                  <div className="text-base font-extrabold leading-snug">{r.name || 'Untitled recipe'}</div>

                  <div className="mt-1 text-xs text-neutral-600">
                    Portions: <b>{portions}</b>
                    {r.yield_qty ? (
                      <>
                        {' '}
                        • Yield: <b>{toNum(r.yield_qty, 0)}</b> {r.yield_unit || ''}
                      </>
                    ) : null}
                    {r.is_subrecipe ? <> • <b>Sub-recipe</b></> : null}
                  </div>

                  <div className="mt-2 text-sm text-neutral-700">
                    {r.description?.trim() ? clampStr(r.description, 120) : 'Add a short menu description…'}
                  </div>

                  {(r.protein_g != null || r.carbs_g != null || r.fat_g != null) ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {r.protein_g != null ? <span className="gc-chip">P {toNum(r.protein_g, 0)}g</span> : null}
                      {r.carbs_g != null ? <span className="gc-chip">C {toNum(r.carbs_g, 0)}g</span> : null}
                      {r.fat_g != null ? <span className="gc-chip">F {toNum(r.fat_g, 0)}g</span> : null}
                    </div>
                  ) : null}

                  {/* MGMT STATS (same logic, clearer UI) */}
                  <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-neutral-600">Cost/portion</div>
                      <div className="font-extrabold">{fmtMoney(m?.cpp ?? 0, cur)}</div>
                    </div>

                    {r.selling_price != null ? (
                      <div className="mt-2 flex items-center justify-between text-xs text-neutral-600">
                        <div>
                          FC%:{' '}
                          <b className="text-neutral-900">
                            {m?.fcPct == null ? '—' : `${Math.round(m.fcPct * 10) / 10}%`}
                          </b>
                        </div>
                        <div>
                          Margin:{' '}
                          <b className="text-neutral-900">{m?.margin == null ? '—' : fmtMoney(m.margin, cur)}</b>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-neutral-500">Set selling price to see FC% + margin.</div>
                    )}
                  </div>

                  {/* ACTIONS (same routes, stable buttons) */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <NavLink className="gc-btn" to={`/recipe?id=${r.id}`}>
                      Open Editor
                    </NavLink>
                    <NavLink className="gc-btn" to={`/cook?id=${r.id}`}>
                      Cook
                    </NavLink>
                    <button className="gc-btn-danger" onClick={() => archive(r.id)} type="button">
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
