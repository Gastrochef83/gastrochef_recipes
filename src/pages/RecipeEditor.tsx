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
  if (f === 'pcs' && t === 'pcs') return { ok: true, value: qty }
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

/**
 * ✅ Unit UI Fix (NO logic change):
 * - values stay: g/kg/ml/l/pcs
 * - labels become clearer: "g — grams" etc
 * - select gets stronger font + min width
 */
const UNIT_OPTIONS: Array<{ value: 'g' | 'kg' | 'ml' | 'l' | 'pcs'; label: string }> = [
  { value: 'g', label: 'g — grams' },
  { value: 'kg', label: 'kg — kilograms' },
  { value: 'ml', label: 'ml — milliliters' },
  { value: 'l', label: 'l — liters' },
  { value: 'pcs', label: 'pcs — pieces' },
]

function UnitSelect({
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  value: string
  onChange: (next: 'g' | 'kg' | 'ml' | 'l' | 'pcs') => void
  className?: string
  ariaLabel?: string
}) {
  const v = (safeUnit(value) as any) as 'g' | 'kg' | 'ml' | 'l' | 'pcs'
  return (
    <select
      aria-label={ariaLabel ?? 'Unit'}
      className={`gc-input min-w-[150px] font-semibold text-neutral-900 ${className}`}
      value={v}
      onChange={(e) => onChange(safeUnit(e.target.value) as any)}
    >
      {UNIT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function RecipeEditor() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sp] = useSearchParams()
  const { isManagement } = useMode()

  const id = sp.get('id') || ''

  const [loading, setLoading] = useState(true)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])

  // Photo upload
  const [uploading, setUploading] = useState(false)

  // Meta fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])
  const [stepUploading, setStepUploading] = useState(false)

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
    const out: string[] = []
    for (let i = 0; i < cleanSteps.length; i++) out.push(p[i] ?? '')
    return out
  }

  const currentMetaSnapshot = () => {
    return JSON.stringify({
      name: name.trim(),
      category: category.trim(),
      portions: toNum(portions, 1),
      description: description.trim(),
      isSubRecipe,
      yieldQty: toNum(yieldQty, 0),
      yieldUnit,
      calories: toNum(calories, 0),
      protein: toNum(protein, 0),
      carbs: toNum(carbs, 0),
      fat: toNum(fat, 0),
      currency: (currency || 'USD').toUpperCase(),
      sellingPrice: toNum(sellingPrice, 0),
      targetFC: toNum(targetFC, 30),
      steps: steps,
      stepPhotos: stepPhotos,
    })
  }

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

  const loadAll = async (rid: string) => {
    setLoading(true)
    try {
      // recipe
      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(
          'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
        )
        .eq('id', rid)
        .single()
      if (rErr) throw rErr
      const rr = r as Recipe
      setRecipe(rr)

      // ingredients list
      const { data: i, error: iErr } = await supabase.from('ingredients').select('id,name,pack_unit,net_unit_cost,is_active').order('name', { ascending: true })
      if (iErr) throw iErr
      setIngredients((i ?? []) as Ingredient[])

      // all recipes for subrecipe selector
      const { data: ar, error: arErr } = await supabase
        .from('recipes')
        .select('id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct')
        .eq('is_archived', false)
        .order('name', { ascending: true })
      if (arErr) throw arErr
      setAllRecipes((ar ?? []) as Recipe[])

      // lines
      const { data: l, error: lErr } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
        .eq('recipe_id', rid)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      if (lErr) throw lErr
      const ll = (l ?? []) as Line[]
      setLines(ll)
      setRecipeLinesCache((p) => ({ ...p, [rid]: ll }))

      // hydrate UI fields
      setName(rr.name ?? '')
      setCategory(rr.category ?? '')
      setPortions(String(Math.max(1, toNum(rr.portions, 1))))
      setDescription(rr.description ?? '')

      const st = normalizeSteps(rr.method_steps ?? [])
      setSteps(st)

      const photosAligned = alignStepPhotos(st, rr.method_step_photos)
      setStepPhotos(photosAligned)

      setCalories(rr.calories != null ? String(toNum(rr.calories, 0)) : '')
      setProtein(rr.protein_g != null ? String(toNum(rr.protein_g, 0)) : '')
      setCarbs(rr.carbs_g != null ? String(toNum(rr.carbs_g, 0)) : '')
      setFat(rr.fat_g != null ? String(toNum(rr.fat_g, 0)) : '')

      setCurrency((rr.currency ?? 'USD').toUpperCase())
      setSellingPrice(rr.selling_price != null ? String(toNum(rr.selling_price, 0)) : '')
      setTargetFC(rr.target_food_cost_pct != null ? String(toNum(rr.target_food_cost_pct, 30)) : '30')

      setIsSubRecipe(!!rr.is_subrecipe)
      setYieldQty(rr.yield_qty != null ? String(toNum(rr.yield_qty, 0)) : '')
      setYieldUnit((safeUnit(rr.yield_unit ?? 'g') as any) as 'g' | 'kg' | 'ml' | 'l' | 'pcs')

      // init add selectors defaults
      const firstIng = ((i ?? []) as Ingredient[])[0]
      if (firstIng && !addIngredientId) setAddIngredientId(firstIng.id)

      const firstSub = ((ar ?? []) as Recipe[]).find((x) => x.id !== rid && x.is_subrecipe)
      if (firstSub && !addSubRecipeId) setAddSubRecipeId(firstSub.id)

      // snapshot for autosave
      const snap = currentMetaSnapshot()
      lastSavedSnapshotRef.current = snap
      setMetaStatus('saved')
      setLastSavedAt(Date.now())
    } catch (e: any) {
      showToast(e?.message ?? 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    loadAll(id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // mark dirty when meta changes
  useEffect(() => {
    if (!id) return
    if (loading) return
    const snap = currentMetaSnapshot()
    if (snap !== lastSavedSnapshotRef.current) setMetaStatus('dirty')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, category, portions, description, isSubRecipe, yieldQty, yieldUnit, calories, protein, carbs, fat, currency, sellingPrice, targetFC, steps, stepPhotos])

  const [savingMeta, setSavingMeta] = useState(false)

  const saveMeta = async (opts?: { silent?: boolean; skipReload?: boolean; isAuto?: boolean }) => {
    if (!recipe) return
    setSavingMeta(true)
    setMetaStatus('saving')
    try {
      const payload = {
        name: name.trim() || 'Untitled recipe',
        category: category.trim() || null,
        portions: Math.max(1, toNum(portions, 1)),
        description: description.trim() || null,

        method_steps: normalizeSteps(steps),
        method_step_photos: stepPhotos,

        calories: calories.trim() ? toNum(calories, 0) : null,
        protein_g: protein.trim() ? toNum(protein, 0) : null,
        carbs_g: carbs.trim() ? toNum(carbs, 0) : null,
        fat_g: fat.trim() ? toNum(fat, 0) : null,

        currency: (currency || 'USD').toUpperCase(),
        selling_price: sellingPrice.trim() ? toNum(sellingPrice, 0) : null,
        target_food_cost_pct: targetFC.trim() ? toNum(targetFC, 30) : null,

        is_subrecipe: !!isSubRecipe,
        yield_qty: yieldQty.trim() ? toNum(yieldQty, 0) : null,
        yield_unit: isSubRecipe ? safeUnit(yieldUnit) : null,
      }

      const { error } = await supabase.from('recipes').update(payload).eq('id', recipe.id)
      if (error) throw error

      lastSavedSnapshotRef.current = currentMetaSnapshot()
      setMetaStatus('saved')
      setLastSavedAt(Date.now())

      if (!opts?.silent) showToast('Saved ✅')
      if (!opts?.skipReload) await loadAll(recipe.id)
    } catch (e: any) {
      setMetaStatus('dirty')
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSavingMeta(false)
    }
  }

  // ✅ Autosave debounce
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
  }, [id, loading, savingMeta, uploading, stepUploading, metaStatus, currentMetaSnapshot()])

  // -------------------------
  // Keyboard shortcuts
  // -------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveMeta().catch(() => {})
        return
      }

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
  // Lines helpers
  // -------------------------
  const ensureRecipeLinesLoaded = async (rid: string) => {
    if (recipeLinesCache[rid]) return
    const { data, error } = await supabase
      .from('recipe_lines')
      .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
      .eq('recipe_id', rid)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (error) throw error
    setRecipeLinesCache((p) => ({ ...p, [rid]: (data ?? []) as Line[] }))
  }

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

        if (u === 'g' || u === 'kg') addWeight(q, u)
        else if (u === 'ml' || u === 'l') addVolume(q, u)
        else if (u === 'pcs') addPcs(q, u)
      }

      if (weightG > 0) {
        setYieldUnit('g')
        setYieldQty(String(Math.round(weightG)))
        showToast('Yield smart: set to grams ✅')
        return
      }
      if (volumeML > 0) {
        setYieldUnit('ml')
        setYieldQty(String(Math.round(volumeML)))
        showToast('Yield smart: set to ml ✅')
        return
      }
      if (pieces > 0) {
        setYieldUnit('pcs')
        setYieldQty(String(Math.round(pieces)))
        showToast('Yield smart: set to pcs ✅')
        return
      }

      showToast('Yield smart: could not infer yield (add lines first)')
    } catch (e: any) {
      showToast(e?.message ?? 'Yield smart failed')
    } finally {
      setYieldSmartLoading(false)
    }
  }

  // -------------------------
  // Add Step
  // -------------------------
  const addStep = () => {
    const s = (newStep ?? '').trim()
    if (!s) return
    const next = [...steps, s]
    setSteps(next)
    setStepPhotos((p) => [...p, ''])
    setNewStep('')
    setMetaStatus('dirty')
    setTimeout(() => newStepInputRef.current?.focus(), 50)
  }

  const removeStep = (idx: number) => {
    const nextSteps = steps.filter((_, i) => i !== idx)
    const nextPhotos = stepPhotos.filter((_, i) => i !== idx)
    setSteps(nextSteps)
    setStepPhotos(nextPhotos)
    setMetaStatus('dirty')
  }

  // -------------------------
  // Photo Upload (recipe)
  // -------------------------
  const uploadRecipePhoto = async (file: File) => {
    if (!recipe) return
    setUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `${recipe.id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('recipe-photos').upload(key, file, { upsert: true })
      if (upErr) throw upErr

      const { data } = supabase.storage.from('recipe-photos').getPublicUrl(key)
      const url = data.publicUrl

      const { error } = await supabase.from('recipes').update({ photo_url: url }).eq('id', recipe.id)
      if (error) throw error

      showToast('Photo uploaded ✅')
      await loadAll(recipe.id)
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // -------------------------
  // Step Photo Upload
  // -------------------------
  const uploadStepPhoto = async (idx: number, file: File) => {
    if (!recipe) return
    setStepUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `${recipe.id}/steps/${idx}_${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('recipe-photos').upload(key, file, { upsert: true })
      if (upErr) throw upErr

      const { data } = supabase.storage.from('recipe-photos').getPublicUrl(key)
      const url = data.publicUrl

      setStepPhotos((p) => {
        const copy = [...p]
        copy[idx] = url
        return copy
      })

      setMetaStatus('dirty')
      showToast('Step photo uploaded ✅')
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed')
    } finally {
      setStepUploading(false)
    }
  }

  const removeStepPhoto = (idx: number) => {
    setStepPhotos((p) => {
      const copy = [...p]
      copy[idx] = ''
      return copy
    })
    setMetaStatus('dirty')
  }

  // -------------------------
  // Inline Add Line / Group
  // -------------------------
  const filteredIngredients = useMemo(() => {
    const s = ingSearch.trim().toLowerCase()
    const list = ingredients.filter((i) => (i.is_active ?? true) !== false)
    if (!s) return list
    return list.filter((i) => (i.name ?? '').toLowerCase().includes(s))
  }, [ingredients, ingSearch])

  const availableSubRecipes = useMemo(() => {
    return allRecipes.filter((r) => r.is_subrecipe && !r.is_archived && r.id !== recipe?.id)
  }, [allRecipes, recipe?.id])

  const addLine = async () => {
    if (!recipe) return
    if (savingAdd) return
    setSavingAdd(true)
    try {
      const qty = Math.max(0, toNum(addQty, 0))
      if (qty <= 0) {
        showToast('Qty must be > 0')
        return
      }

      const payload: Partial<Line> = {
        recipe_id: recipe.id,
        qty,
        unit: safeUnit(addUnit),
        note: addNote.trim() || null,
        sort_order: (lines.at(-1)?.sort_order ?? 0) + 1,
        line_type: addType,
        group_title: null,
        ingredient_id: addType === 'ingredient' ? (addIngredientId || null) : null,
        sub_recipe_id: addType === 'subrecipe' ? (addSubRecipeId || null) : null,
      }

      if (addType === 'ingredient' && !payload.ingredient_id) {
        showToast('Pick an ingredient')
        return
      }
      if (addType === 'subrecipe' && !payload.sub_recipe_id) {
        showToast('Pick a sub-recipe')
        return
      }

      const { error } = await supabase.from('recipe_lines').insert(payload)
      if (error) throw error

      showToast('Added ✅')
      await loadAll(recipe.id)

      setAddQty('1')
      setAddUnit('g')
      setAddNote('')
    } catch (e: any) {
      showToast(e?.message ?? 'Add failed')
    } finally {
      setSavingAdd(false)
    }
  }

  const addGroup = async () => {
    if (!recipe) return
    if (savingGroup) return
    setSavingGroup(true)
    try {
      const title = groupTitle.trim()
      if (!title) {
        showToast('Group title required')
        return
      }

      const payload: Partial<Line> = {
        recipe_id: recipe.id,
        qty: 0,
        unit: 'g',
        note: null,
        sort_order: (lines.at(-1)?.sort_order ?? 0) + 1,
        line_type: 'group',
        group_title: title,
        ingredient_id: null,
        sub_recipe_id: null,
      }

      const { error } = await supabase.from('recipe_lines').insert(payload)
      if (error) throw error

      showToast('Group added ✅')
      await loadAll(recipe.id)
      setGroupTitle('')
    } catch (e: any) {
      showToast(e?.message ?? 'Add group failed')
    } finally {
      setSavingGroup(false)
    }
  }

  // -------------------------
  // Row edit / save / delete
  // -------------------------
  const startEdit = (l: Line) => {
    setEdit((p) => ({
      ...p,
      [l.id]: {
        line_type: l.line_type,
        ingredient_id: l.ingredient_id ?? '',
        sub_recipe_id: l.sub_recipe_id ?? '',
        qty: String(l.qty ?? 0),
        unit: safeUnit(l.unit ?? 'g'),
        note: l.note ?? '',
        group_title: l.group_title ?? '',
      },
    }))
  }

  const cancelEdit = (id: string) => {
    setEdit((p) => {
      const copy = { ...p }
      delete copy[id]
      return copy
    })
  }

  const saveRow = async (idRow: string) => {
    if (!recipe) return
    const e = edit[idRow]
    if (!e) return

    setRowSaving((p) => ({ ...p, [idRow]: true }))
    try {
      const patch: any = {}
      patch.line_type = e.line_type

      if (e.line_type === 'group') {
        patch.group_title = e.group_title.trim() || 'Group'
        patch.qty = 0
        patch.unit = 'g'
        patch.note = null
        patch.ingredient_id = null
        patch.sub_recipe_id = null
      } else {
        patch.group_title = null
        patch.qty = Math.max(0, toNum(e.qty, 0))
        patch.unit = safeUnit(e.unit)
        patch.note = e.note.trim() || null
        patch.ingredient_id = e.line_type === 'ingredient' ? (e.ingredient_id || null) : null
        patch.sub_recipe_id = e.line_type === 'subrecipe' ? (e.sub_recipe_id || null) : null
      }

      const { error } = await supabase.from('recipe_lines').update(patch).eq('id', idRow)
      if (error) throw error

      showToast('Row saved ✅')
      await loadAll(recipe.id)
      cancelEdit(idRow)
    } catch (err: any) {
      showToast(err?.message ?? 'Save row failed')
    } finally {
      setRowSaving((p) => ({ ...p, [idRow]: false }))
    }
  }

  const deleteRow = async (idRow: string) => {
    if (!recipe) return
    try {
      const { error } = await supabase.from('recipe_lines').delete().eq('id', idRow)
      if (error) throw error
      showToast('Deleted ✅')
      await loadAll(recipe.id)
    } catch (e: any) {
      showToast(e?.message ?? 'Delete failed')
    }
  }

  // -------------------------
  // Reorder (simple)
  // -------------------------
  const moveRow = async (idRow: string, dir: -1 | 1) => {
    if (reorderSaving) return
    const idx = lines.findIndex((x) => x.id === idRow)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= lines.length) return

    const copy = [...lines]
    ;[copy[idx], copy[j]] = [copy[j], copy[idx]]

    setReorderSaving(true)
    try {
      // keep old sort_order semantics: 1..n
      const updates = copy.map((x, i) => ({ id: x.id, sort_order: i + 1 }))
      for (const u of updates) {
        const { error } = await supabase.from('recipe_lines').update({ sort_order: u.sort_order }).eq('id', u.id)
        if (error) throw error
      }
      showToast('Reordered ✅')
      if (recipe) await loadAll(recipe.id)
    } catch (e: any) {
      showToast(e?.message ?? 'Reorder failed')
    } finally {
      setReorderSaving(false)
    }
  }

  // -------------------------
  // Costing (preview)
  // -------------------------
  const costTotals = useMemo(() => {
    if (!recipe) return { total: 0, perPortion: 0 }
    let sum = 0
    for (const l of lines) {
      if (l.line_type === 'group') continue

      if (l.line_type === 'ingredient') {
        if (!l.ingredient_id) continue
        const ing = ingById.get(l.ingredient_id)
        const net = toNum(ing?.net_unit_cost, 0)
        if (net <= 0) continue
        const packUnit = safeUnit(ing?.pack_unit ?? 'g')
        const conv = convertQtyToPackUnit(toNum(l.qty, 0), l.unit, packUnit)
        sum += conv * net
        continue
      }

      if (l.line_type === 'subrecipe') {
        if (!l.sub_recipe_id) continue
        const child = recipeById.get(l.sub_recipe_id)
        if (!child) continue
        // lightweight: costHistory optional / not recalculating full recursion here
        // (keeps your existing behavior simple)
      }
    }

    const portionsN = Math.max(1, toNum(portions, 1))
    return { total: sum, perPortion: sum / portionsN }
  }, [lines, ingById, recipeById, recipe, portions])

  // -------------------------
  // Print
  // -------------------------
  const printRecipe = () => {
    window.print()
  }

  // -------------------------
  // Cost History UI (optional)
  // -------------------------
  const [costPoints, setCostPoints] = useState<any[]>([])
  const loadCostPoints = async () => {
    if (!recipe) return
    try {
      const pts = await listCostPoints(recipe.id)
      setCostPoints(pts ?? [])
    } catch {
      // ignore
    }
  }

  const addCostSnapshot = async () => {
    if (!recipe) return
    await addCostPoint({
      recipe_id: recipe.id,
      name: name.trim() || recipe.name || 'Recipe',
      total_cost: costTotals.total,
      cost_per_portion: costTotals.perPortion,
      currency: (currency || 'USD').toUpperCase(),
    })
    showToast('Cost snapshot added ✅')
    await loadCostPoints()
  }

  const clearHistory = async () => {
    if (!recipe) return
    await clearCostPoints(recipe.id)
    showToast('History cleared ✅')
    await loadCostPoints()
  }

  const deletePoint = async (pid: string) => {
    if (!recipe) return
    await deleteCostPoint(pid)
    showToast('Deleted ✅')
    await loadCostPoints()
  }

  useEffect(() => {
    if (!recipe) return
    if (!costOpen) return
    loadCostPoints().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costOpen, recipe?.id])

  // -------------------------
  // Navigation guard (soft)
  // -------------------------
  const goBackSmart = () => {
    if (metaStatus === 'dirty') {
      const ok = window.confirm('You have unsaved changes. Leave anyway?')
      if (!ok) return
    }
    navigate('/recipes')
  }

  if (!id) {
    return (
      <div className="gc-card p-6">
        <div className="text-sm text-neutral-700">Missing recipe id.</div>
        <div className="mt-4">
          <NavLink className="gc-btn gc-btn-primary" to="/recipes">
            Back to Recipes
          </NavLink>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Small CSS hint to improve select clarity without touching global styles */}
      <style>{`
        select.gc-input { cursor: pointer; }
        select.gc-input option { font-weight: 600; }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="gc-label">RECIPE EDITOR — PREMIUM</div>
          <div className="mt-2 text-2xl font-extrabold">{loading ? 'Loading…' : name || recipe?.name || 'Recipe'}</div>
          <div className="mt-1 text-xs text-neutral-500">
            Status:{' '}
            <span className={metaStatus === 'dirty' ? 'font-bold text-amber-700' : metaStatus === 'saving' ? 'font-bold text-blue-700' : 'font-bold text-emerald-700'}>
              {metaStatus}
            </span>
            {lastSavedAt ? <span className="ml-2 text-neutral-400">• Last saved: {new Date(lastSavedAt).toLocaleTimeString()}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="gc-btn gc-btn-ghost" type="button" onClick={goBackSmart}>
            ← Back
          </button>
          <button className="gc-btn gc-btn-ghost" type="button" onClick={printRecipe}>
            Print
          </button>
          {isManagement ? (
            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setCostOpen((p) => !p)}>
              Cost History
            </button>
          ) : null}
          <button className="gc-btn gc-btn-primary" type="button" onClick={() => saveMeta()} disabled={savingMeta || loading}>
            {savingMeta ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="gc-card p-6">Loading…</div>
      ) : (
        <>
          {/* Meta */}
          <div className="gc-card p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="gc-label">NAME</div>
                <input className="gc-input w-full text-lg font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" />
              </div>
              <div>
                <div className="gc-label">CATEGORY</div>
                <input className="gc-input w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Main, Salad..." />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="gc-label">PORTIONS</div>
                <input className="gc-input w-full" type="number" min={1} value={portions} onChange={(e) => setPortions(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">MENU DESCRIPTION</div>
                <textarea className="gc-input w-full min-h-[84px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short premium menu description…" />
              </div>
            </div>

            {/* Photo */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="gc-label">RECIPE PHOTO</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="gc-btn gc-btn-ghost cursor-pointer">
                    {uploading ? 'Uploading…' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadRecipePhoto(f)
                      }}
                    />
                  </label>
                  {recipe?.photo_url ? (
                    <a className="gc-btn gc-btn-ghost" href={recipe.photo_url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-500">No photo yet</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-1">
                <div className="gc-label">SUB-RECIPE</div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isSubRecipe} onChange={(e) => setIsSubRecipe(e.target.checked)} />
                  This recipe is a sub-recipe
                </label>

                {isSubRecipe ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <div className="gc-label">YIELD QTY</div>
                      <input className="gc-input w-full" type="number" min={0} step="0.01" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="e.g. 1200" />
                    </div>
                    <div>
                      <div className="gc-label">YIELD UNIT</div>
                      <UnitSelect value={yieldUnit} onChange={setYieldUnit} ariaLabel="Yield unit" />
                    </div>
                    <div className="col-span-2">
                      <button className="gc-btn gc-btn-ghost w-full" type="button" onClick={yieldSmart} disabled={yieldSmartLoading}>
                        {yieldSmartLoading ? 'Working…' : 'Yield Smart'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Cost preview */}
          {isManagement ? (
            <div className="gc-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="gc-label">COST PREVIEW</div>
                  <div className="mt-1 text-sm text-neutral-600">Ingredient-only preview (same logic). Sub-recipe costing stays as your system rules.</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-neutral-600">Total</div>
                  <div className="text-xl font-extrabold">{fmtMoney(costTotals.total, currency)}</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    / portion: <span className="font-bold">{fmtMoney(costTotals.perPortion, currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Lines Builder */}
          <div className="gc-card p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="gc-label">RECIPE LINES</div>
                <div className="mt-1 text-sm text-neutral-600">Add ingredients, sub-recipes, and groups.</div>
              </div>
            </div>

            {/* Inline add */}
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-1">
                <div className="gc-label">TYPE</div>
                <select className="gc-input w-full font-semibold text-neutral-900" value={addType} onChange={(e) => setAddType(e.target.value as LineType)}>
                  <option value="ingredient">Ingredient</option>
                  <option value="subrecipe">Sub-recipe</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">{addType === 'ingredient' ? 'INGREDIENT' : 'SUB-RECIPE'}</div>

                {addType === 'ingredient' ? (
                  <div className="space-y-2">
                    <input className="gc-input w-full" placeholder="Search ingredient…" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} />
                    <select className="gc-input w-full font-semibold text-neutral-900" value={addIngredientId} onChange={(e) => setAddIngredientId(e.target.value)}>
                      <option value="">Select…</option>
                      {filteredIngredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name ?? i.id}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <select className="gc-input w-full font-semibold text-neutral-900" value={addSubRecipeId} onChange={(e) => setAddSubRecipeId(e.target.value)}>
                    <option value="">Select…</option>
                    {availableSubRecipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || 'Untitled'} {r.yield_qty ? `— yield ${toNum(r.yield_qty, 0)} ${safeUnit(r.yield_unit ?? '')}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="md:col-span-1">
                <div className="gc-label">QTY</div>
                <input className="gc-input w-full" type="number" min={0} step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
              </div>

              <div className="md:col-span-1">
                <div className="gc-label">UNIT</div>
                <UnitSelect value={addUnit} onChange={setAddUnit} ariaLabel="Line unit" />
              </div>

              <div className="md:col-span-1">
                <div className="gc-label">ADD</div>
                <button className="gc-btn gc-btn-primary w-full" type="button" onClick={addLine} disabled={savingAdd}>
                  {savingAdd ? 'Adding…' : 'Add'}
                </button>
              </div>

              <div className="md:col-span-6">
                <div className="gc-label">NOTE</div>
                <input className="gc-input w-full" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="e.g. chopped, peeled…" />
              </div>
            </div>

            {/* Add group */}
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-5">
                <div className="gc-label">GROUP TITLE</div>
                <input className="gc-input w-full" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g. Sauce, Garnish…" />
              </div>
              <div className="md:col-span-1">
                <div className="gc-label">ADD</div>
                <button className="gc-btn gc-btn-ghost w-full" type="button" onClick={addGroup} disabled={savingGroup}>
                  {savingGroup ? 'Adding…' : '+ Group'}
                </button>
              </div>
            </div>

            {/* Lines list */}
            <div className="overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="text-left text-xs font-semibold text-neutral-500">
                  <tr>
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-0 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="align-top">
                  {lines.map((l, idx) => {
                    const isEditing = !!edit[l.id]
                    const e = edit[l.id]
                    const itemName =
                      l.line_type === 'group'
                        ? l.group_title || 'Group'
                        : l.line_type === 'ingredient'
                          ? ingById.get(l.ingredient_id ?? '')?.name || 'Ingredient'
                          : recipeById.get(l.sub_recipe_id ?? '')?.name || 'Sub-recipe'

                    return (
                      <tr key={l.id} className="border-t">
                        <td className="py-3 pr-4 font-semibold">{idx + 1}</td>

                        <td className="py-3 pr-4">
                          {!isEditing ? (
                            <span className="font-semibold">{l.line_type}</span>
                          ) : (
                            <select
                              className="gc-input w-[150px] font-semibold text-neutral-900"
                              value={e!.line_type}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], line_type: ev.target.value as LineType } }))}
                            >
                              <option value="ingredient">ingredient</option>
                              <option value="subrecipe">subrecipe</option>
                              <option value="group">group</option>
                            </select>
                          )}
                        </td>

                        <td className="py-3 pr-4">
                          {!isEditing ? (
                            <span className={l.line_type === 'group' ? 'font-bold' : ''}>{itemName}</span>
                          ) : e!.line_type === 'group' ? (
                            <input
                              className="gc-input w-[420px]"
                              value={e!.group_title}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], group_title: ev.target.value } }))}
                              placeholder="Group title"
                            />
                          ) : e!.line_type === 'ingredient' ? (
                            <select
                              className="gc-input w-[420px] font-semibold text-neutral-900"
                              value={e!.ingredient_id}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], ingredient_id: ev.target.value } }))}
                            >
                              <option value="">Select…</option>
                              {ingredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name ?? i.id}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              className="gc-input w-[420px] font-semibold text-neutral-900"
                              value={e!.sub_recipe_id}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], sub_recipe_id: ev.target.value } }))}
                            >
                              <option value="">Select…</option>
                              {availableSubRecipes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name || 'Untitled'}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        <td className="py-3 pr-4">
                          {!isEditing ? (
                            <span>{l.line_type === 'group' ? '—' : l.qty}</span>
                          ) : e!.line_type === 'group' ? (
                            <span className="text-neutral-500">—</span>
                          ) : (
                            <input
                              className="gc-input w-[120px]"
                              type="number"
                              min={0}
                              step="0.01"
                              value={e!.qty}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], qty: ev.target.value } }))}
                            />
                          )}
                        </td>

                        <td className="py-3 pr-4">
                          {!isEditing ? (
                            <span className="font-semibold">{l.line_type === 'group' ? '—' : safeUnit(l.unit)}</span>
                          ) : e!.line_type === 'group' ? (
                            <span className="text-neutral-500">—</span>
                          ) : (
                            <UnitSelect
                              value={e!.unit}
                              onChange={(u) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], unit: u } }))}
                              className="min-w-[170px]"
                              ariaLabel="Edit unit"
                            />
                          )}
                        </td>

                        <td className="py-3 pr-4">
                          {!isEditing ? (
                            <span className="text-neutral-700">{l.note ?? ''}</span>
                          ) : e!.line_type === 'group' ? (
                            <span className="text-neutral-500">—</span>
                          ) : (
                            <input
                              className="gc-input w-[320px]"
                              value={e!.note}
                              onChange={(ev) => setEdit((p) => ({ ...p, [l.id]: { ...p[l.id], note: ev.target.value } }))}
                              placeholder="e.g. chopped…"
                            />
                          )}
                        </td>

                        <td className="py-3 pr-0 text-right">
                          {!isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveRow(l.id, -1)} disabled={reorderSaving}>
                                ↑
                              </button>
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveRow(l.id, 1)} disabled={reorderSaving}>
                                ↓
                              </button>
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => startEdit(l)}>
                                Edit
                              </button>
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deleteRow(l.id)}>
                                Delete
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => cancelEdit(l.id)}>
                                Cancel
                              </button>
                              <button className="gc-btn gc-btn-primary" type="button" onClick={() => saveRow(l.id)} disabled={!!rowSaving[l.id]}>
                                {rowSaving[l.id] ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Steps */}
          <div className="gc-card p-6 space-y-4">
            <div>
              <div className="gc-label">METHOD — STEP BUILDER</div>
              <div className="mt-1 text-sm text-neutral-600">Write steps, attach step photos, and auto-save.</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={newStepInputRef}
                className="gc-input flex-1 min-w-[280px]"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Write a step… (Ctrl+Enter to add)"
              />
              <button className="gc-btn gc-btn-primary" type="button" onClick={addStep}>
                + Add Step
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-sm text-neutral-600">No steps yet.</div>
            ) : (
              <div className="space-y-3">
                {steps.map((s, idx) => (
                  <div key={`${idx}-${s}`} className="gc-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-neutral-500">STEP {idx + 1}</div>
                        <div className="mt-1 font-semibold">{s}</div>
                      </div>

                      <div className="flex gap-2">
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => removeStep(idx)}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="gc-btn gc-btn-ghost cursor-pointer">
                        {stepUploading ? 'Uploading…' : 'Upload Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadStepPhoto(idx, f)
                          }}
                        />
                      </label>

                      {stepPhotos[idx] ? (
                        <>
                          <a className="gc-btn gc-btn-ghost" href={stepPhotos[idx]} target="_blank" rel="noreferrer">
                            View
                          </a>
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => removeStepPhoto(idx)}>
                            Remove Photo
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-neutral-500">No photo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nutrition & Pricing */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="gc-card p-6 space-y-3">
              <div className="gc-label">NUTRITION (PER PORTION)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="gc-label">CALORIES</div>
                  <input className="gc-input w-full" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="kcal" />
                </div>
                <div>
                  <div className="gc-label">PROTEIN (g)</div>
                  <input className="gc-input w-full" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="g" />
                </div>
                <div>
                  <div className="gc-label">CARBS (g)</div>
                  <input className="gc-input w-full" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="g" />
                </div>
                <div>
                  <div className="gc-label">FAT (g)</div>
                  <input className="gc-input w-full" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="g" />
                </div>
              </div>
            </div>

            <div className="gc-card p-6 space-y-3">
              <div className="gc-label">PRICING (PER PORTION)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="gc-label">CURRENCY</div>
                  <input className="gc-input w-full font-semibold" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
                </div>
                <div>
                  <div className="gc-label">SELLING PRICE</div>
                  <input className="gc-input w-full" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="e.g. 9.99" />
                </div>
                <div className="sm:col-span-2">
                  <div className="gc-label">TARGET FOOD COST %</div>
                  <input className="gc-input w-full" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} placeholder="30" />
                </div>
              </div>
            </div>
          </div>

          {/* Cost History (Management) */}
          {isManagement && costOpen ? (
            <div className="gc-card p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="gc-label">COST HISTORY</div>
                  <div className="text-sm text-neutral-600">Snapshots of total + per-portion cost.</div>
                </div>
                <div className="flex gap-2">
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={addCostSnapshot}>
                    + Snapshot
                  </button>
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={clearHistory}>
                    Clear
                  </button>
                </div>
              </div>

              {costPoints.length === 0 ? (
                <div className="text-sm text-neutral-600">No history yet.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs font-semibold text-neutral-500">
                      <tr>
                        <th className="py-2 pr-4">When</th>
                        <th className="py-2 pr-4">Total</th>
                        <th className="py-2 pr-4">/ Portion</th>
                        <th className="py-2 pr-0 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costPoints.map((p: any) => (
                        <tr key={p.id} className="border-t">
                          <td className="py-3 pr-4">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                          <td className="py-3 pr-4 font-semibold">{fmtMoney(toNum(p.total_cost, 0), p.currency || currency)}</td>
                          <td className="py-3 pr-4 font-semibold">{fmtMoney(toNum(p.cost_per_portion, 0), p.currency || currency)}</td>
                          <td className="py-3 pr-0 text-right">
                            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deletePoint(p.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
