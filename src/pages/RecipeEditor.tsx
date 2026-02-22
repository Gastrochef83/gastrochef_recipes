// src/pages/RecipeEditor.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { addCostPoint, clearCostPoints, listCostPoints, deleteCostPoint } from '../lib/costHistory'

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
  photo_url?: string | null
  description?: string | null
  method?: string | null
  method_steps?: string[] | null
  method_step_photos?: string[] | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  selling_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
}

type LineType = 'ingredient' | 'subrecipe' | 'group'

type Line = {
  id: string
  kitchen_id: string | null
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number
  qty: number
  unit: string
  yield_percent: number
  notes: string | null
  gross_qty_override: number | null
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

type GrossMode = 'sync' | 'manual'

type EditRow = {
  line_type: LineType
  ingredient_id: string
  sub_recipe_id: string
  qty: string // Net Qty
  unit: string
  yield_percent: string
  gross_qty_override: string
  gross_mode: GrossMode
  notes: string
  group_title: string
}

type MetaStatus = 'saved' | 'saving' | 'dirty'

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function normalizeSteps(steps: string[] | null | undefined) {
  return (steps ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
}

function extFromType(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
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
  return { ok: false, value: 0 }
}

// convert ingredient line qty to ingredient pack unit (keeps old behavior)
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

function UnitBadge({ unit }: { unit: string }) {
  const u = safeUnit(unit)
  const label =
    u === 'g' ? 'g' : u === 'kg' ? 'kg' : u === 'ml' ? 'ml' : u === 'l' ? 'l' : u === 'pcs' ? 'pcs' : u
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[12px] font-semibold text-neutral-700">
      {label}
    </span>
  )
}

export default function RecipeEditor() {
  // ✅ Mode Engine (UI only — no logic changes)
  const { isKitchen, isMgmt } = useMode()

  const location = useLocation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])

  // Meta saving
  const [savingMeta, setSavingMeta] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)

  // Form fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])

  // Nutrition per portion (manual only)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // Pricing per portion
  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')

  // Sub-recipe settings
  const [isSubRecipe, setIsSubRecipe] = useState(false)
  const [yieldQty, setYieldQty] = useState('')
  const [yieldUnit, setYieldUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')
  const [yieldSmartLoading, setYieldSmartLoading] = useState(false)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  // Inline Add
  const [ingSearch, setIngSearch] = useState('')
  const [addType, setAddType] = useState<LineType>('ingredient')
  const [addIngredientId, setAddIngredientId] = useState('')
  const [addSubRecipeId, setAddSubRecipeId] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addUnit, setAddUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')
  const [addYieldPercent, setAddYieldPercent] = useState('100')
  const [addGrossQty, setAddGrossQty] = useState('')
  useEffect(() => {
    // Auto Yield% from manual Net/Gross (Kitopi: Yield = Net ÷ Gross)
    const net = toNum(addQty, 0)
    const gross = toNum(addGrossQty, 0)
    const y = yieldFromNetGross(net, gross)
    setAddYieldPercent(String(Math.round(y * 1000) / 1000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addQty, addGrossQty])

  const [addNote, setAddNote] = useState('')
  const [savingAdd, setSavingAdd] = useState(false)

  // Add Group
  const [groupTitle, setGroupTitle] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  // Inline edit per row
  const [edit, setEdit] = useState<Record<string, EditRow>>({})
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})
  const [reorderSaving, setReorderSaving] = useState(false)

  // Expand breakdown
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Recursive cache of recipe_lines for referenced subrecipes
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})

  // --------- Smart Back + Autosave Tracking ----------
  const [metaStatus, setMetaStatus] = useState<MetaStatus>('saved')
  const lastSavedSnapshotRef = useRef<string>('')
  const autoSaveTimerRef = useRef<number | null>(null)
  const newStepInputRef = useRef<HTMLInputElement | null>(null)

  // Premium: last saved time
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // Pack D: Print / Cost History UI
  const [costOpen, setCostOpen] = useState(false)

  const alignStepPhotos = (cleanSteps: string[], photos: string[] | null | undefined) => {
    const p = (photos ?? []).map((x) => (x ?? '').trim())
    return cleanSteps.map((_, idx) => p[idx] ?? '')
  }

  const currentMetaSnapshot = () => {
    const cleanSteps = normalizeSteps(steps)
    const cleanPhotos = alignStepPhotos(cleanSteps, stepPhotos)
    return JSON.stringify({
      name: (name ?? '').trim(),
      category: (category ?? '').trim(),
      portions: String(portions ?? '1'),
      description: (description ?? '').trim(),
      methodLegacy: (methodLegacy ?? '').trim(),
      method_steps: cleanSteps,
      method_step_photos: cleanPhotos,
      calories: String(calories ?? ''),
      protein: String(protein ?? ''),
      carbs: String(carbs ?? ''),
      fat: String(fat ?? ''),
      currency: String(currency ?? 'USD').toUpperCase(),
      sellingPrice: String(sellingPrice ?? ''),
      targetFC: String(targetFC ?? '30'),
      isSubRecipe: !!isSubRecipe,
      yieldQty: String(yieldQty ?? ''),
      yieldUnit: safeUnit(String(yieldUnit ?? 'g')),
    })
  }

  // ✅ technical polish: stable snapshot string for deps (same behavior)
  const metaSnapshotStr = useMemo(() => currentMetaSnapshot(), [
    name,
    category,
    portions,
    description,
    methodLegacy,
    steps,
    stepPhotos,
    calories,
    protein,
    carbs,
    fat,
    currency,
    sellingPrice,
    targetFC,
    isSubRecipe,
    yieldQty,
    yieldUnit,
  ])

  const smartBack = () => {
    if (metaStatus === 'dirty') {
      const ok = window.confirm('You have unsaved changes. Leave anyway?')
      if (!ok) return
    }
    if (window.history.length > 1) navigate(-1)
    else navigate('/recipes', { replace: true })
  }

  // Unsaved guard on tab close
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (metaStatus !== 'dirty') return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [metaStatus])

  // mark dirty when user changes meta
  useEffect(() => {
    if (loading) return
    if (savingMeta) return
    const dirty = metaSnapshotStr !== lastSavedSnapshotRef.current
    setMetaStatus(dirty ? 'dirty' : 'saved')
  }, [loading, savingMeta, metaSnapshotStr])

  const loadAll = async (recipeId: string) => {
    const selectWithPhotos =
      'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
    const selectNoPhotos =
      'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'

    let r: any = null
    let rErr: any = null

    {
      const res = await supabase.from('recipes').select(selectWithPhotos).eq('id', recipeId).single()
      r = res.data
      rErr = res.error
    }

    if (rErr && String(rErr.message || '').toLowerCase().includes('method_step_photos')) {
      const res2 = await supabase.from('recipes').select(selectNoPhotos).eq('id', recipeId).single()
      r = res2.data
      rErr = res2.error
    }
    if (rErr) throw rErr

    const { data: l, error: lErr } = await supabase
      .from('recipe_lines')
      .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,yield_percent,gross_qty_override,notes,note,position,line_type,group_title')
      .eq('recipe_id', recipeId)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
    if (lErr) throw lErr

    const { data: i, error: iErr } = await supabase
      .from('ingredients')
      .select('id,name,pack_unit,net_unit_cost,is_active')
      .order('name', { ascending: true })
    if (iErr) throw iErr

    const { data: rs, error: rsErr } = await supabase
      .from('recipes')
      .select(selectNoPhotos)
      .eq('kitchen_id', (r as any).kitchen_id)
      .order('name', { ascending: true })
    if (rsErr) throw rsErr

    const rr = r as Recipe
    const ll = (l ?? []) as Line[]
    const ii = (i ?? []) as Ingredient[]
    const rlist = (rs ?? []) as Recipe[]

    setRecipe(rr)
    setLines(ll)
    setIngredients(ii)
    setAllRecipes(rlist)

    setName(rr.name ?? '')
    setCategory(rr.category ?? '')
    setPortions(String(rr.portions ?? 1))
    setDescription(rr.description ?? '')

    const cleanSteps = normalizeSteps(rr.method_steps)
    setSteps(cleanSteps)
    setMethodLegacy(rr.method ?? '')
    setStepPhotos(alignStepPhotos(cleanSteps, rr.method_step_photos))

    setCalories(rr.calories == null ? '' : String(rr.calories))
    setProtein(rr.protein_g == null ? '' : String(rr.protein_g))
    setCarbs(rr.carbs_g == null ? '' : String(rr.carbs_g))
    setFat(rr.fat_g == null ? '' : String(rr.fat_g))

    setCurrency((rr.currency ?? 'USD').toUpperCase())
    setSellingPrice(rr.selling_price == null ? '' : String(rr.selling_price))
    setTargetFC(rr.target_food_cost_pct == null ? '30' : String(rr.target_food_cost_pct))

    setIsSubRecipe(rr.is_subrecipe === true)
    setYieldQty(rr.yield_qty == null ? '' : String(rr.yield_qty))
    setYieldUnit((safeUnit(rr.yield_unit ?? 'g') as any) || 'g')

    const m: Record<string, EditRow> = {}
    for (const x of ll) {
      m[x.id] = {
        line_type: x.line_type ?? 'ingredient',
        ingredient_id: x.ingredient_id ?? '',
        sub_recipe_id: x.sub_recipe_id ?? '',
        qty: String((x as any).qty ?? 0),
        unit: safeUnit((x as any).unit ?? 'g'),
        yield_percent: String((x as any).yield_percent ?? 100),
        gross_qty_override: String(((x as any).gross_qty_override ?? '') as any),
        gross_mode: (x as any).gross_qty_override != null ? 'manual' : 'sync',
        notes: ((x as any).notes ?? (x as any).note ?? '') as any,
        group_title: (x as any).group_title ?? '',
      }
    }
    setEdit(m)

    setRecipeLinesCache((p) => ({ ...p, [rr.id]: ll }))

    setTimeout(() => {
      const snap = JSON.stringify({
        name: (rr.name ?? '').trim(),
        category: (rr.category ?? '').trim(),
        portions: String(rr.portions ?? 1),
        description: (rr.description ?? '').trim(),
        methodLegacy: (rr.method ?? '').trim(),
        method_steps: cleanSteps,
        method_step_photos: alignStepPhotos(cleanSteps, rr.method_step_photos),
        calories: rr.calories == null ? '' : String(rr.calories),
        protein: rr.protein_g == null ? '' : String(rr.protein_g),
        carbs: rr.carbs_g == null ? '' : String(rr.carbs_g),
        fat: rr.fat_g == null ? '' : String(rr.fat_g),
        currency: (rr.currency ?? 'USD').toUpperCase(),
        sellingPrice: rr.selling_price == null ? '' : String(rr.selling_price),
        targetFC: rr.target_food_cost_pct == null ? '30' : String(rr.target_food_cost_pct),
        isSubRecipe: rr.is_subrecipe === true,
        yieldQty: rr.yield_qty == null ? '' : String(rr.yield_qty),
        yieldUnit: safeUnit(rr.yield_unit ?? 'g'),
      })
      lastSavedSnapshotRef.current = snap
      setMetaStatus('saved')
      setLastSavedAt(Date.now())
    }, 0)
  }

  useEffect(() => {
    if (!id) {
      setErr('Missing recipe id in URL (?id=...)')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    loadAll(id)
      .then(() => setLoading(false))
      .catch((e: any) => {
        setErr(e?.message ?? 'Unknown error')
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of allRecipes) m.set(r.id, r)
    return m
  }, [allRecipes])

  const activeIngredients = useMemo(() => ingredients.filter((i) => i.is_active !== false), [ingredients])

  const filteredIngredients = useMemo(() => {
    const q = ingSearch.trim().toLowerCase()
    if (!q) return activeIngredients
    return activeIngredients.filter((x) => (x.name ?? '').toLowerCase().includes(q))
  }, [activeIngredients, ingSearch])

  const subRecipeOptions = useMemo(() => {
    if (!recipe) return []
    return allRecipes.filter((r) => r.is_subrecipe && !r.is_archived && r.id !== recipe.id)
  }, [allRecipes, recipe])

  const portionsN = Math.max(1, toNum(portions, 1))

  // -------------------------
  // Recursive cost (multi-level)
  // -------------------------
  const ensureRecipeLinesLoaded = async (rootRecipeId: string) => {
    const seen = new Set<string>()
    const queue: string[] = [rootRecipeId]
    const needFetch: string[] = []

    while (queue.length) {
      const rid = queue.shift()!
      if (seen.has(rid)) continue
      seen.add(rid)

      const cached = recipeLinesCache[rid]
      if (!cached) needFetch.push(rid)

      const linesHere = cached || []
      for (const l of linesHere) {
        if (l.line_type === 'subrecipe' && l.sub_recipe_id) queue.push(l.sub_recipe_id)
      }
    }

    if (needFetch.length === 0) return

    const fetched: Record<string, Line[]> = {}
    const chunk = (arr: string[], size: number) => {
      const out: string[][] = []
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
      return out
    }

    for (const ids of chunk(needFetch, 50)) {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,yield_percent,gross_qty_override,notes,note,position,line_type,group_title')
        .in('recipe_id', ids)
        .order('position', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error

      const rows = (data ?? []) as Line[]
      for (const rid of ids) fetched[rid] = []
      for (const row of rows) {
        if (!fetched[row.recipe_id]) fetched[row.recipe_id] = []
        fetched[row.recipe_id].push(row)
      }
    }

    setRecipeLinesCache((p) => ({ ...p, ...fetched }))
  }

  useEffect(() => {
    if (!recipe) return
    ensureRecipeLinesLoaded(recipe.id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, lines])

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

  // ✅ Premium: memo cache for cost results within the same render (no logic change)
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

  const totalCostRes = useMemo(() => {
    if (!recipe) return { cost: 0, warnings: [] as string[] }
    return costMemo.get(recipe.id)
  }, [recipe?.id, costMemo])

  const totalCost = totalCostRes.cost
  const cpp = totalCost / portionsN

  // Pricing metrics
  const sell = Math.max(0, toNum(sellingPrice, 0))
  const fcPct = sell > 0 ? (cpp / sell) * 100 : null
  const margin = sell - cpp
  const marginPct = sell > 0 ? (margin / sell) * 100 : null
  const target = Math.min(99, Math.max(1, toNum(targetFC, 30)))
  const suggestedPrice = target > 0 ? cpp / (target / 100) : 0

  const applySuggested = () => {
    if (!Number.isFinite(suggestedPrice) || suggestedPrice <= 0) return
    setSellingPrice(String(Math.round(suggestedPrice * 100) / 100))
    showToast('Suggested price applied ✅ (remember Save)')
  }

  // -------------------------
  // Save recipe meta (includes sub-recipe + yield + step photos)
  // -------------------------
  const saveMeta = async (opts?: { silent?: boolean; skipReload?: boolean; isAuto?: boolean }) => {
    if (!id) return
    if (opts?.isAuto && metaStatus !== 'dirty') return

    setSavingMeta(true)
    setMetaStatus('saving')

    try {
      const cleanSteps = normalizeSteps(steps)
      const cleanStepPhotos = alignStepPhotos(cleanSteps, stepPhotos)

      const payload: any = {
        name: name.trim() || 'Untitled',
        category: category.trim() || null,
        portions: Math.max(1, toNum(portions, 1)),
        description: description.trim() || null,

        method_steps: cleanSteps,
        method: methodLegacy.trim() || null,

        method_step_photos: cleanStepPhotos,

        calories: calories.trim() === '' ? null : Math.max(0, Math.floor(toNum(calories, 0))),
        protein_g: protein.trim() === '' ? null : Math.max(0, toNum(protein, 0)),
        carbs_g: carbs.trim() === '' ? null : Math.max(0, toNum(carbs, 0)),
        fat_g: fat.trim() === '' ? null : Math.max(0, toNum(fat, 0)),

        currency: (currency || 'USD').toUpperCase(),
        selling_price: sellingPrice.trim() === '' ? null : Math.max(0, toNum(sellingPrice, 0)),
        target_food_cost_pct: Math.min(99, Math.max(1, toNum(targetFC, 30))),

        is_subrecipe: isSubRecipe,
        yield_qty: yieldQty.trim() === '' ? null : Math.max(0, toNum(yieldQty, 0)),
        yield_unit: isSubRecipe ? safeUnit(yieldUnit) : null,
      }

      let { error } = await supabase.from('recipes').update(payload).eq('id', id)

      if (error && String(error.message || '').toLowerCase().includes('method_step_photos')) {
        delete payload.method_step_photos
        ;({ error } = await supabase.from('recipes').update(payload).eq('id', id))
      }

      if (error) throw error

      // Pack D: Cost history point (only after successful save)
      addCostPoint(id, {
        totalCost,
        cpp,
        portions: Math.max(1, toNum(portions, 1)),
        currency: (currency || 'USD').toUpperCase(),
      })

      lastSavedSnapshotRef.current = currentMetaSnapshot()
      setMetaStatus('saved')
      setLastSavedAt(Date.now())

      if (!opts?.silent) showToast('Saved ✅')
      if (!opts?.skipReload) await loadAll(id)
    } catch (e: any) {
      setMetaStatus('dirty')
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSavingMeta(false)
    }
  }

  // ✅ Premium Autosave: debounce after last change (no logic change)
  useEffect(() => {
    if (!id) return
    if (loading) return
    if (savingMeta) return
    if (uploading) return
    if (stepUploading) return
    if (metaStatus !== 'dirty') return

    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      saveMeta({ silent: true, skipReload: true, isAuto: true }).catch(() => {})
    }, 2500)

    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, savingMeta, uploading, stepUploading, metaStatus, metaSnapshotStr])

  // -------------------------
  // Keyboard shortcuts (Premium-safe)
  // -------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey

      // Save
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveMeta().catch(() => {})
        return
      }

      // Add step ONLY on Ctrl/Cmd+Enter when focused on newStep input
      if (mod && e.key === 'Enter') {
        const active = document.activeElement
        if (active && newStepInputRef.current && active === newStepInputRef.current) {
          e.preventDefault()
          addStep()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newStep, steps, stepPhotos, metaStatus])

  // -------------------------
  // Yield Smart
  // -------------------------
  const yieldSmart = async () => {
    if (!recipe) return
    setYieldSmartLoading(true)
    try {
      await ensureRecipeLinesLoaded(recipe.id)

      let weightG = 0
      let volumeML = 0
      let pieces = 0

      const addWeight = (qty: number, unit: string) => {
        const u = safeUnit(unit)
        if (u === 'g') weightG += qty
        else if (u === 'kg') weightG += qty * 1000
      }
      const addVolume = (qty: number, unit: string) => {
        const u = safeUnit(unit)
        if (u === 'ml') volumeML += qty
        else if (u === 'l') volumeML += qty * 1000
      }
      const addPcs = (qty: number, unit: string) => {
        const u = safeUnit(unit)
        if (u === 'pcs') pieces += qty
      }

      const rLines = recipeLinesCache[recipe.id] ?? []

      for (const l of rLines) {
        if (l.line_type === 'group') continue
        const q = Math.max(0, toNum(l.qty, 0))
        const u = safeUnit(l.unit)

        if (l.line_type === 'ingredient') {
          addWeight(q, u)
          addVolume(q, u)
          addPcs(q, u)
          continue
        }

        if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
          const child = recipeById.get(l.sub_recipe_id)
          if (!child) continue
          const yu = safeUnit(child.yield_unit ?? '')
          if (yu === 'g' || yu === 'kg') addWeight(q, u)
          else if (yu === 'ml' || yu === 'l') addVolume(q, u)
          else if (yu === 'pcs') addPcs(q, u)
        }
      }

      if (weightG > 0) {
        setIsSubRecipe(true)
        setYieldUnit('g')
        setYieldQty(String(Math.round(weightG)))
        showToast(`Yield Smart ✅ Suggested yield: ${Math.round(weightG)} g`)
      } else if (volumeML > 0) {
        setIsSubRecipe(true)
        setYieldUnit('ml')
        setYieldQty(String(Math.round(volumeML)))
        showToast(`Yield Smart ✅ Suggested yield: ${Math.round(volumeML)} ml`)
      } else if (pieces > 0) {
        setIsSubRecipe(true)
        setYieldUnit('pcs')
        setYieldQty(String(Math.round(pieces * 10) / 10))
        showToast(`Yield Smart ✅ Suggested yield: ${Math.round(pieces * 10) / 10} pcs`)
      } else {
        showToast('Yield Smart: no measurable lines found (g/ml/pcs).')
      }
    } catch (e: any) {
      showToast(e?.message ?? 'Yield Smart failed')
    } finally {
      setYieldSmartLoading(false)
    }
  }

  // -------------------------
  // Steps
  // -------------------------
  const addStep = () => {
    const s = (newStep ?? '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
  }
  const updateStep = (idx: number, value: string) => setSteps((prev) => prev.map((x, i) => (i === idx ? value : x)))
  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx))
    setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
  }
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
    setStepPhotos((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  // -------------------------
  // Upload main recipe photo
  // -------------------------
  const uploadPhoto = async (file: File) => {
    if (!id) return
    setUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `recipes/${id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('recipe-photos').upload(key, file, {
        upsert: true,
        contentType: file.type,
      })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('recipe-photos').getPublicUrl(key)
      const url = pub?.publicUrl
      if (!url) throw new Error('Failed to get public url')

      const { error: updErr } = await supabase.from('recipes').update({ photo_url: url }).eq('id', id)
      if (updErr) throw updErr

      showToast('Photo updated ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Upload step photo (one per step)
  const uploadStepPhoto = async (stepIdx: number, file: File) => {
    if (!id) return
    setStepUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `recipes/${id}/steps/${stepIdx + 1}-${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('recipe-photos').upload(key, file, {
        upsert: true,
        contentType: file.type,
      })
      if (upErr) throw upErr

      const { data: pub } = supabase.storage.from('recipe-photos').getPublicUrl(key)
      const url = pub?.publicUrl
      if (!url) throw new Error('Failed to get public url')

      setStepPhotos((prev) => prev.map((x, i) => (i === stepIdx ? url : x)))
      showToast(`Step ${stepIdx + 1} photo set ✅ (press Save to store)`)
    } catch (e: any) {
      showToast(e?.message ?? 'Step upload failed')
    } finally {
      setStepUploading(false)
    }
  }

  const removeStepPhoto = (stepIdx: number) => {
    setStepPhotos((prev) => prev.map((x, i) => (i === stepIdx ? '' : x)))
    showToast(`Step ${stepIdx + 1} photo removed (press Save)`)
  }

  // -------------------------
  
  // -------------------------
  // Net/Gross (Kitopi Sync)
  // -------------------------
  const clampYield = (y: number) => Math.min(100, Math.max(0.01, y))
  const yieldFromNetGross = (netQty: number, grossQty: number) => {
    const g = Math.max(0, grossQty)
    const n = Math.max(0, netQty)
    if (n > 0 && g > 0) return clampYield((n / g) * 100)
    return 100
  }

  const round6 = (n: number) => (Number.isFinite(n) ? Math.round(n * 1_000_000) / 1_000_000 : 0)

  const grossFromNet = (netQty: number, yPct: number) => {
    const y = clampYield(yPct) / 100
    return round6(netQty / y)
  }

  const netFromGross = (grossQty: number, yPct: number) => {
    const y = clampYield(yPct) / 100
    return round6(grossQty * y)
  }

  const numOr0 = (x: any) => {
    const n = Number(x)
    return Number.isFinite(n) ? n : 0
  }

  const syncFromNet = (row: EditRow) => {
    const net = Math.max(0, numOr0(row.qty))
    const y = clampYield(Math.max(0.01, numOr0(row.yield_percent)))
    const gross = grossFromNet(net, y)
    return { ...row, gross_qty_override: String(gross), gross_mode: 'sync' as const }
  }

  const syncFromGross = (row: EditRow) => {
    const gross = Math.max(0, numOr0(row.gross_qty_override))
    const y = clampYield(Math.max(0.01, numOr0(row.yield_percent)))
    const net = netFromGross(gross, y)
    return { ...row, qty: String(net), gross_mode: 'manual' as const }
  }
// Lines CRUD
  // -------------------------
  const addLineInline = async () => {
    if (!id) return
    const netIn = Math.max(0, toNum(addQty, 0))
    const grossIn = Math.max(0, toNum(addGrossQty, 0))
    const qty = netIn > 0 ? netIn : grossIn
    const y = yieldFromNetGross(qty, grossIn)

    if (qty <= 0 && grossIn <= 0) return showToast('Enter Net and/or Gross (must be > 0)')
    const grossOverride = grossIn > 0 ? grossIn : null

    setSavingAdd(true)
    try {
      const maxSort = lines.length ? Math.max(...lines.map((x) => toNum(x.position, 0))) : 0
      const base: any = {
        recipe_id: id,
        kitchen_id: recipe?.kitchen_id ?? null,
        position: maxSort + 10,
        notes: addNote.trim() || null,
      }

      if (addType === 'ingredient') {
        if (!addIngredientId) throw new Error('Pick an ingredient')
        const payload = {
          ...base,
          line_type: 'ingredient',
          ingredient_id: addIngredientId,
          sub_recipe_id: null,
          qty,
          unit: safeUnit(addUnit),
          yield_percent: y,
          gross_qty_override: grossOverride,
          group_title: null,
        }
        const { error } = await supabase.from('recipe_lines').insert(payload)
        if (error) throw error
      } else if (addType === 'subrecipe') {
        if (!addSubRecipeId) throw new Error('Pick a sub-recipe')
        const payload = {
          ...base,
          line_type: 'subrecipe',
          ingredient_id: null,
          sub_recipe_id: addSubRecipeId,
          qty,
          unit: safeUnit(addUnit),
          yield_percent: y,
          gross_qty_override: grossOverride,
          group_title: null,
        }
        const { error } = await supabase.from('recipe_lines').insert(payload)
        if (error) throw error
      }

      setAddIngredientId('')
      setAddSubRecipeId('')
      setAddQty('1')
      setAddUnit('g')
      setAddYieldPercent('100')
      setAddGrossQty('')
      setAddNote('')
      showToast('Added ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Add failed')
    } finally {
      setSavingAdd(false)
    }
  }

  const addGroup = async () => {
    if (!id) return
    const title = groupTitle.trim()
    if (!title) return showToast('Write group title first')

    setSavingGroup(true)
    try {
      const maxSort = lines.length ? Math.max(...lines.map((x) => toNum(x.position, 0))) : 0
      const payload = {
        recipe_id: id,
        kitchen_id: recipe?.kitchen_id ?? null,
        ingredient_id: null,
        sub_recipe_id: null,
        qty: 0,
        unit: 'g',
        yield_percent: 100,
        gross_qty_override: null,
        notes: null,
        position: maxSort + 10,
        line_type: 'group',
        group_title: title,
      }
      const { error } = await supabase.from('recipe_lines').insert(payload as any)
      if (error) throw error
      setGroupTitle('')
      showToast('Group added ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Add group failed')
    } finally {
      setSavingGroup(false)
    }
  }

  const saveRow = async (lineId: string) => {
    if (!id) return
    const row = edit[lineId]
    const current = lines.find((x) => x.id === lineId)
    if (!row || !current) return

    setRowSaving((p) => ({ ...p, [lineId]: true }))
    try {
      if (row.line_type === 'group') {
        const title = row.group_title.trim()
        if (!title) throw new Error('Group title required')
        const { error } = await supabase
          .from('recipe_lines')
          .update({
            line_type: 'group',
            group_title: title,
            ingredient_id: null,
            sub_recipe_id: null,
            qty: 0,
            unit: 'g',
            yield_percent: 100,
            gross_qty_override: null,
            notes: null,
          })
          .eq('id', lineId)
          .eq('recipe_id', id)
        if (error) throw error
        showToast('Saved ✅')
        await loadAll(id)
        return
      }

      const qty = Math.max(0, toNum(row.qty, 0))
      if (qty <= 0) throw new Error('Qty must be > 0')

      if (row.line_type === 'ingredient') {
        const ingredient_id = row.ingredient_id || null
        if (!ingredient_id) throw new Error('Pick an ingredient')
        const { error } = await supabase
          .from('recipe_lines')
          .update({
            line_type: 'ingredient',
            ingredient_id,
            sub_recipe_id: null,
            qty,
            unit: safeUnit(row.unit),
            yield_percent: clampYield(toNum((row as any).yield_percent, 100)),
            gross_qty_override: (() => {
              const g = toNum((row as any).gross_qty_override, 0)
              return g > 0 ? g : null
            })(),
            notes: row.notes.trim() || null,
            group_title: null,
          })
          .eq('id', lineId)
          .eq('recipe_id', id)
        if (error) throw error
      }

      if (row.line_type === 'subrecipe') {
        const sub_recipe_id = row.sub_recipe_id || null
        if (!sub_recipe_id) throw new Error('Pick a sub-recipe')
        const { error } = await supabase
          .from('recipe_lines')
          .update({
            line_type: 'subrecipe',
            ingredient_id: null,
            sub_recipe_id,
            qty,
            unit: safeUnit(row.unit),
            yield_percent: clampYield(toNum((row as any).yield_percent, 100)),
            gross_qty_override: (() => {
              const g = toNum((row as any).gross_qty_override, 0)
              return g > 0 ? g : null
            })(),
            notes: row.notes.trim() || null,
            group_title: null,
          })
          .eq('id', lineId)
          .eq('recipe_id', id)
        if (error) throw error
      }

      showToast('Saved ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setRowSaving((p) => ({ ...p, [lineId]: false }))
    }
  }

  const deleteLine = async (lineId: string) => {
    if (!id) return
    try {
      const { error } = await supabase.from('recipe_lines').delete().eq('id', lineId).eq('recipe_id', id)
      if (error) throw error
      showToast('Deleted ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Delete failed')
    }
  }

  const duplicateLine = async (lineId: string) => {
    if (!id) return
    try {
      const src = lines.find((x) => x.id === lineId)
      if (!src) return
      const payload: any = {
        recipe_id: id,
        position: toNum(src.position, 0) + 5,
        line_type: src.line_type,
        ingredient_id: src.line_type === 'ingredient' ? src.ingredient_id : null,
        sub_recipe_id: src.line_type === 'subrecipe' ? src.sub_recipe_id : null,
        qty: src.line_type === 'group' ? 0 : src.qty,
        unit: src.line_type === 'group' ? 'g' : safeUnit(src.unit),
        notes: src.notes,
        group_title: src.line_type === 'group' ? (src.group_title ?? 'Group') : null,
      }
      const { error } = await supabase.from('recipe_lines').insert(payload)
      if (error) throw error
      showToast('Duplicated ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Duplicate failed')
    }
  }

  const persistOrder = async (ordered: Line[]) => {
    if (!id) return
    setReorderSaving(true)
    try {
      const tasks = ordered.map((x, idx) =>
        supabase.from('recipe_lines').update({ position: (idx + 1) * 10 }).eq('id', x.id).eq('recipe_id', id)
      )
      const results = await Promise.all(tasks)
      const bad = results.find((r) => r.error)
      if (bad?.error) throw bad.error
      showToast('Order saved ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Reorder failed')
    } finally {
      setReorderSaving(false)
    }
  }

  const moveLine = async (lineId: string, dir: -1 | 1) => {
    const idx = lines.findIndex((x) => x.id === lineId)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= lines.length) return
    const next = [...lines]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setLines(next)
    await persistOrder(next)
  }

  // -------------------------
  // Breakdown render (depth up to 2) + lazy ensure
  // -------------------------
  const toggleExpand = async (lineId: string, subRecipeId?: string | null) => {
    const next = !expanded[lineId]
    if (next && subRecipeId) {
      try {
        await ensureRecipeLinesLoaded(subRecipeId)
      } catch {}
    }
    setExpanded((p) => ({ ...p, [lineId]: next }))
  }

  const renderBreakdown = (subRecipeId: string, depth: number) => {
    const r = recipeById.get(subRecipeId)
    const rLines = recipeLinesCache[subRecipeId] ?? []
    if (!r) return null

    const res = costMemo.get(subRecipeId)
    const yq = toNum(r.yield_qty, 0)
    const yu = safeUnit(r.yield_unit ?? '')
    const perUnit = yq > 0 ? res.cost / yq : 0

    return (
      <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-[220px]">
            <div className="text-xs font-semibold text-neutral-600">SUB-RECIPE BREAKDOWN</div>
            <div className="text-sm font-extrabold">{r.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>
                Yield: <span className="font-semibold">{yq || '—'}</span> {yu || '—'}
              </span>
              <span className="text-neutral-300">•</span>
              <span>
                Cost / yield unit: <span className="font-semibold">{fmtMoney(perUnit, currency)}</span>
              </span>
            </div>
          </div>

          <div className="text-sm font-extrabold">{fmtMoney(res.cost, currency)}</div>
        </div>

        {res.warnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-700">
            {res.warnings.slice(0, 3).map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {rLines
            .filter((x) => x.line_type !== 'group')
            .map((l) => {
              if (l.line_type === 'ingredient') {
                const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : undefined
                const label = ing?.name ?? 'Ingredient'
                return (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    style={{ paddingLeft: depth * 12 }}
                  >
                    <div className="text-neutral-700">
                      • {label} — <span className="font-semibold">{l.qty}</span> <UnitBadge unit={l.unit} />
                    </div>
                    <div className="text-neutral-500">{l.notes ? l.notes : ''}</div>
                  </div>
                )
              }
              if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
                const child = recipeById.get(l.sub_recipe_id)
                return (
                  <div key={l.id} style={{ paddingLeft: depth * 12 }}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="text-neutral-700">
                        • {child?.name ?? 'Sub-recipe'} — <span className="font-semibold">{l.qty}</span> <UnitBadge unit={l.unit} />
                      </div>
                      <div className="text-neutral-500">{l.notes ? l.notes : ''}</div>
                    </div>
                    {depth < 2 ? renderBreakdown(l.sub_recipe_id, depth + 1) : null}
                  </div>
                )
              }
              return null
            })}
        </div>
      </div>
    )
  }

  // -------------------------
  // Pack D: Prep list for print (scaled)
  // -------------------------
  const prepPrint = useMemo(() => {
    const p = Math.max(1, toNum(portions, 1))
    const base = Math.max(1, toNum(recipe?.portions, 1))
    const scale = p / base

    const items: { label: string; qty: number; unit: string; notes: string }[] = []

    for (const l of lines) {
      if (l.line_type !== 'ingredient') continue
      if (!l.ingredient_id) continue
      const ing = ingById.get(l.ingredient_id)
      const label = ing?.name ?? 'Ingredient'
      items.push({
        label,
        qty: Math.max(0, toNum(l.qty, 0) * scale),
        unit: safeUnit(l.unit),
        notes: (l.notes ?? '').trim(),
      })
    }

    const m = new Map<string, { label: string; qty: number; unit: string; notes: string }>()
    for (const it of items) {
      const key = `${it.label}__${it.unit}__${it.notes}`
      const cur = m.get(key)
      if (!cur) m.set(key, { ...it })
      else m.set(key, { ...cur, qty: cur.qty + it.qty })
    }

    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [lines, ingById, portions, recipe?.portions])

  // -------------------------
  // Pack D: Cost history memo
  // -------------------------
  const costPoints = useMemo(() => {
    if (!id) return []
    return listCostPoints(id)
  }, [id, savingMeta, metaStatus, costOpen])

  const printNow = () => {
    setTimeout(() => {
      try {
        window.print()
      } catch {}
    }, 50)
  }

  // -------------------------
  // Guards
  // -------------------------
  if (loading) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">LOADING</div>
        <div className="text-sm text-neutral-600">Loading editor…</div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">ERROR</div>
        <div className="text-sm text-red-600">{err}</div>
        <div className="text-xs text-neutral-500">
          Debug: <span className="font-mono">{location.pathname + location.search}</span>
        </div>
        <NavLink className="gc-btn gc-btn-primary" to="/recipes">
          Back to Recipes
        </NavLink>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">NOT FOUND</div>
        <div className="text-sm text-neutral-600">Recipe not found.</div>
        <NavLink className="gc-btn gc-btn-primary" to="/recipes">
          Back to Recipes
        </NavLink>
      </div>
    )
  }

  const metaBadge =
    metaStatus === 'saving'
      ? 'Saving…'
      : metaStatus === 'dirty'
      ? 'Unsaved'
      : lastSavedAt
      ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
      : 'Saved'

  // =========================
  // UI
  // =========================
  return (
    <div className="gc-editor gc-editor-ultra space-y-6">
      {/* Ultra Hero (no sticky) */}
      <div className="gc-card gc-editor-hero">
        <div className="gc-editor-hero-top">
          <div>
            <div className="gc-label">RECIPE EDITOR</div>
            <div className="gc-editor-hero-title">{isKitchen ? 'Kitchen Mode' : 'Management Mode'}</div>
            <div className="gc-editor-hero-sub">Edit recipe meta, build lines, and manage method & pricing.</div>
          </div>

          <div className="gc-editor-hero-status">
            <span
              className={`gc-status-pill ${
                metaStatus === 'dirty'
                  ? 'is-warn'
                  : metaStatus === 'saving'
                  ? 'is-info'
                  : 'is-ok'
              }`}
            >
              {metaBadge}
            </span>
          </div>
        </div>

        <div className="gc-editor-hero-grid">
          {/* Media */}
          <div className="gc-editor-media">
            <div className="gc-editor-photo">
              {recipe.photo_url ? (
                <img src={recipe.photo_url} alt={name} />
              ) : (
                <div className="gc-editor-photo-empty">No Photo</div>
              )}
            </div>

            <label className="gc-btn gc-btn-ghost gc-btn-wide cursor-pointer">
              {uploading ? 'Uploading…' : 'Upload Photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const ff = e.target.files?.[0]
                  if (ff) uploadPhoto(ff)
                  e.currentTarget.value = ''
                }}
                disabled={uploading}
              />
            </label>

            <div className="gc-editor-mini">
              <div className="gc-editor-mini-label">Recipe ID</div>
              <div className="gc-editor-mini-value">{recipe.id}</div>
            </div>
          </div>

          {/* Fields */}
          <div className="gc-editor-fields">
            <div className="gc-form-grid">
              <div className="gc-field">
                <div className="gc-label">NAME</div>
                <input className="gc-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Cajun Chicken Bowl" />
              </div>

              <div className="gc-field">
                <div className="gc-label">CATEGORY</div>
                <input
                  className="gc-input w-full"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Veg / Chicken / Dessert…"
                />
              </div>

              <div className="gc-field">
                <div className="gc-label">PORTIONS</div>
                <input
                  className="gc-input w-full"
                  type="number"
                  min={1}
                  step="1"
                  value={portions}
                  onChange={(e) => setPortions(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div className="gc-field">
                <div className="gc-label">QUICK ACTIONS</div>
                <div className="gc-editor-actions">
                  <button className="gc-btn gc-btn-primary" onClick={() => saveMeta()} disabled={savingMeta}>
                    {savingMeta ? 'Saving…' : 'Save'}
                  </button>

                  <button className="gc-btn gc-btn-ghost" type="button" onClick={printNow}>
                    Print Card
                  </button>

                  {isMgmt && (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setCostOpen((v) => !v)}>
                      Cost History
                    </button>
                  )}

                  <NavLink className="gc-btn gc-btn-ghost" to={`/cook?id=${recipe.id}`}>
                    Cook Mode
                  </NavLink>

                  <button className="gc-btn gc-btn-ghost" type="button" onClick={smartBack}>
                    Back
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          {isMgmt && (
            <div className="gc-editor-stats">
              <div className="gc-label">COST (RECURSIVE)</div>
              <div className="gc-editor-cost">{fmtMoney(totalCost, currency)}</div>
              <div className="gc-editor-cost-sub">
                Cost / portion <span className="gc-editor-cost-strong">{fmtMoney(cpp, currency)}</span>
              </div>

              <div className="gc-editor-divider" />

              <div className="gc-editor-kpis">
                <div className="gc-mini-kpi">
                  <div className="gc-mini-kpi-label">Lines</div>
                  <div className="gc-mini-kpi-value">{lines.length}</div>
                </div>
                <div className="gc-mini-kpi">
                  <div className="gc-mini-kpi-label">Portions</div>
                  <div className="gc-mini-kpi-value">{toNum(portions, 1)}</div>
                </div>
                <div className="gc-mini-kpi">
                  <div className="gc-mini-kpi-label">CPP</div>
                  <div className="gc-mini-kpi-value">{fmtMoney(cpp, currency)}</div>
                </div>
              </div>

              {totalCostRes.warnings.length > 0 && (
                <div className="gc-editor-warn">
                  {totalCostRes.warnings.slice(0, 2).map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sub-Recipe Settings (Mgmt only) */}
        {isMgmt && (
          <div className="gc-editor-subrecipe">
            <div className="gc-editor-subrecipe-head">
              <div>
                <div className="gc-label">SUB-RECIPE SETTINGS</div>
                <div className="gc-help">
                  Enable this to use the recipe inside other recipes by quantity of yield.
                </div>
              </div>

              <button className="gc-btn gc-btn-ghost" type="button" onClick={yieldSmart} disabled={yieldSmartLoading}>
                {yieldSmartLoading ? 'Calculating…' : 'Yield Smart'}
              </button>
            </div>

            <div className="gc-editor-subrecipe-grid">
              <label className="gc-check">
                <input type="checkbox" checked={isSubRecipe} onChange={(e) => setIsSubRecipe(e.target.checked)} />
                <span>This is a Sub-Recipe</span>
              </label>

              <div className="gc-field">
                <div className="gc-label">YIELD QTY</div>
                <input
                  className="gc-input w-full"
                  type="number"
                  min={0}
                  step="0.01"
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  disabled={!isSubRecipe}
                  placeholder="e.g., 500"
                />
              </div>

              <div className="gc-field">
                <div className="gc-label">YIELD UNIT</div>
                <select
                  className="gc-input w-full"
                  value={yieldUnit}
                  onChange={(e) => setYieldUnit(e.target.value as any)}
                  disabled={!isSubRecipe}
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>

            {isSubRecipe && (yieldQty.trim() === '' || !yieldUnit) ? (
              <div className="gc-note-warn">Tip: set Yield Qty + Unit then press Save.</div>
            ) : null}
          </div>
        )}
      </div>

      {/* Pack D: Cost History (Mgmt only) */}
      {isMgmt && costOpen && id ? (
        <div className="gc-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="gc-label">COST HISTORY (LOCAL)</div>
              <div className="mt-1 text-xs text-neutral-500">Logged on successful Save.</div>
            </div>
            <div className="flex gap-2">
              <button
                className="gc-btn gc-btn-ghost"
                type="button"
                onClick={() => {
                  clearCostPoints(id)
                  showToast('History cleared ✅')
                  setCostOpen(true)
                }}
              >
                Clear
              </button>
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setCostOpen(false)}>
                Close
              </button>
            </div>
          </div>

          {costPoints.length === 0 ? (
            <div className="mt-4 text-sm text-neutral-600">No points yet.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {costPoints.slice(0, 12).map((p, idx) => {
                const prev = costPoints[idx + 1]
                const delta = prev ? p.totalCost - prev.totalCost : null
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-extrabold">
                        {fmtMoney(p.totalCost, p.currency)}{' '}
                        <span className="text-xs text-neutral-500">({p.portions} portions)</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {new Date(p.createdAt).toLocaleString()} · CPP {fmtMoney(p.cpp, p.currency)}
                      </div>
                      {delta != null ? (
                        <div className="text-xs">
                          Δ Total: <span className="font-semibold">{fmtMoney(delta, p.currency)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="gc-btn gc-btn-ghost"
                        type="button"
                        onClick={() => {
                          deleteCostPoint(id, p.id)
                          showToast('Deleted ✅')
                          setCostOpen(true)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="gc-section-head">
        <div>
          <div className="gc-section-title">OVERVIEW</div>
          <div className="gc-section-sub">Description, nutrition and pricing — organized into clean panels.</div>
        </div>
      </div>

      {/* Premium Panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Description */}
        <div className="gc-card p-6">
          <div className="gc-label">DESCRIPTION</div>
          <textarea
            className="gc-input mt-3 w-full min-h-[140px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short premium description for menu / customers..."
          />
        </div>

        {/* Nutrition (Mgmt only) */}
        {isMgmt && (
          <div className="gc-card p-6">
            <div>
              <div className="gc-label">NUTRITION (PER PORTION)</div>
              <div className="mt-1 text-xs text-neutral-500">Manual input only.</div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="gc-label">CALORIES</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={0}
                  step="1"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
              </div>
              <div>
                <div className="gc-label">PROTEIN (g)</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={0}
                  step="0.1"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
              </div>
              <div>
                <div className="gc-label">CARBS (g)</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={0}
                  step="0.1"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </div>
              <div>
                <div className="gc-label">FAT (g)</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={0}
                  step="0.1"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pricing (Mgmt only) */}
        {isMgmt && (
          <div className="gc-card p-6 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="gc-label">PRICING PREMIUM (PER PORTION)</div>
                <div className="mt-1 text-sm text-neutral-600">Food Cost% + Margin + Suggested Price from target.</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="gc-btn gc-btn-ghost" type="button" onClick={applySuggested}>
                  Apply Suggested
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div>
                <div className="gc-label">CURRENCY</div>
                <input
                  className="gc-input mt-2 w-full"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                />
              </div>
              <div>
                <div className="gc-label">SELLING PRICE</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={0}
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="e.g., 8.50"
                />
              </div>
              <div>
                <div className="gc-label">TARGET FOOD COST %</div>
                <input
                  className="gc-input mt-2 w-full"
                  type="number"
                  min={1}
                  max={99}
                  step="1"
                  value={targetFC}
                  onChange={(e) => setTargetFC(e.target.value)}
                  placeholder="30"
                />
              </div>
              <div>
                <div className="gc-label">SUGGESTED PRICE</div>
                <div className="gc-input mt-2 w-full flex items-center">
                  <span className="font-extrabold">{fmtMoney(suggestedPrice || 0, currency)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="gc-kpi">
                <div className="gc-kpi-label">Food Cost %</div>
                <div className="gc-kpi-value">{fcPct == null ? '—' : `${Math.round(fcPct * 10) / 10}%`}</div>
              </div>
              <div className="gc-kpi">
                <div className="gc-kpi-label">Margin / portion</div>
                <div className="gc-kpi-value">{sell > 0 ? fmtMoney(margin, currency) : '—'}</div>
              </div>
              <div className="gc-kpi">
                <div className="gc-kpi-label">Margin %</div>
                <div className="gc-kpi-value">{marginPct == null ? '—' : `${Math.round(marginPct * 10) / 10}%`}</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Tip: Use <span className="font-semibold">Ctrl/Cmd+S</span> to save quickly. Use{' '}
              <span className="font-semibold">Ctrl/Cmd+Enter</span> to add a step.
            </div>
          </div>
        )}
      </div>

      <div className="gc-section-head">
        <div>
          <div className="gc-section-title">METHOD</div>
          <div className="gc-section-sub">Steps and photos — optimized for kitchen readability.</div>
        </div>
      </div>

      {/* Step Builder */}
      <div className="gc-card p-6">
        <div className="gc-label">STEP BUILDER (WITH PHOTOS)</div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            ref={newStepInputRef}
            className="gc-input"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Write step… (Ctrl/Cmd+Enter to add)"
          />
          <button className="gc-btn gc-btn-primary" type="button" onClick={addStep}>
            + Add Step
          </button>
        </div>

        {steps.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-600">No steps yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {steps.map((s, idx) => {
              const photo = (stepPhotos[idx] ?? '').trim()
              return (
                <div key={idx} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="gc-label">STEP {idx + 1}</div>
                    <div className="flex gap-2">
                      <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveStep(idx, -1)}>
                        ↑
                      </button>
                      <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveStep(idx, 1)}>
                        ↓
                      </button>
                      <button className="gc-btn gc-btn-ghost" type="button" onClick={() => removeStep(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <textarea className="gc-input mt-3 w-full min-h-[90px]" value={s} onChange={(e) => updateStep(idx, e.target.value)} />

                  <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-neutral-600">STEP PHOTO</div>
                        <div className="text-xs text-neutral-500">
                          Upload one image per step (stored when you press Save).
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <label className="gc-btn gc-btn-ghost cursor-pointer">
                          {stepUploading ? 'Uploading…' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const ff = e.target.files?.[0]
                              if (ff) uploadStepPhoto(idx, ff)
                              e.currentTarget.value = ''
                            }}
                            disabled={stepUploading}
                          />
                        </label>

                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => removeStepPhoto(idx)} disabled={!photo}>
                          Remove Photo
                        </button>
                      </div>
                    </div>

                    {photo ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                        <img src={photo} alt={`Step ${idx + 1}`} className="w-full max-h-[260px] object-cover" />
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-neutral-500">No photo for this step.</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="gc-section-head">
        <div>
          <div className="gc-section-title">INGREDIENTS</div>
          <div className="gc-section-sub">Add lines fast, then refine details — clean spacing and clear hierarchy.</div>
        </div>
      </div>

      {/* LINES */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="gc-label">LINES (INGREDIENTS + SUB-RECIPES)</div>
            <div className="mt-1 text-sm text-neutral-600">
              Inline add · Groups · Notes · Reorder · Duplicate · Expand breakdown.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">{reorderSaving ? 'Saving order…' : ''}</div>
            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => loadAll(id!)}>
              Refresh
            </button>
          </div>
        </div>

        {/* Inline Add */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[.7fr_1.6fr_.7fr_.55fr_.7fr_1fr_auto]">
          <div>
            <div className="gc-label">TYPE</div>
            <select className="gc-input mt-2 w-full" value={addType} onChange={(e) => setAddType(e.target.value as any)}>
              <option value="ingredient">Ingredient</option>
              <option value="subrecipe">Sub-recipe</option>
            </select>
          </div>

          <div>
            <div className="gc-label">{addType === 'ingredient' ? 'INGREDIENT' : 'SUB-RECIPE'}</div>
            {addType === 'ingredient' ? (
              <>
                <input
                  className="gc-input mt-2 w-full"
                  value={ingSearch}
                  onChange={(e) => setIngSearch(e.target.value)}
                  placeholder="Filter ingredients…"
                />
                <select className="gc-input mt-2 w-full" value={addIngredientId} onChange={(e) => setAddIngredientId(e.target.value)}>
                  <option value="">Select ingredient…</option>
                  {filteredIngredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name ?? i.id}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select className="gc-input mt-2 w-full" value={addSubRecipeId} onChange={(e) => setAddSubRecipeId(e.target.value)}>
                <option value="">Select sub-recipe…</option>
                {subRecipeOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (yield: {toNum(r.yield_qty, 0)} {safeUnit(r.yield_unit ?? '') || '—'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <div className="gc-label">NET QTY + UNIT</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className="gc-input"
                type="number"
                min={0}
                step="0.01"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="Net"
              />
              <select className="gc-input" value={addUnit} onChange={(e) => setAddUnit(e.target.value as any)}>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
          </div>

          <div>
            <div className="gc-label">YIELD % (AUTO)</div>
            <div className="relative mt-2">
              <input
                className="gc-input w-full pr-8 text-right tabular-nums"
                type="number"
                value={addYieldPercent}
                readOnly
                aria-readonly="true"
                title="Auto: Yield% = Net ÷ Gross"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500">%</span>
            </div>
          </div>

          <div>
            <div className="gc-label">GROSS QTY</div>
            <input
              className="gc-input mt-2 w-full text-right tabular-nums"
              type="number"
              min={0}
              step="0.01"
              value={addGrossQty}
              onChange={(e) => setAddGrossQty(e.target.value)}
              placeholder="optional"
            />
            <div className="mt-1 text-[11px] text-neutral-500">If set, it will be saved as manual gross.</div>
          </div>

          <div>
            <div className="gc-label">NOTE</div>
            <input className="gc-input mt-2 w-full" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="optional…" />
          </div>

          <div className="flex items-end">
            <button className="gc-btn gc-btn-primary w-full" type="button" onClick={addLineInline} disabled={savingAdd}>
              {savingAdd ? 'Saving…' : '+ Add'}
            </button>
          </div>
        </div>

        {/* Add Group (Mgmt only) */}
        {isMgmt && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="gc-label">ADD GROUP HEADER</div>
              <input
                className="gc-input mt-2 w-full"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="e.g., Sauce / Filling / Topping"
              />
            </div>
            <div className="flex items-end">
              <button className="gc-btn gc-btn-ghost w-full" type="button" onClick={addGroup} disabled={savingGroup}>
                {savingGroup ? 'Saving…' : '+ Add Group'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {lines.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-600">No lines yet.</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="gc-lines-header grid grid-cols-[1.55fr_.55fr_.55fr_.55fr_.65fr_1fr_1.2fr] items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
              <div className="whitespace-nowrap">Item</div>
              <div className="text-right whitespace-nowrap">Net Qty</div>
              <div className="text-right whitespace-nowrap">Unit</div>
              <div className="text-right whitespace-nowrap">Yield %</div>
              <div className="text-right whitespace-nowrap">Gross Qty</div>
              <div className="whitespace-nowrap">Note</div>
              <div className="text-right whitespace-nowrap">Actions</div>
            </div>

            <div className="divide-y divide-neutral-200">
              {lines.map((l) => {
                const row = edit[l.id]
                const saving = rowSaving[l.id] === true

                if ((row?.line_type ?? l.line_type) === 'group') {
                  const title = row?.group_title ?? l.group_title ?? ''
                  return (
                    <div key={l.id} className="px-4 py-3 bg-neutral-50">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-[260px]">
                          <div className="gc-label">GROUP</div>
                          <input
                            className="gc-input mt-2 w-full font-semibold"
                            value={title}
                            onChange={(ev) =>
                              setEdit((p) => ({
                                ...p,
                                [l.id]: {
                                  ...(p[l.id] || {
                                    line_type: 'group',
                                    ingredient_id: '',
                                    sub_recipe_id: '',
                                    qty: '0',
                                    unit: 'g',
                                    yield_percent: '100',
                                    gross_qty_override: '',
                                    gross_mode: 'sync',
                                    notes: '',
                                    group_title: '',
                                  }),
                                  line_type: 'group',
                                  group_title: ev.target.value,
                                },
                              }))
                            }
                            placeholder="Group title…"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button className="gc-btn gc-btn-ghost gc-btn-icon" type="button" onClick={() => moveLine(l.id, -1)} disabled={reorderSaving} title="Move up">
                            ↑
                          </button>
                          <button className="gc-btn gc-btn-ghost gc-btn-icon" type="button" onClick={() => moveLine(l.id, 1)} disabled={reorderSaving} title="Move down">
                            ↓
                          </button>
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => duplicateLine(l.id)}>
                            Duplicate
                          </button>
                          <button className="gc-btn gc-btn-primary" type="button" onClick={() => saveRow(l.id)} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deleteLine(l.id)} disabled={saving}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

                const r =
                  row ||
                  ({
                    line_type: l.line_type,
                    ingredient_id: l.ingredient_id ?? '',
                    sub_recipe_id: l.sub_recipe_id ?? '',
                    qty: String((l as any).qty ?? 0),
                    unit: safeUnit((l as any).unit ?? 'g'),
                    yield_percent: String((l as any).yield_percent ?? 100),
                    gross_qty_override: String(((l as any).gross_qty_override ?? '') as any),
                    gross_mode: (l as any).gross_qty_override != null ? 'manual' : 'sync',
                    notes: ((l as any).notes ?? (l as any).note ?? '') as any,
                    group_title: (l as any).group_title ?? '',
                  } as EditRow)

                const setRow = (patch: Partial<EditRow>) =>
                  setEdit((p) => ({
                    ...p,
                    [l.id]: { ...r, ...patch },
                  }))

                let rightInfo = ''
                if (r.line_type === 'ingredient' && r.ingredient_id) {
                  const ing = ingById.get(r.ingredient_id)
                  const net = toNum(ing?.net_unit_cost, 0)
                  const packUnit = safeUnit(ing?.pack_unit ?? 'g')
                  const conv = convertQtyToPackUnit(toNum(r.qty, 0), r.unit, packUnit)
                  rightInfo = fmtMoney(conv * net, currency)
                } else if (r.line_type === 'subrecipe' && r.sub_recipe_id) {
                  const child = recipeById.get(r.sub_recipe_id)
                  const childRes = child ? costMemo.get(child.id) : { cost: 0, warnings: [] as string[] }
                  const yq = child ? toNum(child.yield_qty, 0) : 0
                  const yu = child ? safeUnit(child.yield_unit ?? '') : ''
                  const conv = child ? convertQty(toNum(r.qty, 0), r.unit, yu) : { ok: false, value: 0 }
                  const lc = child && yq > 0 && conv.ok ? conv.value * (childRes.cost / yq) : 0
                  rightInfo = fmtMoney(lc, currency)
                }

                const canExpand = r.line_type === 'subrecipe' && !!r.sub_recipe_id

                return (
                  <div key={l.id} className="px-4 py-3">
                    <div className="gc-line-row grid grid-cols-[1.55fr_.55fr_.55fr_.55fr_.65fr_1fr_1.2fr] items-center gap-3">
                      <div className="pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="gc-input w-[150px]"
                            value={r.line_type}
                            onChange={(ev) => setRow({ line_type: ev.target.value as any, ingredient_id: '', sub_recipe_id: '', yield_percent: '100', gross_qty_override: '', gross_mode: 'sync' })}
                          >
                            <option value="ingredient">Ingredient</option>
                            <option value="subrecipe">Sub-recipe</option>
                          </select>

                          {r.line_type === 'ingredient' ? (
                            <select className="gc-input flex-1 min-w-[220px]" value={r.ingredient_id} onChange={(ev) => setRow({ ingredient_id: ev.target.value })}>
                              <option value="">Select…</option>
                              {activeIngredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name ?? i.id}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select className="gc-input flex-1 min-w-[220px]" value={r.sub_recipe_id} onChange={(ev) => setRow({ sub_recipe_id: ev.target.value })}>
                              <option value="">Select…</option>
                              {subRecipeOptions.map((sr) => (
                                <option key={sr.id} value={sr.id}>
                                  {sr.name} (yield: {toNum(sr.yield_qty, 0)} {safeUnit(sr.yield_unit ?? '') || '—'})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {isMgmt && (
                          <div className="mt-1 text-[11px] text-neutral-500 flex items-center justify-between">
                            <span className="truncate">{rightInfo ? 'Line cost computed' : ''}</span>
                            <span className="font-semibold">{rightInfo}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <input
                          className="gc-input w-full text-right tabular-nums"
                          type="number"
                          min={0}
                          step="0.000001"
                          value={r.qty}
                          onChange={(ev) => {
                            const v = ev.target.value
                            setEdit((p) => {
                              const cur = p[l.id] || r
                              const next = { ...cur, qty: v }
                              const net = Math.max(0, toNum(v, 0))
                              const gross = Math.max(0, toNum(next.gross_qty_override, 0))
                              const y = yieldFromNetGross(net, gross)
                              return { ...p, [l.id]: { ...next, yield_percent: String(y) } }
                            })
                          }}
                        />
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <select className="gc-input w-full text-right" value={safeUnit(r.unit)} onChange={(ev) => {
                            // if unit changes and we're in sync mode, keep gross synced from net
                            setEdit((p) => {
                              const cur = p[l.id] || r
                              const next = { ...cur, unit: ev.target.value }
                              return { ...p, [l.id]: next }
                            })
                          }}>
                            <option value="g">g</option>
                            <option value="kg">kg</option>
                            <option value="ml">ml</option>
                            <option value="l">l</option>
                            <option value="pcs">pcs</option>
                          </select>
                        </div>
                      </div>

                      {/* Yield % (AUTO from Net/Gross) */}
                      <div className="text-right">
                        <div className="relative">
                          <input
                            className="gc-input w-full pr-8 text-right tabular-nums"
                            type="number"
                            value={r.yield_percent}
                            readOnly
                            aria-readonly="true"
                            title="Auto: Yield% = Net ÷ Gross"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500">%</span>
                        </div>
                        {(() => {
                          const net = Math.max(0, toNum(r.qty, 0))
                          const gross = Math.max(0, toNum(r.gross_qty_override, 0))
                          if (gross > 0 && net > gross) {
                            return <div className="mt-1 text-[11px] text-amber-700">Net &gt; Gross</div>
                          }
                          return null
                        })()}
                      </div>
{/* Gross Qty (manual + sync) */}
                      <div className="text-right">
                        <div className="gc-gross-wrap">
                          <input
                            className="gc-input w-full text-right tabular-nums"
                            type="number"
                            min={0}
                            step="0.000001"
                            value={r.gross_qty_override}
                            onChange={(ev) => {
                              const v = ev.target.value
                              setEdit((p) => {
                                const cur = p[l.id] || r
                                const next = { ...cur, gross_qty_override: v, gross_mode: 'manual' as const }
                                const net = Math.max(0, toNum(next.qty, 0))
                                const gross = Math.max(0, toNum(v, 0))
                                const y = yieldFromNetGross(net, gross)
                                return { ...p, [l.id]: { ...next, yield_percent: String(y) } }
                              })
                            }}
                            placeholder={(() => {
                              const net = Math.max(0, toNum(r.qty, 0))
                              const y = clampYield(toNum(r.yield_percent, 100))
                              return String(grossFromNet(net, y))
                            })()}
                          />
                          <button
                            className="gc-btn gc-btn-ghost gc-btn-icon"
                            type="button"
                            title="Sync gross from net (auto)"
                            onClick={() => {
                              setEdit((p) => {
                                const cur = p[l.id] || r
                                const net = Math.max(0, toNum(cur.qty, 0)); return { ...p, [l.id]: { ...cur, gross_mode: 'sync', gross_qty_override: String(net), yield_percent: '100' } }
                              })
                            }}
                          >
                            ↻
                          </button>
                        </div>
                      </div>

                      <div>
                        <input className="gc-input w-full" value={r.notes} onChange={(ev) => setRow({ notes: ev.target.value })} placeholder="e.g., chopped / room temp / to taste…" />
                      </div>

                      <div className="flex justify-end gap-2 flex-wrap">
                        {canExpand && (
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleExpand(l.id, r.sub_recipe_id)}>
                            {expanded[l.id] ? 'Hide' : 'Expand'}
                          </button>
                        )}
                        <button className="gc-btn gc-btn-ghost gc-btn-icon" type="button" onClick={() => moveLine(l.id, -1)} disabled={reorderSaving} title="Move up">
                          ↑
                        </button>
                        <button className="gc-btn gc-btn-ghost gc-btn-icon" type="button" onClick={() => moveLine(l.id, 1)} disabled={reorderSaving} title="Move down">
                          ↓
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => duplicateLine(l.id)}>
                          Duplicate
                        </button>
                        <button className="gc-btn gc-btn-primary" type="button" onClick={() => saveRow(l.id)} disabled={saving}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deleteLine(l.id)} disabled={saving}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {canExpand && expanded[l.id] && r.sub_recipe_id ? renderBreakdown(r.sub_recipe_id, 0) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ✅ Print Card (kept exactly like your structure) */}
      <div className="gc-print-only">
        <div className="gc-print-page">
          <div className="gc-print-header">
            <div>
              <div className="gc-print-name">{(name || 'Untitled').trim()}</div>
              <div className="gc-print-sub">
                {(category || '').trim() ? `Category: ${category.trim()} · ` : ''}
                Portions: {Math.max(1, toNum(portions, 1))}
                {isMgmt ? ` · CPP: ${fmtMoney(cpp, currency)}` : ''}
              </div>

              <div className="gc-print-tags">
                {isKitchen ? <span className="gc-print-tag">Kitchen</span> : <span className="gc-print-tag">Mgmt</span>}
                {isSubRecipe ? <span className="gc-print-tag">Sub-Recipe</span> : null}
                {isSubRecipe && yieldQty.trim() ? (
                  <span className="gc-print-tag">
                    Yield {yieldQty} {yieldUnit}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="gc-print-right">
              <div className="gc-print-photo">
                {recipe.photo_url ? <img src={recipe.photo_url} alt={name} /> : <div className="gc-print-photo-empty">No Photo</div>}
              </div>
            </div>
          </div>

          {(description || '').trim() ? (
            <div className="gc-print-block">
              <div className="gc-print-label">Description</div>
              <div className="gc-print-text">{description.trim()}</div>
            </div>
          ) : null}

          <div className="gc-print-grid">
            <div className="gc-print-block">
              <div className="gc-print-label">Prep List (Scaled)</div>
              {prepPrint.length === 0 ? (
                <div className="gc-print-muted">No ingredient lines.</div>
              ) : (
                <div className="gc-print-list">
                  {prepPrint.map((it, i) => (
                    <div key={i} className="gc-print-row">
                      <div>
                        <div className="gc-print-row-name">{it.label}</div>
                        {it.notes ? <div className="gc-print-row-note">{it.notes}</div> : null}
                      </div>
                      <div className="gc-print-row-right">
                        {Math.round(it.qty * 100) / 100} {it.unit}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="gc-print-block">
              <div className="gc-print-label">Steps</div>
              {steps.length === 0 ? (
                <div className="gc-print-muted">No steps.</div>
              ) : (
                <div className="gc-print-steps">
                  {steps.map((s, idx) => {
                    const photo = (stepPhotos[idx] ?? '').trim()
                    return (
                      <div key={idx} className="gc-print-step2">
                        <div className="gc-print-step2-head">
                          <div className="gc-print-step-n">{idx + 1}</div>
                          <div className="gc-print-step-t">{(s ?? '').trim()}</div>
                        </div>

                        {photo ? (
                          <div className="gc-print-step2-photo">
                            <img src={photo} alt={`Step ${idx + 1}`} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="gc-print-footer">
            <div className="gc-print-brand">GASTROCHEF</div>

            {isMgmt ? (
              <div className="gc-print-kpis">
                <div className="gc-print-kpi">
                  <div className="gc-print-kpi-l">Total Cost</div>
                  <div className="gc-print-kpi-v">{fmtMoney(totalCost, currency)}</div>
                </div>
                <div className="gc-print-kpi">
                  <div className="gc-print-kpi-l">CPP</div>
                  <div className="gc-print-kpi-v">{fmtMoney(cpp, currency)}</div>
                </div>
                <div className="gc-print-kpi">
                  <div className="gc-print-kpi-l">Selling</div>
                  <div className="gc-print-kpi-v">{sellingPrice ? fmtMoney(toNum(sellingPrice, 0), currency) : '—'}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
