// src/pages/Recipes.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'
import { useMode } from '../lib/mode'
import { useKitchen } from '../lib/kitchen'

type LineType = 'ingredient' | 'subrecipe' | 'group'

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  notes: string | null
  position: number
  line_type: LineType
  group_title: string | null
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

type RecipeRow = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
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
  target_food_cost_pct?: number | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}
function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}
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

/** -------- Cost Cache (10 minutes) -------- */
type CostPoint = {
  at: number
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  warnings: string[]
}
const COST_CACHE_KEY = 'gc_v5_cost_cache_v1'
const COST_TTL_MS = 10 * 60 * 1000

function loadCostCache(): Record<string, CostPoint> {
  try {
    const raw = localStorage.getItem(COST_CACHE_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, CostPoint>
    if (!obj || typeof obj !== 'object') return {}
    return obj
  } catch {
    return {}
  }
}
function saveCostCache(cache: Record<string, CostPoint>) {
  try {
    localStorage.setItem(COST_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

type Density = 'comfortable' | 'dense'

export default function Recipes() {
  const nav = useNavigate()
  const { isKitchen } = useMode()
  const isMgmt = !isKitchen
  const k = useKitchen()

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected])

  const [density, setDensity] = useState<Density>(() => {
    const v = localStorage.getItem('gc_v5_density')
    return v === 'dense' ? 'dense' : 'comfortable'
  })

  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const loadingLinesRef = useRef<Set<string>>(new Set())

  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => loadCostCache())

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = recipes
    if (!showArchived) list = list.filter((r) => !r.is_archived)
    if (!s) return list
    return list.filter((r) => {
      const a = (r.name || '').toLowerCase()
      const b = (r.category || '').toLowerCase()
      return a.includes(s) || b.includes(s)
    })
  }, [recipes, q, showArchived])

  async function loadAll() {
    if (mountedRef.current) {
      setLoading(true)
      setErr(null)
    }

    try {
      // RLS handles tenancy; do not filter by kitchen_id on client
      const selectRecipes =
        'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(selectRecipes)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (rErr) throw rErr
      if (mountedRef.current) setRecipes((r ?? []) as RecipeRow[])

      // ingredients (RLS-safe)
      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
        .order('name', { ascending: true })

      if (iErr) throw iErr
      if (mountedRef.current) setIngredients((i ?? []) as Ingredient[])
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to load recipes')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureRecipeLinesLoaded(ids: string[]) {
    const need = ids.filter((id) => !recipeLinesCache[id] && !loadingLinesRef.current.has(id))
    if (!need.length) return

    for (const id of need) loadingLinesRef.current.add(id)

    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title')
        .in('recipe_id', need)
        .order('position', { ascending: true })

      if (error) throw error

      const grouped: Record<string, Line[]> = {}
      for (const row of (data ?? []) as any[]) {
        const rid = row.recipe_id
        if (!grouped[rid]) grouped[rid] = []
        grouped[rid].push(row as Line)
      }

      if (mountedRef.current) {
        setRecipeLinesCache((prev) => ({ ...prev, ...grouped }))
      }
    } finally {
      for (const id of need) loadingLinesRef.current.delete(id)
    }
  }

  const costMemo = useMemo(() => {
    const memo = new Map<string, { cost: number; warnings: string[] }>()
    for (const r of recipes) {
      const lines = recipeLinesCache[r.id]
      if (!lines) continue

      let cost = 0
      const warnings: string[] = []

      for (const l of lines) {
        if (l.line_type === 'group') continue

        if (l.line_type === 'subrecipe') {
          // subrecipe costing would be from its own lines
          // current behavior: treat as 0 unless expanded elsewhere
          continue
        }

        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        if (!ing) continue

        const unitCost = toNum(ing.net_unit_cost, 0)
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')

        const netQty = Math.max(0, toNum(l.qty, 0))
        const packUnit = ing.pack_unit || l.unit
        const qtyInPack = convertQtyToPackUnit(netQty, l.unit, packUnit)
        const lineCost = qtyInPack * unitCost
        cost += Number.isFinite(lineCost) ? lineCost : 0
      }

      memo.set(r.id, { cost, warnings })
    }
    return memo
  }, [recipes, recipeLinesCache, ingById])

  useEffect(() => {
    if (loading) return
    if (!filtered.length) return

    const visible = filtered.slice(0, 28)
    ensureRecipeLinesLoaded(visible.map((r) => r.id)).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id
      const hit = nextCache[rid]
      if (hit && now - hit.at < COST_TTL_MS) continue
      if (!recipeLinesCache[rid]) continue

      const totalRes = costMemo.get(rid) || { cost: 0, warnings: [] }
      const totalCost = totalRes.cost

      const portionsN = Math.max(1, toNum(r.portions, 1))
      const cpp = portionsN > 0 ? totalCost / portionsN : 0

      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell - cpp
      const marginPct = sell > 0 ? (margin / sell) * 100 : null

      nextCache[rid] = {
        at: now,
        totalCost,
        cpp,
        fcPct,
        margin,
        marginPct,
        warnings: totalRes.warnings,
      }
      changed = true
    }

    if (changed) {
      if (mountedRef.current) setCostCache(nextCache)
      saveCostCache(nextCache)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, recipeLinesCache, costMemo])

  async function createNewRecipe() {
    if (mountedRef.current) setErr(null)
    try {
      if (!k.kitchenId) throw new Error('Kitchen not ready yet. Please wait a second and try again.')

      const payload: Partial<RecipeRow> = {
        kitchen_id: k.kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 1,
        is_subrecipe: false,
        is_archived: false,
        description: '',
        photo_url: null,
      }

      const { data, error } = await supabase.from('recipes').insert(payload as any).select('id').single()
      if (error) throw error

      const id = (data as any)?.id as string
      if (mountedRef.current) setToast('Created. Opening editor…')
      nav(`/recipe?id=${encodeURIComponent(id)}`)
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to create recipe')
    }
  }

  async function toggleArchive(r: RecipeRow) {
    try {
      const next = !r.is_archived
      const { error } = await supabase.from('recipes').update({ is_archived: next }).eq('id', r.id)
      if (error) throw error
      if (mountedRef.current) {
        setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_archived: next } : x)))
        setToast(next ? 'Archived.' : 'Restored.')
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to update recipe')
    }
  }

  function toggleSelect(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }))
  }

  function clearSelection() {
    setSelected({})
  }

  async function deleteOneRecipe(recipeId: string) {
    const ok = window.confirm('Delete this recipe permanently?\n\nThis will also delete its recipe lines.\nThis action cannot be undone.')
    if (!ok) return

    if (mountedRef.current) setErr(null)
    try {
      const { error: lErr } = await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId)
      if (lErr) throw lErr

      const { error: rErr } = await supabase.from('recipes').delete().eq('id', recipeId)
      if (rErr) throw rErr

      if (mountedRef.current) {
        setRecipes((prev) => prev.filter((r) => r.id !== recipeId))
        setRecipeLinesCache((p) => {
          const next = { ...p }
          delete next[recipeId]
          return next
        })
        setSelected((p) => {
          const next = { ...p }
          delete next[recipeId]
          return next
        })
        setToast('Deleted.')
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to delete recipe')
    }
  }

  // UI
  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button className="gc-btn gc-btn-primary" type="button" onClick={createNewRecipe} disabled={loading || k.loading}>
        New recipe
      </button>

      <button
        className="gc-btn gc-btn-ghost"
        type="button"
        onClick={() => {
          setShowArchived((v) => !v)
        }}
      >
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>

      <button
        className="gc-btn gc-btn-ghost"
        type="button"
        onClick={() => {
          setDensity((v) => {
            const next = v === 'dense' ? 'comfortable' : 'dense'
            localStorage.setItem('gc_v5_density', next)
            return next
          })
        }}
      >
        Density: {density}
      </button>

      {selectedIds.length > 0 && (
        <button className="gc-btn gc-btn-danger" type="button" onClick={() => clearSelection()}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  )

  return (
    <div className="gc-card">
      <div className="gc-card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="gc-label">RECIPES</div>
          <div className="gc-hint">{isMgmt ? 'Mgmt view: costing & pricing' : 'Kitchen view: fast operations'}</div>
        </div>
        {headerRight}
      </div>

      <div className="gc-card-body">
        <div className="gc-field" style={{ maxWidth: 560 }}>
          <div className="gc-label">SEARCH</div>
          <input className="gc-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by recipe name or category…" />
        </div>

        {err && (
          <div style={{ marginTop: 12 }} className="gc-card-soft">
            <div style={{ padding: 12, color: 'var(--gc-danger)', fontWeight: 900 }}>{err}</div>
          </div>
        )}

        {loading ? (
          <div style={{ marginTop: 14 }} className="text-sm">
            Loading…
          </div>
        ) : !filtered.length ? (
          <div style={{ marginTop: 14 }} className="text-sm">
            No recipes found.
          </div>
        ) : (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            {filtered.map((r) => {
              const c = costCache[r.id]
              const cur = (r.currency || 'USD').toUpperCase()

              return (
                <div
                  key={r.id}
                  className="gc-card"
                  style={{
                    padding: density === 'dense' ? 12 : 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 260 }}>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{r.name}</div>
                    <div className="gc-hint" style={{ marginTop: 6 }}>
                      {r.category || 'Uncategorized'} • Portions: {toNum(r.portions, 1)}
                      {r.is_subrecipe ? ' • Subrecipe' : ''}
                      {r.is_archived ? ' • Archived' : ''}
                    </div>

                    {c?.warnings?.length ? (
                      <div className="gc-hint" style={{ marginTop: 6, color: 'var(--gc-warn)', fontWeight: 900 }}>
                        {c.warnings[0]}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                      <div className="gc-label">COST/PORTION</div>
                      <div style={{ fontWeight: 900, marginTop: 4 }}>{c ? `${c.cpp.toFixed(2)} ${cur}` : '—'}</div>
                    </div>

                    <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                      <div className="gc-label">FC%</div>
                      <div style={{ fontWeight: 900, marginTop: 4 }}>{c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}</div>
                    </div>

                    <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                      <div className="gc-label">MARGIN</div>
                      <div style={{ fontWeight: 900, marginTop: 4 }}>{c ? `${c.margin.toFixed(2)} ${cur}` : '—'}</div>
                    </div>

                    <button className="gc-btn gc-btn-primary" type="button" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                      Open editor
                    </button>

                    <Button variant="ghost" type="button" onClick={() => toggleArchive(r)}>
                      {r.is_archived ? 'Restore' : 'Archive'}
                    </Button>

                    <button className="gc-btn gc-btn-danger" type="button" onClick={() => deleteOneRecipe(r.id)}>
                      Delete
                    </button>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 900 }}>
                      <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} />
                      Select
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}