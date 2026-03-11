// src/pages/Recipes.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { useKitchen } from '../lib/kitchen'
import Button from '../components/ui/Button'
import EmptyState from '../components/EmptyState'

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
  code?: string | null
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

type CostPoint = {
  at: number
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  warnings: string[]
}

type Density = 'comfortable' | 'dense'

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
const ING_REV_KEY = 'gc:ingredients:rev'

function getIngredientsRev(): string {
  try {
    return localStorage.getItem(ING_REV_KEY) || '0'
  } catch {
    return '0'
  }
}

function getCostCacheKey() {
  return `gc_v5_cost_cache_v1::rev:${getIngredientsRev()}`
}

const COST_TTL_MS = 10 * 60 * 1000

function loadCostCache(): Record<string, CostPoint> {
  try {
    const raw = localStorage.getItem(getCostCacheKey())
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
    localStorage.setItem(getCostCacheKey(), JSON.stringify(cache))
  } catch {}
}

function recipeAccent(name: string) {
  const v = (name || '').trim().toLowerCase()
  if (v.includes('chicken')) return 'recipe-card--amber'
  if (v.includes('rice')) return 'recipe-card--gold'
  if (v.includes('salad') || v.includes('raita')) return 'recipe-card--mint'
  if (v.includes('soup')) return 'recipe-card--warm'
  return 'recipe-card--olive'
}

function recipeGlyph(name: string, category?: string | null) {
  const n = (name || '').toLowerCase()
  const c = (category || '').toLowerCase()

  if (n.includes('rice')) return '🍚'
  if (n.includes('chicken') || n.includes('biryani')) return '🍛'
  if (n.includes('salad') || n.includes('raita')) return '🥗'
  if (n.includes('soup')) return '🍲'
  if (c.includes('dessert')) return '🍰'
  if (c.includes('drink')) return '🥤'

  return '🍽'
}

