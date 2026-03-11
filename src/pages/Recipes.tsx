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
      .recipes-page-v4 {
        display: grid;
        gap: 14px;
      }

      .recipes-toolbar-v4 {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .recipes-toolbar-v4__left {
        min-width: 0;
      }

      .recipes-title-v4 {
        margin: 0;
        font-size: 12px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-subtitle-v4 {
        margin-top: 5px;
        font-size: 14px;
        color: var(--gc-muted, #5F6B66);
        font-weight: 600;
      }

      .recipes-toolbar-v4__right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .recipes-search-block-v4 {
        display: grid;
        gap: 6px;
      }

      .recipes-search-label-v4 {
        font-size: 12px;
        letter-spacing: .16em;
        font-weight: 900;
        color: var(--gc-soft, #7A857F);
      }

      .recipes-search-input-v4 {
        width: 100%;
        min-height: 46px;
        border-radius: 16px;
        border: 1px solid rgba(11,18,32,.10);
        background: rgba(255,255,255,.88);
        padding: 0 16px;
        outline: none;
        font-size: 14px;
        font-weight: 600;
        color: var(--gc-text, #1F2326);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.90),
          0 6px 14px rgba(50,59,44,.025);
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }

      .recipes-search-input-v4:focus {
        border-color: rgba(107,127,59,.38);
        box-shadow:
          0 0 0 4px rgba(107,127,59,.14),
          inset 0 1px 0 rgba(255,255,255,.94);
        background: rgba(255,255,255,.98);
      }

      .recipes-error-v4,
      .recipes-loading-v4 {
        border-radius: 16px;
        border: 1px solid rgba(11,18,32,.08);
        background: rgba(255,255,255,.80);
        padding: 12px 14px;
        font-weight: 700;
      }

      .recipes-error-v4 {
        color: #b42318;
        border-color: rgba(180,35,24,.16);
        background: rgba(255, 241, 240, .92);
      }

      .recipes-list-v4 {
        display: grid;
        gap: 12px;
      }

      .recipe-card-v4 {
        position: relative;
        overflow: hidden;
        border-radius: 20px;
        border: 1px solid rgba(118, 128, 108, 0.12);
        background:
          radial-gradient(circle at top right, rgba(124,148,78,.04), transparent 24%),
          linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,248,245,.96));
        box-shadow:
          0 10px 22px rgba(50, 59, 44, 0.04),
          inset 0 1px 0 rgba(255,255,255,0.88);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          border-color 160ms ease;
      }

      .recipe-card-v4:hover {
        transform: translateY(-1px);
        border-color: rgba(107, 128, 68, 0.20);
        box-shadow:
          0 16px 28px rgba(50, 59, 44, 0.06),
          inset 0 1px 0 rgba(255,255,255,0.94);
      }

      .recipe-card-v4--dense {
        border-radius: 18px;
      }

      .recipe-card-v4__accent {
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        border-radius: 999px;
        opacity: .96;
      }

      .recipe-card--olive .recipe-card-v4__accent {
        background: linear-gradient(180deg, #748d3f 0%, #97ab62 100%);
      }

      .recipe-card--amber .recipe-card-v4__accent {
        background: linear-gradient(180deg, #b7791f 0%, #d6a340 100%);
      }

      .recipe-card--gold .recipe-card-v4__accent {
        background: linear-gradient(180deg, #b17f1e 0%, #d2b35e 100%);
      }

      .recipe-card--mint .recipe-card-v4__accent {
        background: linear-gradient(180deg, #4b8f73 0%, #7fc3a4 100%);
      }

      .recipe-card--warm .recipe-card-v4__accent {
        background: linear-gradient(180deg, #9b6b4e 0%, #cd9a78 100%);
      }

      .recipe-card-v4__body {
        padding: 14px 14px 14px 18px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
      }

      .recipe-card-v4__left {
        min-width: 0;
        display: grid;
        gap: 10px;
      }

      .recipe-card-v4__top {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
      }

      .recipe-card-v4__icon {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,.98), rgba(244,245,240,.94));
        border: 1px solid rgba(118, 128, 108, 0.14);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.94),
          0 6px 16px rgba(60, 70, 55, 0.04);
        font-size: 20px;
      }

      .recipe-card-v4__headRow {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .recipe-card-v4__titleWrap {
        min-width: 0;
        flex: 1 1 auto;
      }

      .recipe-card-v4__title {
        margin: 0;
        font-size: 1.14rem;
        line-height: 1.04;
        font-weight: 950;
        letter-spacing: -0.028em;
        color: #17210f;
        text-transform: uppercase;
        word-break: break-word;
      }

      .recipe-card-v4__category {
        margin-top: 4px;
        color: #61705d;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .recipe-card-v4__badges {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        justify-content: flex-end;
      }

      .recipe-badge-v4 {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 900;
        letter-spacing: 0.03em;
        white-space: nowrap;
        border: 1px solid transparent;
      }

      .recipe-badge-v4--soft {
        color: #496036;
        background: rgba(117, 141, 63, 0.10);
        border-color: rgba(117, 141, 63, 0.16);
      }

      .recipe-badge-v4--neutral {
        color: #49535d;
        background: rgba(120, 128, 136, 0.10);
        border-color: rgba(120, 128, 136, 0.14);
      }

      .recipe-badge-v4--archived {
        color: #6b6253;
        background: rgba(176, 162, 129, 0.15);
        border-color: rgba(176, 162, 129, 0.18);
      }

      .recipe-badge-v4--warning {
        color: #9a5a00;
        background: rgba(255, 182, 42, 0.15);
        border-color: rgba(236, 164, 30, 0.24);
      }

      .recipe-card-v4__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 14px;
        margin-left: 60px;
      }

      .recipe-meta-v4 {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #4c5a45;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .recipe-meta-v4__label {
        color: #788472;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        font-weight: 900;
      }

      .recipe-card-v4__right {
        width: min(640px, 100%);
        display: grid;
        gap: 10px;
        align-items: center;
      }

      .recipe-card-v4__metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(110px, 1fr));
        gap: 10px;
      }

      .metric-card-v4 {
        border-radius: 16px;
        border: 1px solid rgba(118, 128, 108, 0.13);
        background:
          linear-gradient(180deg, rgba(255,255,255,.96), rgba(244,245,240,.93));
        padding: 10px 12px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
      }

      .metric-card-v4__label {
        font-size: 0.66rem;
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 0.10em;
        font-weight: 900;
        color: #73806d;
      }

      .metric-card-v4__value {
        margin-top: 8px;
        font-size: 1rem;
        line-height: 1.05;
        font-weight: 950;
        letter-spacing: -0.02em;
        color: #16200f;
      }

      .recipe-card-v4__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      .recipe-select-v4 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        padding: 0 10px;
        border-radius: 12px;
        border: 1px dashed rgba(118, 128, 108, 0.22);
        background: rgba(255,255,255,0.72);
        color: #42503b;
        font-weight: 800;
        cursor: pointer;
        user-select: none;
      }

      .recipe-select-v4 input {
        width: 15px;
        height: 15px;
        accent-color: #748d3f;
        cursor: pointer;
      }

      .recipe-card-v4 .gc-btn,
      .recipe-card-v4 button.gc-btn,
      .recipe-card-v4 a.gc-btn {
        min-height: 38px !important;
        padding: 0 12px !important;
        border-radius: 12px !important;
        font-size: 0.88rem !important;
      }

      @media (max-width: 1280px) {
        .recipe-card-v4__body {
          grid-template-columns: 1fr;
        }

        .recipe-card-v4__right {
          width: 100%;
        }

        .recipe-card-v4__actions {
          justify-content: flex-start;
        }
      }

      @media (max-width: 860px) {
        .recipe-card-v4__meta {
          margin-left: 0;
        }

        .recipe-card-v4__top {
          grid-template-columns: 42px minmax(0, 1fr);
        }

        .recipe-card-v4__icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          font-size: 18px;
        }

        .recipe-card-v4__title {
          font-size: 1rem;
        }

        .recipe-card-v4__metrics {
          grid-template-columns: 1fr 1fr 1fr;
        }
      }

      @media (max-width: 620px) {
        .recipes-toolbar-v4 {
          align-items: stretch;
        }

        .recipes-toolbar-v4__right {
          width: 100%;
        }

        .recipe-card-v4__body {
          padding: 12px 12px 12px 16px;
        }

        .recipe-card-v4__headRow {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipe-card-v4__badges {
          justify-content: flex-start;
        }

        .recipe-card-v4__metrics {
          grid-template-columns: 1fr;
        }

        .recipe-card-v4__actions {
          justify-content: stretch;
        }

        .recipe-card-v4__actions > * {
          width: 100%;
        }

        .recipe-select-v4 {
          width: 100%;
          justify-content: center;
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

    const visible = filtered.slice(0, 40)
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
    <div className="recipes-toolbar-v4__right">
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

      <div className="recipes-page-v4">
        <div className="recipes-toolbar-v4">
          <div className="recipes-toolbar-v4__left">
            <div className="recipes-title-v4">RECIPES</div>
            <div className="recipes-subtitle-v4">
              {isMgmt ? 'Mgmt view: costing & pricing' : 'Kitchen view: fast operations'}
            </div>
          </div>

          {headerRight}
        </div>

        <div className="recipes-search-block-v4">
          <div className="recipes-search-label-v4">SEARCH</div>
          <input
            className="recipes-search-input-v4"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by recipe name or category…"
          />
        </div>

        {err && <div className="recipes-error-v4">{err}</div>}

        {loading ? (
          <div className="recipes-loading-v4">Loading…</div>
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
          <div className="recipes-list-v4">
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
                  className={`recipe-card-v4 ${accentClass} ${
                    density === 'dense' ? 'recipe-card-v4--dense' : ''
                  }`}
                >
                  <div className="recipe-card-v4__accent" />

                  <div className="recipe-card-v4__body">
                    <div className="recipe-card-v4__left">
                      <div className="recipe-card-v4__top">
                        <div className="recipe-card-v4__icon" aria-hidden="true">
                          <span>{glyph}</span>
                        </div>

                        <div>
                          <div className="recipe-card-v4__headRow">
                            <div className="recipe-card-v4__titleWrap">
                              <h3 className="recipe-card-v4__title">{r.name}</h3>
                              <div className="recipe-card-v4__category">
                                {r.category || 'Uncategorized'}
                              </div>
                            </div>

                            <div className="recipe-card-v4__badges">
                              {r.is_subrecipe ? (
                                <span className="recipe-badge-v4 recipe-badge-v4--neutral">
                                  Subrecipe
                                </span>
                              ) : (
                                <span className="recipe-badge-v4 recipe-badge-v4--soft">
                                  Recipe
                                </span>
                              )}

                              {r.is_archived ? (
                                <span className="recipe-badge-v4 recipe-badge-v4--archived">
                                  Archived
                                </span>
                              ) : null}

                              {hasWarning ? (
                                <span className="recipe-badge-v4 recipe-badge-v4--warning">
                                  ⚠ Missing price
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="recipe-card-v4__meta">
                        <div className="recipe-meta-v4">
                          <span className="recipe-meta-v4__label">Portions</span>
                          <span>{portions}</span>
                        </div>

                        <div className="recipe-meta-v4">
                          <span className="recipe-meta-v4__label">Yield</span>
                          <span>
                            {r.yield_qty
                              ? `${r.yield_qty}${r.yield_unit ? ` ${r.yield_unit}` : ''}`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="recipe-card-v4__right">
                      <div className="recipe-card-v4__metrics">
                        <div className="metric-card-v4">
                          <div className="metric-card-v4__label">Cost / Portion</div>
                          <div className="metric-card-v4__value">
                            {c ? `${c.cpp.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>

                        <div className="metric-card-v4">
                          <div className="metric-card-v4__label">FC%</div>
                          <div className="metric-card-v4__value">
                            {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                          </div>
                        </div>

                        <div className="metric-card-v4">
                          <div className="metric-card-v4__label">Margin</div>
                          <div className="metric-card-v4__value">
                            {c ? `${c.margin.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="recipe-card-v4__actions">
                        <Button onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                          Open editor
                        </Button>

                        <Button variant="secondary" onClick={() => toggleArchive(r)}>
                          {r.is_archived ? 'Restore' : 'Archive'}
                        </Button>

                        <Button variant="danger" onClick={() => deleteOneRecipe(r.id)}>
                          Delete
                        </Button>

                        <label className="recipe-select-v4">
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
