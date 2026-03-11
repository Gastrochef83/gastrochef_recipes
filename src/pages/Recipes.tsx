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
  if (v.includes('chicken')) return 'recipe-list--amber'
  if (v.includes('rice')) return 'recipe-list--gold'
  if (v.includes('salad') || v.includes('raita')) return 'recipe-list--mint'
  if (v.includes('soup')) return 'recipe-list--warm'
  return 'recipe-list--olive'
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
      .recipes-page-v5 {
        display: grid;
        gap: 12px;
      }

      .recipes-toolbar-v5 {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .recipes-toolbar-v5__left {
        min-width: 0;
      }

      .recipes-title-v5 {
        margin: 0;
        font-size: 12px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-subtitle-v5 {
        margin-top: 4px;
        font-size: 14px;
        color: var(--gc-muted, #5F6B66);
        font-weight: 600;
      }

      .recipes-toolbar-v5__right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .recipes-search-block-v5 {
        display: grid;
        gap: 6px;
      }

      .recipes-search-label-v5 {
        font-size: 12px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-search-input-v5 {
        width: 100%;
        min-height: 42px;
        border-radius: 14px;
        border: 1px solid rgba(11,18,32,.10);
        background: rgba(255,255,255,.90);
        padding: 0 14px;
        outline: none;
        font-size: 14px;
        font-weight: 600;
        color: var(--gc-text, #1F2326);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.92);
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }

      .recipes-search-input-v5:focus {
        border-color: rgba(107,127,59,.38);
        box-shadow: 0 0 0 4px rgba(107,127,59,.14);
        background: rgba(255,255,255,.98);
      }

      .recipes-error-v5,
      .recipes-loading-v5 {
        border-radius: 14px;
        border: 1px solid rgba(11,18,32,.08);
        background: rgba(255,255,255,.82);
        padding: 12px 14px;
        font-weight: 700;
      }

      .recipes-error-v5 {
        color: #b42318;
        border-color: rgba(180,35,24,.16);
        background: rgba(255, 241, 240, .92);
      }

      .recipes-list-v5 {
        display: grid;
        gap: 8px;
      }

      .recipes-list-head-v5 {
        display: grid;
        grid-template-columns:
          minmax(280px, 1.7fr)
          minmax(110px, 0.7fr)
          minmax(70px, 0.45fr)
          minmax(110px, 0.6fr)
          minmax(120px, 0.8fr)
          minmax(90px, 0.6fr)
          minmax(120px, 0.8fr)
          minmax(280px, 1fr);
        gap: 10px;
        align-items: center;
        padding: 0 12px;
        color: #7a857f;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .12em;
        font-weight: 900;
      }

      .recipe-row-v5 {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid rgba(118,128,108,.12);
        background:
          linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,248,245,.96));
        box-shadow:
          0 8px 18px rgba(50,59,44,.03),
          inset 0 1px 0 rgba(255,255,255,.90);
        transition:
          transform 150ms ease,
          border-color 150ms ease,
          box-shadow 150ms ease;
      }

      .recipe-row-v5:hover {
        transform: translateY(-1px);
        border-color: rgba(107,128,68,.18);
        box-shadow:
          0 12px 22px rgba(50,59,44,.05),
          inset 0 1px 0 rgba(255,255,255,.94);
      }

      .recipe-row-v5__accent {
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        border-radius: 999px;
        opacity: .96;
      }

      .recipe-list--olive .recipe-row-v5__accent {
        background: linear-gradient(180deg, #748d3f 0%, #97ab62 100%);
      }

      .recipe-list--amber .recipe-row-v5__accent {
        background: linear-gradient(180deg, #b7791f 0%, #d6a340 100%);
      }

      .recipe-list--gold .recipe-row-v5__accent {
        background: linear-gradient(180deg, #b17f1e 0%, #d2b35e 100%);
      }

      .recipe-list--mint .recipe-row-v5__accent {
        background: linear-gradient(180deg, #4b8f73 0%, #7fc3a4 100%);
      }

      .recipe-list--warm .recipe-row-v5__accent {
        background: linear-gradient(180deg, #9b6b4e 0%, #cd9a78 100%);
      }

      .recipe-row-v5__body {
        display: grid;
        grid-template-columns:
          minmax(280px, 1.7fr)
          minmax(110px, 0.7fr)
          minmax(70px, 0.45fr)
          minmax(110px, 0.6fr)
          minmax(120px, 0.8fr)
          minmax(90px, 0.6fr)
          minmax(120px, 0.8fr)
          minmax(280px, 1fr);
        gap: 10px;
        align-items: center;
        min-height: 72px;
        padding: 10px 12px 10px 16px;
      }

      .recipe-row-v5--dense .recipe-row-v5__body {
        min-height: 64px;
        padding-top: 8px;
        padding-bottom: 8px;
      }

      .recipe-main-v5 {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .recipe-main-v5__icon {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,.98), rgba(244,245,240,.94));
        border: 1px solid rgba(118,128,108,.14);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.94),
          0 4px 12px rgba(60,70,55,.04);
        font-size: 18px;
      }

      .recipe-main-v5__text {
        min-width: 0;
      }

      .recipe-main-v5__title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.05;
        font-weight: 950;
        letter-spacing: -0.02em;
        color: #17210f;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .recipe-main-v5__sub {
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        color: #61705d;
        font-size: 0.83rem;
        font-weight: 700;
      }

      .recipe-dot-v5 {
        color: #b2baae;
      }

      .recipe-cell-v5 {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        color: #24301c;
        font-size: 0.9rem;
        font-weight: 800;
      }

      .recipe-cell-v5--muted {
        color: #5e6b5a;
      }

      .recipe-label-v5 {
        color: #7a857f;
        font-size: 0.67rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        font-weight: 900;
      }

      .recipe-badge-v5 {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 900;
        letter-spacing: 0.03em;
        white-space: nowrap;
        border: 1px solid transparent;
      }

      .recipe-badge-v5--soft {
        color: #496036;
        background: rgba(117,141,63,.10);
        border-color: rgba(117,141,63,.16);
      }

      .recipe-badge-v5--neutral {
        color: #49535d;
        background: rgba(120,128,136,.10);
        border-color: rgba(120,128,136,.14);
      }

      .recipe-badge-v5--archived {
        color: #6b6253;
        background: rgba(176,162,129,.15);
        border-color: rgba(176,162,129,.18);
      }

      .recipe-badge-v5--warning {
        color: #9a5a00;
        background: rgba(255,182,42,.15);
        border-color: rgba(236,164,30,.24);
      }

      .recipe-metric-v5 {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .recipe-metric-v5__label {
        color: #7a857f;
        font-size: 0.64rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        font-weight: 900;
      }

      .recipe-metric-v5__value {
        color: #18210f;
        font-size: 0.95rem;
        font-weight: 950;
        line-height: 1.05;
        white-space: nowrap;
      }

      .recipe-actions-v5 {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .recipe-select-v5 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px dashed rgba(118,128,108,.22);
        background: rgba(255,255,255,.72);
        color: #42503b;
        font-weight: 800;
        cursor: pointer;
        user-select: none;
      }

      .recipe-select-v5 input {
        width: 14px;
        height: 14px;
        accent-color: #748d3f;
        cursor: pointer;
      }

      .recipe-row-v5 .gc-btn,
      .recipe-row-v5 button.gc-btn,
      .recipe-row-v5 a.gc-btn {
        min-height: 34px !important;
        padding: 0 10px !important;
        border-radius: 10px !important;
        font-size: 0.82rem !important;
      }

      @media (max-width: 1450px) {
        .recipes-list-head-v5,
        .recipe-row-v5__body {
          grid-template-columns:
            minmax(260px, 1.7fr)
            minmax(100px, 0.7fr)
            minmax(60px, 0.4fr)
            minmax(90px, 0.5fr)
            minmax(110px, 0.75fr)
            minmax(80px, 0.55fr)
            minmax(110px, 0.75fr)
            minmax(250px, 1fr);
        }
      }

      @media (max-width: 1220px) {
        .recipes-list-head-v5 {
          display: none;
        }

        .recipe-row-v5__body {
          grid-template-columns: 1fr;
          gap: 10px;
          align-items: stretch;
          min-height: auto;
        }

        .recipe-main-v5 {
          align-items: flex-start;
        }

        .recipe-mobile-grid-v5 {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .recipe-actions-v5 {
          justify-content: flex-start;
        }
      }

      @media (max-width: 760px) {
        .recipes-toolbar-v5 {
          align-items: stretch;
        }

        .recipes-toolbar-v5__right {
          width: 100%;
        }

        .recipe-mobile-grid-v5 {
          grid-template-columns: 1fr 1fr;
        }

        .recipe-actions-v5 > * {
          width: 100%;
        }

        .recipe-select-v5 {
          width: 100%;
          justify-content: center;
        }
      }

      @media (max-width: 520px) {
        .recipe-mobile-grid-v5 {
          grid-template-columns: 1fr;
        }

        .recipe-main-v5__title {
          white-space: normal;
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
        if (l.line_type === 'subrecipe') continue

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

    const visible = filtered.slice(0, 60)
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
    <div className="recipes-toolbar-v5__right">
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

      <div className="recipes-page-v5">
        <div className="recipes-toolbar-v5">
          <div className="recipes-toolbar-v5__left">
            <div className="recipes-title-v5">RECIPES</div>
            <div className="recipes-subtitle-v5">
              {isMgmt ? 'Mgmt view: costing & pricing' : 'Kitchen view: fast operations'}
            </div>
          </div>

          {headerRight}
        </div>

        <div className="recipes-search-block-v5">
          <div className="recipes-search-label-v5">SEARCH</div>
          <input
            className="recipes-search-input-v5"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by recipe name or category…"
          />
        </div>

        {err && <div className="recipes-error-v5">{err}</div>}

        {loading ? (
          <div className="recipes-loading-v5">Loading…</div>
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
          <>
            <div className="recipes-list-head-v5">
              <div>Recipe</div>
              <div>Type</div>
              <div>Portions</div>
              <div>Yield</div>
              <div>Cost / Portion</div>
              <div>FC%</div>
              <div>Margin</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            <div className="recipes-list-v5">
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
                    className={`recipe-row-v5 ${accentClass} ${
                      density === 'dense' ? 'recipe-row-v5--dense' : ''
                    }`}
                  >
                    <div className="recipe-row-v5__accent" />

                    <div className="recipe-row-v5__body">
                      <div className="recipe-main-v5">
                        <div className="recipe-main-v5__icon" aria-hidden="true">
                          <span>{glyph}</span>
                        </div>

                        <div className="recipe-main-v5__text">
                          <h3 className="recipe-main-v5__title">{r.name}</h3>
                          <div className="recipe-main-v5__sub">
                            <span>{r.category || 'Uncategorized'}</span>
                            {hasWarning ? (
                              <>
                                <span className="recipe-dot-v5">•</span>
                                <span className="recipe-badge-v5 recipe-badge-v5--warning">
                                  ⚠ Missing price
                                </span>
                              </>
                            ) : null}
                            {r.is_archived ? (
                              <>
                                <span className="recipe-dot-v5">•</span>
                                <span className="recipe-badge-v5 recipe-badge-v5--archived">
                                  Archived
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="recipe-cell-v5">
                        {r.is_subrecipe ? (
                          <span className="recipe-badge-v5 recipe-badge-v5--neutral">
                            Subrecipe
                          </span>
                        ) : (
                          <span className="recipe-badge-v5 recipe-badge-v5--soft">
                            Recipe
                          </span>
                        )}
                      </div>

                      <div className="recipe-cell-v5">{portions}</div>

                      <div className="recipe-cell-v5 recipe-cell-v5--muted">
                        {r.yield_qty
                          ? `${r.yield_qty}${r.yield_unit ? ` ${r.yield_unit}` : ''}`
                          : '—'}
                      </div>

                      <div className="recipe-metric-v5">
                        <div className="recipe-metric-v5__label">Cost / Portion</div>
                        <div className="recipe-metric-v5__value">
                          {c ? `${c.cpp.toFixed(2)} ${cur}` : '—'}
                        </div>
                      </div>

                      <div className="recipe-metric-v5">
                        <div className="recipe-metric-v5__label">FC%</div>
                        <div className="recipe-metric-v5__value">
                          {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                        </div>
                      </div>

                      <div className="recipe-metric-v5">
                        <div className="recipe-metric-v5__label">Margin</div>
                        <div className="recipe-metric-v5__value">
                          {c ? `${c.margin.toFixed(2)} ${cur}` : '—'}
                        </div>
                      </div>

                      <div className="recipe-actions-v5">
                        <Button onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                          Open
                        </Button>

                        <Button variant="secondary" onClick={() => toggleArchive(r)}>
                          {r.is_archived ? 'Restore' : 'Archive'}
                        </Button>

                        <Button variant="danger" onClick={() => deleteOneRecipe(r.id)}>
                          Delete
                        </Button>

                        <label className="recipe-select-v5">
                          <input
                            type="checkbox"
                            checked={!!selected[r.id]}
                            onChange={() => toggleSelect(r.id)}
                          />
                          <span>Select</span>
                        </label>
                      </div>

                      <div className="recipe-mobile-grid-v5" style={{ display: 'none' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    </>
  )
}
