// ✅ PACK D+ RECIPE EDITOR (Fix + Print Premium)
// NOTE: Same logic as Pack D, only D+ additions: QR + step photos in print + allergen tags local.

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { addCostPoint, clearCostPoints, listCostPoints, deleteCostPoint } from '../lib/costHistory'
import { getAllergens, setAllergens } from '../lib/allergenTags'

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

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

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

type EditRow = {
  line_type: LineType
  ingredient_id: string
  sub_recipe_id: string
  qty: string
  unit: string
  note: string
  group_title: string
}

type MetaStatus = 'saved' | 'saving' | 'dirty'

export default function RecipeEditor() {
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

  const [savingMeta, setSavingMeta] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])

  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')

  const [isSubRecipe, setIsSubRecipe] = useState(false)
  const [yieldQty, setYieldQty] = useState('')
  const [yieldUnit, setYieldUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')
  const [yieldSmartLoading, setYieldSmartLoading] = useState(false)

  // ✅ Pack D+ — Allergens (local)
  const [allergenInput, setAllergenInput] = useState('')

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
  const toggleExpand = (lineId: string) => setExpanded((p) => ({ ...p, [lineId]: !p[lineId] }))

  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})

  const [metaStatus, setMetaStatus] = useState<MetaStatus>('saved')
  const lastSavedSnapshotRef = useRef<string>('')

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

  const smartBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/recipes', { replace: true })
  }

  useEffect(() => {
    if (loading) return
    if (savingMeta) return
    const snap = currentMetaSnapshot()
    const dirty = snap !== lastSavedSnapshotRef.current
    setMetaStatus(dirty ? 'dirty' : 'saved')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    savingMeta,
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
      .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
      .eq('recipe_id', recipeId)
      .order('sort_order', { ascending: true })
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

    // ✅ Pack D+ allergens local load
    const tags = getAllergens(recipeId)
    setAllergenInput(tags.join(', '))

    const m: Record<string, EditRow> = {}
    for (const x of ll) {
      m[x.id] = {
        line_type: x.line_type ?? 'ingredient',
        ingredient_id: x.ingredient_id ?? '',
        sub_recipe_id: x.sub_recipe_id ?? '',
        qty: String(x.qty ?? 0),
        unit: safeUnit(x.unit ?? 'g'),
        note: x.note ?? '',
        group_title: x.group_title ?? '',
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
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
        .in('recipe_id', ids)
        .order('sort_order', { ascending: true })
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

  const totalCostRes = useMemo(() => {
    if (!recipe) return { cost: 0, warnings: [] as string[] }
    return getRecipeTotalCost(recipe.id, new Set<string>())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, recipeLinesCache, ingById, recipeById])

  const totalCost = totalCostRes.cost
  const cpp = totalCost / portionsN

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

      // ✅ Pack D: cost history after successful save
      addCostPoint(id, {
        totalCost,
        cpp,
        portions: Math.max(1, toNum(portions, 1)),
        currency: (currency || 'USD').toUpperCase(),
      })

      // ✅ Pack D+ — save allergens local on Save
      const tags = allergenInput
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      setAllergens(id, tags)

      lastSavedSnapshotRef.current = currentMetaSnapshot()
      setMetaStatus('saved')

      if (!opts?.silent) showToast('Saved ✅')
      if (!opts?.skipReload) await loadAll(id)
    } catch (e: any) {
      setMetaStatus('dirty')
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSavingMeta(false)
    }
  }

  useEffect(() => {
    const t = setInterval(() => {
      if (!id) return
      if (loading) return
      if (savingMeta) return
      if (uploading) return
      if (stepUploading) return
      if (metaStatus !== 'dirty') return
      saveMeta({ silent: true, skipReload: true, isAuto: true }).catch(() => {})
    }, 10_000)

    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, savingMeta, uploading, stepUploading, metaStatus])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveMeta().catch(() => {})
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        addStep()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    newStep,
    steps,
    stepPhotos,
    name,
    category,
    portions,
    description,
    methodLegacy,
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
    metaStatus,
  ])

  // Steps
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

  // Upload main photo
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

  // Upload step photo (local state until save)
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

  // Prep list for print (scaled)
  const prepPrint = useMemo(() => {
    const p = Math.max(1, toNum(portions, 1))
    const base = Math.max(1, toNum(recipe?.portions, 1))
    const scale = p / base

    const items: { label: string; qty: number; unit: string; note: string }[] = []

    for (const l of lines) {
      if (l.line_type !== 'ingredient') continue
      if (!l.ingredient_id) continue
      const ing = ingById.get(l.ingredient_id)
      const label = ing?.name ?? 'Ingredient'
      items.push({
        label,
        qty: Math.max(0, toNum(l.qty, 0) * scale),
        unit: safeUnit(l.unit),
        note: (l.note ?? '').trim(),
      })
    }

    const m = new Map<string, { label: string; qty: number; unit: string; note: string }>()
    for (const it of items) {
      const key = `${it.label}__${it.unit}__${it.note}`
      const cur = m.get(key)
      if (!cur) m.set(key, { ...it })
      else m.set(key, { ...cur, qty: cur.qty + it.qty })
    }

    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [lines, ingById, portions, recipe?.portions])

  const costPoints = useMemo(() => {
    if (!id) return []
    return listCostPoints(id)
  }, [id, savingMeta, metaStatus, costOpen])

  // ✅ Pack D+ QR (Google chart)
  const qrUrl = useMemo(() => {
    // opens the current recipe editor link
    const base = window.location.origin + window.location.pathname
    const link = `${base}#/recipes/edit?id=${encodeURIComponent(id || '')}`
    const enc = encodeURIComponent(link)
    return `https://chart.googleapis.com/chart?cht=qr&chs=140x140&chl=${enc}`
  }, [id])

  const printNow = () => {
    setTimeout(() => {
      try {
        window.print()
      } catch {}
    }, 50)
  }

  if (loading) return <div className="gc-card p-6">Loading editor…</div>
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

  const metaBadge = metaStatus === 'saving' ? 'Saving…' : metaStatus === 'dirty' ? 'Unsaved' : 'Saved'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
              {recipe.photo_url ? (
                <img src={recipe.photo_url} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">No Photo</div>
              )}
            </div>

            <div className="min-w-[min(640px,92vw)]">
              <div className="gc-label">RECIPE EDITOR — {isKitchen ? 'KITCHEN MODE' : 'MGMT MODE'}</div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="gc-label">NAME</div>
                  <input className="gc-input mt-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div>
                  <div className="gc-label">CATEGORY</div>
                  <input
                    className="gc-input mt-2 w-full"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Veg / Chicken / Dessert..."
                  />
                </div>

                <div>
                  <div className="gc-label">PORTIONS</div>
                  <input
                    className="gc-input mt-2 w-full"
                    type="number"
                    min={1}
                    step="1"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                  />
                </div>

                <div className="flex items-end gap-2 flex-wrap">
                  <label className="gc-btn gc-btn-ghost cursor-pointer">
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

                  <button className="gc-btn gc-btn-primary" onClick={() => saveMeta()} disabled={savingMeta}>
                    {savingMeta ? 'Saving…' : 'Save'}
                  </button>

                  <span className="text-xs font-semibold text-neutral-500">{metaBadge}</span>

                  {/* ✅ Pack D+ */}
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={printNow}>
                    Print Card (D+)
                  </button>

                  {isMgmt && (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setCostOpen((v) => !v)}>
                      Cost History
                    </button>
                  )}

                  <NavLink className="gc-btn gc-btn-ghost" to={`/cook?id=${recipe.id}`}>
                    🍳 Cook Mode
                  </NavLink>

                  <button className="gc-btn gc-btn-ghost" type="button" onClick={smartBack}>
                    ← Back
                  </button>
                </div>
              </div>

              {/* ✅ Pack D+ Allergens (local, mgmt only) */}
              {isMgmt && (
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="gc-label">ALLERGEN TAGS (LOCAL)</div>
                  <div className="mt-1 text-xs text-neutral-500">Comma separated. Saved locally when you press Save.</div>
                  <input
                    className="gc-input mt-3 w-full"
                    value={allergenInput}
                    onChange={(e) => setAllergenInput(e.target.value)}
                    placeholder="e.g., dairy, gluten, nuts"
                  />
                </div>
              )}
            </div>
          </div>

          {isMgmt && (
            <div className="text-right">
              <div className="gc-label">COST (RECURSIVE)</div>
              <div className="mt-1 text-2xl font-extrabold">{fmtMoney(totalCost, currency)}</div>
              <div className="mt-1 text-xs text-neutral-500">
                Cost/portion: <span className="font-semibold">{fmtMoney(cpp, currency)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cost History */}
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
              {costPoints.slice(0, 12).map((p) => (
                <div key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-extrabold">
                      {fmtMoney(p.totalCost, p.currency)} <span className="text-xs text-neutral-500">({p.portions} portions)</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(p.createdAt).toLocaleString()} · CPP {fmtMoney(p.cpp, p.currency)}
                    </div>
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
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Steps */}
      <div className="gc-card p-6">
        <div className="gc-label">STEP BUILDER (WITH PHOTOS)</div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="gc-input"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Write step… (Ctrl/Cmd+Enter to add)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addStep()
              }
            }}
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="gc-label">STEP {idx + 1}</div>
                    <div className="flex gap-2">
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
                        <div className="text-xs text-neutral-500">Upload one image per step (stored when you press Save).</div>
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

      {/* ✅ Print (D+) */}
      <div className="gc-print-only">
        <div className="gc-print-page">
          <div className="gc-print-header">
            <div className="gc-print-title">
              <div className="gc-print-name">{(name || 'Untitled').trim()}</div>
              <div className="gc-print-sub">
                {(category || '').trim() ? `Category: ${category.trim()} · ` : ''}
                Portions: {Math.max(1, toNum(portions, 1))}
              </div>

              {/* Allergens */}
              {(() => {
                const tags = getAllergens(id || '')
                if (!tags.length) return null
                return (
                  <div className="gc-print-tags">
                    {tags.slice(0, 10).map((t, i) => (
                      <span key={i} className="gc-print-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>

            <div className="gc-print-right">
              <div className="gc-print-photo">
                {recipe.photo_url ? <img src={recipe.photo_url} alt={name} /> : <div className="gc-print-photo-empty">No Photo</div>}
              </div>

              <div className="gc-print-qr">
                <img src={qrUrl} alt="QR" />
                <div className="gc-print-qr-cap">Scan to open</div>
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
                      <div className="gc-print-row-left">
                        <div className="gc-print-row-name">{it.label}</div>
                        {it.note ? <div className="gc-print-row-note">{it.note}</div> : null}
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
              <div className="gc-print-label">Steps (With Photos)</div>
              {steps.length === 0 ? (
                <div className="gc-print-muted">No steps.</div>
              ) : (
                <div className="gc-print-steps">
                  {steps.map((s, idx) => {
                    const p = (stepPhotos[idx] ?? '').trim()
                    return (
                      <div key={idx} className="gc-print-step2">
                        <div className="gc-print-step2-head">
                          <div className="gc-print-step-n">{idx + 1}</div>
                          <div className="gc-print-step-t">{s}</div>
                        </div>
                        {p ? (
                          <div className="gc-print-step2-photo">
                            <img src={p} alt={`Step ${idx + 1}`} />
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
            <div className="gc-print-brand">GastroChef®</div>
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
            ) : (
              <div className="gc-print-muted">Kitchen view — costs hidden</div>
            )}
          </div>
        </div>
      </div>

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
