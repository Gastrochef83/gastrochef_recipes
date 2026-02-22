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
    if (mountedRef.current) {
      setLoading(true)
      setErr(null)
    }

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
      if (mountedRef.current) setRecipes((r ?? []) as RecipeRow[])

      const { data: i, error: iErr } = (await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
        .eq('kitchen_id', KITCHEN_ID)) as any

      if (iErr && String(iErr.message || '').toLowerCase().includes('kitchen_id')) {
        const { data: i2, error: i2Err } = await supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost,is_active')
          .order('name', { ascending: true })
        if (i2Err) throw i2Err
        if (mountedRef.current) setIngredients((i2 ?? []) as Ingredient[])
      } else {
        if (iErr) throw iErr
        if (mountedRef.current) setIngredients((i ?? []) as Ingredient[])
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to load')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function normalizeLine(row: any): Line {
    // ✅ handles either "note" or "notes" from DB
    const notes = row?.notes ?? row?.note ?? null
    const lt = (row?.line_type ?? 'ingredient') as LineType
    return {
      id: String(row?.id ?? ''),
      recipe_id: String(row?.recipe_id ?? ''),
      ingredient_id: row?.ingredient_id ?? null,
      sub_recipe_id: row?.sub_recipe_id ?? null,
      qty: toNum(row?.qty, 0),
      unit: String(row?.unit ?? 'g'),
      notes,
      position: toNum(row?.position, 0),
      line_type: lt,
      group_title: row?.group_title ?? null,
    }
  }

  async function ensureRecipeLinesLoaded(recipeIds: string[]) {
    const ids = Array.from(new Set(recipeIds)).filter(Boolean)
    const need = ids.filter((id) => !recipeLinesCache[id] && !loadingLinesRef.current.has(id))
    if (!need.length) return

    need.forEach((id) => loadingLinesRef.current.add(id))
    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,notes,position,line_type,group_title')
        .in('recipe_id', need)
        .order('position', { ascending: true })

      if (error) throw error

      const fetched: Record<string, Line[]> = {}
      for (const rid of need) fetched[rid] = []

      for (const row of (data ?? []) as any[]) {
        const rid = String(row?.recipe_id ?? '')
        if (!rid) continue
        if (!fetched[rid]) fetched[rid] = []
        fetched[rid].push(normalizeLine(row))
      }

      if (mountedRef.current) {
        setRecipeLinesCache((p) => ({ ...p, ...fetched }))
      }
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
      if (mountedRef.current) setCostCache(nextCache)
      saveCostCache(nextCache)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, recipeLinesCache, costMemo])

  async function createNewRecipe() {
    if (mountedRef.current) setErr(null)
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

  async function bulkDeleteSelected() {
    if (!selectedIds.length) return

    const ok = window.confirm(
      `Delete ${selectedIds.length} recipes permanently?\n\nThis will also delete their recipe lines.\nThis action cannot be undone.`
    )
    if (!ok) return

    if (mountedRef.current) setErr(null)
    try {
      const { error: lErr } = await supabase.from('recipe_lines').delete().in('recipe_id', selectedIds)
      if (lErr) throw lErr

      const { error: rErr } = await supabase.from('recipes').delete().in('id', selectedIds)
      if (rErr) throw rErr

      if (mountedRef.current) {
        setRecipes((prev) => prev.filter((r) => !selectedIds.includes(r.id)))
        setRecipeLinesCache((p) => {
          const next = { ...p }
          selectedIds.forEach((id) => delete next[id])
          return next
        })
        setSelected({})
        setToast(`Deleted ${selectedIds.length} recipe(s).`)
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Bulk delete failed')
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

      {/* Sticky top header */}
      <div className="gc-card">
        <div className="p-5">
          <div className="gc-label">RECIPES</div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-extrabold tracking-tight">Recipe Library</div>
              <div className="mt-1 text-sm text-neutral-600">
                V5 ULTRA cards + accurate costing (cached). Mgmt mode enables delete & bulk cleanup.
              </div>
            </div>

            <div className="gc-recipes-toolbar">
              <input
                className="gc-input gc-recipes-search"
                placeholder="Search by name or category..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <button className="gc-btn gc-btn-ghost gc-recipes-btn" type="button" onClick={loadAll} disabled={loading}>
                Refresh
              </button>

              <button className="gc-btn gc-btn-primary" type="button" onClick={createNewRecipe}>
                + New
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Show archived
              </label>

              <button className="gc-btn gc-btn-ghost" type="button" onClick={toggleDensity}>
                Density: {density === 'dense' ? 'Dense' : 'Comfort'}
              </button>

              {isMgmt && (
                <>
                  <button className="gc-btn" type="button" onClick={selectVisible} disabled={loading || !filtered.length}>
                    Select visible
                  </button>
                  <button className="gc-btn" type="button" onClick={clearSelection} disabled={!selectedIds.length}>
                    Clear
                  </button>
                </>
              )}
            </div>

            {isMgmt && (
              <div className="flex items-center gap-2">
                <div className="text-sm text-neutral-600">
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

      <div className={`gc-recipes-grid ${gridClass}`}>
        {loading &&
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="gc-menu-card">
              <div className="gc-menu-hero" />
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
            const cat = (r.category || 'Uncategorized').toUpperCase()
            const portions = Math.max(1, toNum(r.portions, 1))
            const cur = (r.currency || 'USD').toUpperCase()

            const c = costCache[r.id]
            const fresh = c && Date.now() - c.at < COST_TTL_MS
            const cpp = fresh ? c.cpp : null
            const fcPct = fresh ? c.fcPct : null
            const margin = fresh ? c.margin : null

            return (
              <div key={r.id} className="gc-menu-card">
                <div className="gc-menu-hero" style={density === 'dense' ? { height: 160 } : undefined}>
                  {r.photo_url ? (
                    <img src={r.photo_url} alt={title} loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">No Photo</div>
                  )}
                  <div className="gc-menu-overlay" />
                  <div className="gc-menu-badges">
                    <span className="gc-chip">{cat}</span>
                    <span className="gc-chip">Portions: {portions}</span>
                    {r.is_archived && <span className="gc-chip warn">Archived</span>}
                    {isKitchen && <span className="gc-chip">Kitchen</span>}
                  </div>
                </div>

                <div className="gc-menu-body" style={density === 'dense' ? { padding: '12px 12px 14px' } : undefined}>
                  <div className="gc-menu-head">
                    <div className="gc-menu-kicker">RECIPE</div>

                    {isMgmt && (
                      <label title="Select for bulk delete" className="gc-select">
                        <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} />
                      </label>
                    )}
                  </div>

                  <div className="gc-menu-title" title={title}>
                    {title}
                  </div>

                  <div className="gc-menu-desc" style={density === 'dense' ? ({ WebkitLineClamp: 1 } as any) : undefined}>
                    {r.description?.trim() ? r.description : 'Add a short menu description…'}
                  </div>

                  <div className="gc-menu-meta" style={density === 'dense' ? { marginTop: 8 } : undefined}>
                    <span className="gc-pill">{cat}</span>
                    <span className="gc-pill">Portions {portions}</span>
                    {r.is_subrecipe && <span className="gc-pill">Sub-Recipe</span>}
                    {r.is_archived && <span className="gc-pill warn">Archived</span>}
                  </div>

                  <div className="gc-menu-actions" style={density === 'dense' ? { marginTop: 10 } : undefined}>
 style={density === 'dense' ? { marginTop: 10 } : undefined}>
                    <div className="gc-actions-row">
                      <button type="button" className="gc-action primary" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                        Open Editor
                      </button>

                      <button type="button" className="gc-action secondary" onClick={() => nav(`/cook?id=${encodeURIComponent(r.id)}`)}>
                        Cook Mode
                      </button>
                    </div>

                    <div className="gc-actions-row secondary">
                      <button type="button" className="gc-action warn" onClick={() => toggleArchive(r)}>
                        {r.is_archived ? 'Restore' : 'Archive'}
                      </button>

                      {isMgmt && (
                        <button type="button" className="gc-action danger" onClick={() => deleteOneRecipe(r.id)}>
                          Delete
                        </button>
                      )}
                    </div>
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