function RecipesStyles() {
  return (
    <style>{`
      .recipes-page-v2 {
        display: grid;
        gap: 16px;
      }

      .recipes-toolbar-v2 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .recipes-toolbar-v2__left {
        min-width: 0;
      }

      .recipes-title-v2 {
        margin: 0;
        font-size: 13px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-subtitle-v2 {
        margin-top: 6px;
        font-size: 15px;
        color: var(--gc-muted, #5F6B66);
        font-weight: 600;
      }

      .recipes-toolbar-v2__right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .recipes-search-block-v2 {
        display: grid;
        gap: 8px;
      }

      .recipes-search-label-v2 {
        font-size: 13px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-search-input-v2 {
        width: 100%;
        min-height: 48px;
        border-radius: 16px;
        border: 1px solid rgba(11,18,32,.10);
        background: rgba(255,255,255,.82);
        padding: 0 16px;
        outline: none;
        font-size: 15px;
        font-weight: 600;
        color: var(--gc-text, #1F2326);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.85);
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }

      .recipes-search-input-v2:focus {
        border-color: rgba(107,127,59,.38);
        box-shadow: 0 0 0 4px rgba(107,127,59,.14);
        background: rgba(255,255,255,.96);
      }

      .recipes-error-v2,
      .recipes-loading-v2 {
        border-radius: 18px;
        border: 1px solid rgba(11,18,32,.08);
        background: rgba(255,255,255,.74);
        padding: 14px 16px;
        font-weight: 700;
      }

      .recipes-error-v2 {
        color: #b42318;
        border-color: rgba(180,35,24,.16);
        background: rgba(255, 241, 240, .92);
      }

      .recipes-list-v2 {
        display: grid;
        gap: 14px;
      }

      .recipe-card-v2 {
        position: relative;
        display: block;
        border-radius: 24px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,248,245,0.94));
        box-shadow:
          0 10px 30px rgba(50, 59, 44, 0.05),
          inset 0 1px 0 rgba(255,255,255,0.75);
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease,
          background 180ms ease;
        overflow: hidden;
      }

      .recipe-card-v2:hover {
        transform: translateY(-2px);
        border-color: rgba(107, 128, 68, 0.28);
        box-shadow:
          0 16px 34px rgba(50, 59, 44, 0.08),
          inset 0 1px 0 rgba(255,255,255,0.85);
      }

      .recipe-card-v2--dense {
        border-radius: 20px;
      }

      .recipe-card-v2__accent {
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        border-radius: 999px;
        opacity: .96;
      }

      .recipe-card--olive .recipe-card-v2__accent {
        background: linear-gradient(180deg, #748d3f 0%, #97ab62 100%);
      }

      .recipe-card--amber .recipe-card-v2__accent {
        background: linear-gradient(180deg, #b7791f 0%, #d6a340 100%);
      }

      .recipe-card--gold .recipe-card-v2__accent {
        background: linear-gradient(180deg, #9f7b22 0%, #d2b35e 100%);
      }

      .recipe-card--mint .recipe-card-v2__accent {
        background: linear-gradient(180deg, #4b8f73 0%, #7fc3a4 100%);
      }

      .recipe-card--warm .recipe-card-v2__accent {
        background: linear-gradient(180deg, #9b6b4e 0%, #cd9a78 100%);
      }

      .recipe-card-v2__body {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 18px 18px 18px 20px;
      }

      .recipe-card-v2--dense .recipe-card-v2__body {
        padding: 14px 14px 14px 16px;
      }

      .recipe-card-v2__main {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 1 1 auto;
      }

      .recipe-card-v2__icon {
        width: 58px;
        height: 58px;
        flex: 0 0 58px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.95), rgba(245,246,241,0.92));
        border: 1px solid rgba(118, 128, 108, 0.14);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.9),
          0 6px 18px rgba(60, 70, 55, 0.05);
        font-size: 24px;
      }

      .recipe-card-v2__content {
        min-width: 0;
        flex: 1 1 auto;
      }

      .recipe-card-v2__topline {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .recipe-card-v2__title {
        margin: 0;
        font-size: 1.16rem;
        line-height: 1.12;
        font-weight: 950;
        letter-spacing: -0.02em;
        color: #18210f;
        text-transform: uppercase;
      }

      .recipe-card-v2__meta {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
        color: #66715f;
        font-size: 0.94rem;
        font-weight: 600;
      }

      .recipe-card-v2__dot {
        color: #9aa391;
      }

      .recipe-card-v2__badges {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      .recipe-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 11px;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        white-space: nowrap;
        border: 1px solid transparent;
      }

      .recipe-badge--soft {
        color: #496036;
        background: rgba(117, 141, 63, 0.10);
        border-color: rgba(117, 141, 63, 0.15);
      }

      .recipe-badge--neutral {
        color: #49535d;
        background: rgba(120, 128, 136, 0.10);
        border-color: rgba(120, 128, 136, 0.14);
      }

      .recipe-badge--archived {
        color: #6b6253;
        background: rgba(176, 162, 129, 0.15);
        border-color: rgba(176, 162, 129, 0.18);
      }

      .recipe-badge--warning {
        color: #9a5a00;
        background: rgba(255, 182, 42, 0.16);
        border-color: rgba(236, 164, 30, 0.24);
      }

      .recipe-card-v2__side {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 0 0 auto;
      }

      .recipe-card-v2__metrics {
        display: flex;
        align-items: stretch;
        gap: 10px;
      }

      .metric-pill {
        min-width: 130px;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,245,240,0.9));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.82);
      }

      .metric-pill--compact {
        min-width: 84px;
      }

      .metric-pill__label {
        font-size: 0.74rem;
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        font-weight: 900;
        color: #73806d;
        margin-bottom: 10px;
      }

      .metric-pill__value {
        font-size: 1.05rem;
        line-height: 1.1;
        font-weight: 950;
        letter-spacing: -0.02em;
        color: #16200f;
      }

      .recipe-card-v2__actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 390px;
      }

      .recipe-select-box {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 0 10px;
        border-radius: 14px;
        border: 1px dashed rgba(118, 128, 108, 0.2);
        background: rgba(255,255,255,0.68);
        color: #42503b;
        font-weight: 800;
        cursor: pointer;
        user-select: none;
      }

      .recipe-select-box input {
        width: 16px;
        height: 16px;
        accent-color: #748d3f;
        cursor: pointer;
      }

      @media (max-width: 1260px) {
        .recipe-card-v2__body {
          flex-direction: column;
          align-items: stretch;
        }

        .recipe-card-v2__side {
          flex-direction: column;
          align-items: stretch;
        }

        .recipe-card-v2__metrics {
          flex-wrap: wrap;
        }

        .recipe-card-v2__actions {
          justify-content: flex-start;
          max-width: none;
        }
      }

      @media (max-width: 760px) {
        .recipe-card-v2__main {
          align-items: flex-start;
        }

        .recipe-card-v2__icon {
          width: 48px;
          height: 48px;
          flex-basis: 48px;
          border-radius: 14px;
          font-size: 20px;
        }

        .recipe-card-v2__title {
          font-size: 1rem;
        }

        .metric-pill,
        .metric-pill--compact {
          min-width: calc(50% - 6px);
        }
      }

      @media (max-width: 560px) {
        .recipes-toolbar-v2 {
          align-items: stretch;
        }

        .recipes-toolbar-v2__right {
          width: 100%;
        }
      }
    `}</style>
  )
}

