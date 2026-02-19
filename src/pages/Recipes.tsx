// src/pages/Recipes.tsx
// GastroChef V6 — ULTRA (Kitopi-like)
// ✅ UI-only refactor (no logic changes):
// - Removes ALL text overlays on recipe photo
// - Keeps your costing engine, cache, selection, density, actions exactly the same
// - Cleaner Kitopi-like header + controls + card hierarchy

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'

/**
 * ✅ Your kitchens.id (FK target)
 */
const KITCHEN_ID = '9ca989dc-3115-4cf6-ba0f-af1f25374721'

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
function fmtMoney(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}
function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const f = safeUnit(fromUnit)
  const t = safeUnit(toUnit)
  if (f === t) return { ok: true, value: qty }
  if (f === 'g' && t === 'kg') return { ok: true, value: qty / 1000 }
  if (f === 'kg' && t === 'g') return { ok: true, value: qty * 1000 }
  if (f === 'ml' && t === 'l') return { ok: true, value: qty / 1000 }
  if (f === 'l' && t === 'ml') return { ok: true, value: qty * 1000 }
  return { ok: false, value: 0 }
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

  // lines cache like RecipeEditor
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const loadingLinesRef = useRef<Set<string>>(new Set())

  // cost cache (memory + localStorage)
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => loadCostCache())

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeRow>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])

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
    setLoading(true)
    setErr(null)
    try {
      const selectRecipes =
        'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(selectRecipes)
        .eq('kitchen_id', KITCHEN_ID)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (rErr) throw rErr
      setRecipes((r ?? []) as RecipeRow[])

      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
        .eq('kitchen_id', KITCHEN_ID) as any

      if (iErr && String(iErr.message || '').toLowerCase().includes('kitchen_id')) {
        const { data: i2, error: i2Err } = await supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost,is_active')
          .order('name', { ascending: true })
        if (i2Err) throw i2Err
        setIngredients((i2 ?? []) as Ingredient[])
      } else {
        if (iErr) throw iErr
        setIngredients((i ?? []) as Ingredient[])
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureRecipeLinesLoaded(recipeIds: string[]) {
    const ids = Array.from(new Set(recipeIds)).filter(Boolean)
    const need = ids.filter((id) => !recipeLinesCache[id] && !loadingLinesRef.current.has(id))
    if (!need.length) return

    need.forEach((id) => loadingLinesRef.current.add(id))
    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,position,line_type,group_title')
        .in('recipe_id', need)
        .order('position', { ascending: true })
      if (error) throw error

      const fetched: Record<string, Line[]> = {}
      for (const rid of need) fetched[rid] = []
      for (const row of (data ?? []) as any[]) {
        if (!fetched[row.recipe_id]) fetched[row.recipe_id] = []
        fetched[row.recipe_id].push(row as Line)
      }
      setRecipeLinesCache((p) => ({ ...p, ...fetched }))
    } finally {
      need.forEach((id) => loadingLinesRef.current.delete(id))
    }
  }

  /** Same engine as RecipeEditor (no logic change) */
  const getRecipeTotalCost = (recipeId: string, visited: Set<string>): { cost: number; warnings: string[] } => {
    const warnings: string[] = []
    if (visited.has(recipeId)) {
      warnings.push(`Loop detected in sub-recipes at ${recipeId}`)
      return { cost: 0, warnings }
    }
    visited.add(recipeId)

    const rr = recipeById.get(recipeId)
    const rLines = recipeLinesCache[recipeId] ?? []
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
        const childLines = recipeLinesCache[childId]
        if (!child || !childLines) continue

        const childRes = getRecipeTotalCost(childId, visited)
        for (const w of childRes.warnings) warnings.push(w)

        const yq = toNum(child.yield_qty, 0)
        const yu = safeUnit(child.yield_unit ?? '')
        if (yq <= 0 || !yu) {
          warnings.push(`Missing yield for subrecipe: ${child.name}`)
          continue
        }

        const qtyParent = toNum(l.qty, 0)
        const conv = convertQty(qtyParent, l.unit, yu)
        if (!conv.ok) {
          warnings.push(`Unit mismatch for subrecipe "${child.name}" (${safeUnit(l.unit)} -> ${yu})`)
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

  const costMemo = useMemo(() => {
    const cache = new Map<string, { cost: number; warnings: string[] }>()
    const get = (rid: string) => {
      const hit = cache.get(rid)
      if (hit) return hit
      const res = getRecipeTotalCost(rid, new Set<string>())
      cache.set(rid, res)
      return res
    }
    return { get }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeLinesCache, ingById, recipeById])

  useEffect(() => {
    if (loading) return
    if (!filtered.length) return

    const visible = filtered.slice(0, 28)
    ensureRecipeLinesLoaded(visible.map((r) => r.id)).catch(() => {})

    const subIds: string[] = []
    for (const r of visible) {
      const lines = recipeLinesCache[r.id]
      if (!lines) continue
      for (const l of lines) {
        if (l.line_type === 'subrecipe' && l.sub_recipe_id) subIds.push(l.sub_recipe_id)
      }
    }
    if (subIds.length) ensureRecipeLinesLoaded(subIds).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id
      const hit = nextCache[rid]
      if (hit && now - hit.at < COST_TTL_MS) continue
      if (!recipeLinesCache[rid]) continue

      const totalRes = costMemo.get(rid)
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
      setCostCache(nextCache)
      saveCostCache(nextCache)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, recipeLinesCache, costMemo])

  async function createNewRecipe() {
    setErr(null)
    try {
      const payload: Partial<RecipeRow> = {
        kitchen_id: KITCHEN_ID,
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
      setToast('Created. Opening editor…')
      nav(`/recipe?id=${encodeURIComponent(id)}`)
    } catch (e: any) {
      setErr(e?.message || 'Failed to create recipe')
    }
  }

  async function toggleArchive(r: RecipeRow) {
    try {
      const next = !r.is_archived
      const { error } = await supabase.from('recipes').update({ is_archived: next }).eq('id', r.id)
      if (error) throw error
      setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_archived: next } : x)))
      setToast(next ? 'Archived.' : 'Restored.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to update recipe')
    }
  }

  function toggleSelect(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }))
  }
  function selectVisible() {
    const ids = filtered.slice(0, 64).map((r) => r.id)
    setSelected((p) => {
      const next = { ...p }
      ids.forEach((id) => (next[id] = true))
      return next
    })
  }
  function clearSelection() {
    setSelected({})
  }

  async function deleteOneRecipe(recipeId: string) {
    const ok = window.confirm('Delete this recipe permanently?\n\nThis will also delete its recipe lines.\nThis action cannot be undone.')
    if (!ok) return

    setErr(null)
    try {
      const { error: lErr } = await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId)
      if (lErr) throw lErr

      const { error: rErr } = await supabase.from('recipes').delete().eq('id', recipeId)
      if (rErr) throw rErr

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
    } catch (e: any) {
      setErr(e?.message || 'Failed to delete recipe')
    }
  }

  async function bulkDeleteSelected() {
    if (!selectedIds.length) return

    const ok = window.confirm(
      `Delete ${selectedIds.length} recipes permanently?\n\nThis will also delete their recipe lines.\nThis action cannot be undone.`
    )
    if (!ok) return

    setErr(null)
    try {
      const { error: lErr } = await supabase.from('recipe_lines').delete().in('recipe_id', selectedIds)
      if (lErr) throw lErr

      const { error: rErr } = await supabase.from('recipes').delete().in('id', selectedIds)
      if (rErr) throw rErr

      setRecipes((prev) => prev.filter((r) => !selectedIds.includes(r.id)))
      setRecipeLinesCache((p) => {
        const next = { ...p }
        selectedIds.forEach((id) => delete next[id])
        return next
      })
      setSelected({})
      setToast(`Deleted ${selectedIds.length} recipe(s).`)
    } catch (e: any) {
      setErr(e?.message || 'Bulk delete failed')
    }
  }

  function toggleDensity() {
    const next: Density = density === 'dense' ? 'comfortable' : 'dense'
    setDensity(next)
    localStorage.setItem('gc_v5_density', next)
  }

  const gridClass =
    density === 'dense'
      ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* V6 Sticky Header (Kitopi-like) */}
      <div className="gc-card gc-v6-top">
        <div className="p-5">
          <div className="gc-v6-head">
            <div>
              <div className="gc-label">RECIPES</div>
              <div className="gc-v6-title">Recipe Library</div>
              <div className="gc-v6-sub">
                Clean catalog · Fast cached costing · No text on photo
              </div>
            </div>

            <div className="gc-v6-head-actions">
              <button className="gc-btn" type="button" onClick={loadAll} disabled={loading}>
                Refresh
              </button>
              <button className="gc-btn gc-btn-primary" type="button" onClick={createNewRecipe}>
                + New
              </button>
            </div>
          </div>

          <div className="gc-v6-controls">
            <div className="gc-v6-controls-left">
              <div className="gc-v6-search">
                <span className="gc-v6-search-icon">⌕</span>
                <input
                  className="gc-input gc-v6-search-input"
                  placeholder="Search by name or category..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <label className="gc-v6-check">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <span>Show archived</span>
              </label>

              <button className="gc-btn gc-btn-ghost" type="button" onClick={toggleDensity}>
                Density: {density === 'dense' ? 'Dense' : 'Comfort'}
              </button>
            </div>

            {isMgmt && (
              <div className="gc-v6-controls-right">
                <button className="gc-btn" type="button" onClick={selectVisible} disabled={loading || !filtered.length}>
                  Select visible
                </button>
                <button className="gc-btn" type="button" onClick={clearSelection} disabled={!selectedIds.length}>
                  Clear
                </button>

                <div className="gc-v6-selected">
                  Selected: <b>{selectedIds.length}</b>
                </div>

                <button className="gc-btn gc-btn-soft" type="button" onClick={bulkDeleteSelected} disabled={!selectedIds.length}>
                  Delete Selected
                </button>
              </div>
            )}
          </div>

          {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
        </div>
      </div>

      <div className={gridClass}>
        {loading &&
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="gc-menu-card gc-v6-card">
              <div className="gc-menu-hero gc-v6-hero" />
              <div className="p-4">
                <div className="h-4 w-2/3 rounded bg-neutral-200" />
                <div className="mt-3 h-3 w-full rounded bg-neutral-100" />
                <div className="mt-2 h-3 w-5/6 rounded bg-neutral-100" />
                <div className="mt-4 h-9 w-full rounded bg-neutral-100" />
              </div>
            </div>
          ))}

        {!loading &&
          filtered.map((r) => {
            const title = r.name || 'Untitled'
            const portions = Math.max(1, toNum(r.portions, 1))
            const cur = (r.currency || 'USD').toUpperCase()

            const c = costCache[r.id]
            const fresh = c && Date.now() - c.at < COST_TTL_MS
            const cpp = fresh ? c.cpp : null
            const fcPct = fresh ? c.fcPct : null
            const margin = fresh ? c.margin : null

            return (
              <div key={r.id} className="gc-menu-card gc-v6-card">
                <div className="gc-menu-hero gc-v6-hero" style={density === 'dense' ? { height: 160 } : undefined}>
                  {r.photo_url ? (
                    <img src={r.photo_url} alt={title} loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">No Photo</div>
                  )}

                  {/* ✅ V6 requirement: NO OVERLAY + NO TEXT ON PHOTO */}
                  {/* removed:
                      <div className="gc-menu-overlay" />
                      <div className="gc-menu-badges">...</div>
                  */}
                </div>

                <div className="gc-menu-body gc-v6-body" style={density === 'dense' ? { padding: '12px 12px 14px' } : undefined}>
                  <div className="gc-menu-kicker">Recipe</div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="gc-menu-title gc-v6-title2" style={{ marginTop: 0, fontSize: density === 'dense' ? 16 : 18 }}>
                      {title}
                    </div>

                    {isMgmt && (
                      <label title="Select for bulk delete" className="gc-v6-select">
                        <input
                          type="checkbox"
                          checked={!!selected[r.id]}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="gc-menu-desc gc-v6-desc" style={density === 'dense' ? ({ WebkitLineClamp: 1 } as any) : undefined}>
                    {r.description?.trim() ? r.description : 'Add a short menu description…'}
                  </div>

                  {/* Small meta row (NOT on photo) */}
                  <div className="gc-v6-meta">
                    <span className="gc-v6-pill">{(r.category || 'Uncategorized').toUpperCase()}</span>
                    <span className="gc-v6-dot" />
                    <span className="gc-v6-meta-text">Portions: <b>{portions}</b></span>
                    {r.is_archived && (
                      <>
                        <span className="gc-v6-dot" />
                        <span className="gc-v6-pill warn">Archived</span>
                      </>
                    )}
                    {isKitchen && (
                      <>
                        <span className="gc-v6-dot" />
                        <span className="gc-v6-pill">Kitchen</span>
                      </>
                    )}
                  </div>

                  <div className="gc-menu-metrics gc-v6-metrics" style={density === 'dense' ? { marginTop: 8, fontSize: 12.5 } : undefined}>
                    <div>
                      <span className="text-neutral-600">Cost/portion:</span> <b>{cpp == null ? '…' : fmtMoney(cpp, cur)}</b>
                    </div>
                    <div>
                      <span className="text-neutral-600">FC%:</span> <b>{fcPct == null ? '…' : `${fcPct.toFixed(1)}%`}</b>
                    </div>
                    <div>
                      <span className="text-neutral-600">Margin:</span> <b>{margin == null ? '…' : fmtMoney(margin, cur)}</b>
                    </div>
                    <div>
                      <span className="text-neutral-600">Price:</span>{' '}
                      <b>{r.selling_price == null ? '—' : fmtMoney(toNum(r.selling_price, 0), cur)}</b>
                    </div>
                  </div>

                  <div className="gc-menu-actions gc-v6-actions" style={density === 'dense' ? { marginTop: 10 } : undefined}>
                    <button type="button" className="gc-action primary" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                      Open Editor
                    </button>

                    <button type="button" className="gc-action" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}&view=cook`)}>
                      Cook
                    </button>

                    <button type="button" className="gc-action" onClick={() => toggleArchive(r)}>
                      {r.is_archived ? 'Restore' : 'Archive'}
                    </button>

                    {isMgmt && (
                      <button type="button" className="gc-action" onClick={() => deleteOneRecipe(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>

                  {!!c?.warnings?.length && (
                    <div className="mt-3 text-xs text-amber-700">
                      {c.warnings.slice(0, 2).map((w, i) => (
                        <div key={i}>⚠️ {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="gc-card p-8 text-center">
          <div className="text-xl font-extrabold">No recipes found</div>
          <div className="mt-2 text-sm text-neutral-600">Try another search, or create a new recipe.</div>
        </div>
      )}
    </div>
  )
}