export default function Recipes() {
  const nav = useNavigate()
  const loc = useLocation()
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
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const loadingLinesRef = useRef<Set<string>>(new Set())
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => loadCostCache())

  const [density, setDensity] = useState<Density>(() => {
    try {
      const v = localStorage.getItem('gc_v5_density')
      return v === 'dense' ? 'dense' : 'comfortable'
    } catch {
      return 'comfortable'
    }
  })

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('gc:prefill:recipes')
      if (v && typeof v === 'string') {
        setQ(v)
        sessionStorage.removeItem('gc:prefill:recipes')
      }
    } catch {}
  }, [loc.pathname, loc.hash])

  useEffect(() => {
    try {
      const d = density === 'dense' ? 'compact' : 'comfort'
      document.documentElement.setAttribute('data-density', d)
      localStorage.setItem('gc_density', d)
      localStorage.setItem('gc_v5_density', density)
    } catch {}
  }, [density])

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((key) => selected[key]),
    [selected]
  )

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

  const hasAnyRecipes = recipes.length > 0
  const hasActiveRecipes = useMemo(() => recipes.some((r) => !r.is_archived), [recipes])
  const hasSearch = q.trim().length > 0
  const showArchivedEmptyHint = !showArchived && hasAnyRecipes && !hasActiveRecipes

  async function loadAll() {
    if (mountedRef.current) {
      setLoading(true)
      setErr(null)
    }

    try {
      const selectRecipes =
        'id,code,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(selectRecipes)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (rErr) throw rErr
      if (mountedRef.current) setRecipes((r ?? []) as RecipeRow[])

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
    const need = ids.filter(
      (id) => !recipeLinesCache[id] && !loadingLinesRef.current.has(id)
    )
    if (!need.length) return

    for (const id of need) loadingLinesRef.current.add(id)

    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select(
          'id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title'
        )
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
          continue
        }

        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        if (!ing) continue

        const unitCost = toNum(ing.net_unit_cost, 0)
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          warnings.push('Ingredient without price')
        }

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
      if (!k.kitchenId) {
        throw new Error('Kitchen not ready yet.\nPlease wait a second and try again.')
      }

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

      const { data, error } = await supabase
        .from('recipes')
        .insert(payload as any)
        .select('id')
        .single()

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
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: next })
        .eq('id', r.id)

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
    const ok = window.confirm(
      'Delete this recipe permanently?\n\nThis will also delete its recipe lines.\nThis action cannot be undone.'
    )
    if (!ok) return

    if (mountedRef.current) setErr(null)

    try {
      const { error: lErr } = await supabase
        .from('recipe_lines')
        .delete()
        .eq('recipe_id', recipeId)
      if (lErr) throw lErr

      const { error: rErr } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId)
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

  const headerRight = (
    <div className="recipes-toolbar-v2__right">
      <Button onClick={createNewRecipe}>New recipe</Button>

      <Button variant="secondary" onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? 'Hide archived' : 'Show archived'}
      </Button>

      <Button
        variant="secondary"
        onClick={() => {
          const next = density === 'dense' ? 'comfortable' : 'dense'
          setDensity(next)
          localStorage.setItem('gc_v5_density', next)
        }}
      >
        Density: {density}
      </Button>

      {selectedIds.length > 0 && (
        <Button variant="ghost" onClick={clearSelection}>
          Clear selection ({selectedIds.length})
        </Button>
      )}
    </div>
  )

  return (
    <>
      <RecipesStyles />

      <div className="recipes-page-v2">
        <div className="recipes-toolbar-v2">
          <div className="recipes-toolbar-v2__left">
            <div className="recipes-title-v2">RECIPES</div>
            <div className="recipes-subtitle-v2">
              {isMgmt ? 'Mgmt view: costing & pricing' : 'Kitchen view: fast operations'}
            </div>
          </div>

          {headerRight}
        </div>

        <div className="recipes-search-block-v2">
          <div className="recipes-search-label-v2">SEARCH</div>
          <input
            className="recipes-search-input-v2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by recipe name or category…"
          />
        </div>

        {err && <div className="recipes-error-v2">{err}</div>}

        {loading ? (
          <div className="recipes-loading-v2">Loading…</div>
        ) : !filtered.length ? (
          <EmptyState
            title={
              !hasAnyRecipes
                ? 'No recipes yet'
                : showArchivedEmptyHint
                  ? 'Only archived recipes found'
                  : hasSearch
                    ? 'No recipes match your search'
                    : 'No recipes to show'
            }
            description={
              !hasAnyRecipes
                ? 'Create your first recipe to start costing and kitchen operations.'
                : showArchivedEmptyHint
                  ? 'All recipes are archived right now. You can show them or create a new one.'
                  : hasSearch
                    ? 'Try a different search term or clear the search.'
                    : 'Create a new recipe to get started.'
            }
            primaryAction={{
              label: !hasAnyRecipes
                ? 'Create first recipe'
                : showArchivedEmptyHint
                  ? 'Show archived'
                  : hasSearch
                    ? 'Clear search'
                    : 'New recipe',
              onClick: () => {
                if (!hasAnyRecipes) {
                  createNewRecipe()
                  return
                }
                if (showArchivedEmptyHint) {
                  setShowArchived(true)
                  return
                }
                if (hasSearch) {
                  setQ('')
                  return
                }
                createNewRecipe()
              },
            }}
            secondaryAction={{
              label: !hasAnyRecipes ? 'Add ingredient' : 'New recipe',
              onClick: () => {
                if (!hasAnyRecipes) {
                  nav('/ingredients')
                  return
                }
                createNewRecipe()
              },
            }}
            icon=""
          />
        ) : (
          <div className="recipes-list-v2">
            {filtered.map((r) => {
              const c = costCache[r.id]
              const cur = (r.currency || 'USD').toUpperCase()
              const accentClass = recipeAccent(r.name)
              const glyph = recipeGlyph(r.name, r.category)
              const hasWarning = Boolean(c?.warnings?.length)
              const portions = toNum(r.portions, 1)

              return (
                <div
                  key={r.id}
                  className={`recipe-card-v2 ${accentClass} ${
                    density === 'dense' ? 'recipe-card-v2--dense' : ''
                  }`}
                >
                  <div className="recipe-card-v2__accent" />

                  <div className="recipe-card-v2__body">
                    <div className="recipe-card-v2__main">
                      <div className="recipe-card-v2__icon" aria-hidden="true">
                        <span>{glyph}</span>
                      </div>

                      <div className="recipe-card-v2__content">
                        <div className="recipe-card-v2__topline">
                          <div style={{ minWidth: 0 }}>
                            <h3 className="recipe-card-v2__title">{r.name}</h3>

                            <div className="recipe-card-v2__meta">
                              <span>{r.category || 'Uncategorized'}</span>
                              <span className="recipe-card-v2__dot">•</span>
                              <span>Portions {portions}</span>

                              {r.yield_qty ? (
                                <>
                                  <span className="recipe-card-v2__dot">•</span>
                                  <span>
                                    Yield {r.yield_qty}
                                    {r.yield_unit ? ` ${r.yield_unit}` : ''}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="recipe-card-v2__badges">
                            {r.is_subrecipe ? (
                              <span className="recipe-badge recipe-badge--neutral">Subrecipe</span>
                            ) : (
                              <span className="recipe-badge recipe-badge--soft">Recipe</span>
                            )}

                            {r.is_archived ? (
                              <span className="recipe-badge recipe-badge--archived">Archived</span>
                            ) : null}

                            {hasWarning ? (
                              <span className="recipe-badge recipe-badge--warning">
                                ⚠ Missing price
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="recipe-card-v2__side">
                      <div className="recipe-card-v2__metrics">
                        <div className="metric-pill">
                          <div className="metric-pill__label">Cost / Portion</div>
                          <div className="metric-pill__value">
                            {c ? `${c.cpp.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>

                        <div className="metric-pill metric-pill--compact">
                          <div className="metric-pill__label">FC%</div>
                          <div className="metric-pill__value">
                            {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                          </div>
                        </div>

                        <div className="metric-pill">
                          <div className="metric-pill__label">Margin</div>
                          <div className="metric-pill__value">
                            {c ? `${c.margin.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="recipe-card-v2__actions">
                        <Button onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                          Open editor
                        </Button>

                        <Button variant="secondary" onClick={() => toggleArchive(r)}>
                          {r.is_archived ? 'Restore' : 'Archive'}
                        </Button>

                        <Button variant="danger" onClick={() => deleteOneRecipe(r.id)}>
                          Delete
                        </Button>

                        <label className="recipe-select-box">
                          <input
                            type="checkbox"
                            checked={!!selected[r.id]}
                            onChange={() => toggleSelect(r.id)}
                          />
                          <span>Select</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    </>
  )
}
