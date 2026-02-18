import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { addCostPoint, listCostPoints, deleteCostPoint } from '../lib/costHistory'

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
  kitchen_id: string | null
  line_type: LineType
  ingredient_id: string | null
  sub_recipe_id: string | null
  group_title: string | null
  qty: number
  unit: string
  note: string | null
  yield_percent: number | null
  position: number
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
}

type EditRow = {
  qty: string
  unit: string
  yield_percent: string
  note: string
}

type MetaStatus = 'saved' | 'dirty' | 'saving'

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function money(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
  }
}

function clampStr(s: string, n = 120) {
  const x = (s ?? '').trim()
  if (x.length <= n) return x
  return x.slice(0, n - 1).trim() + '…'
}

function normalizeSteps(steps: string[] | null | undefined) {
  const arr = (steps ?? []).map((x) => (x ?? '').trim()).filter(Boolean)
  // keep at least one for UX
  return arr.length ? arr : []
}

export default function RecipeEditor() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()

  // ✅ Mode (Kitchen vs Mgmt)
  const { mode } = useMode()
  const isKitchen = mode === 'kitchen'
  const isMgmt = mode === 'mgmt'

  // Parse id robustly (HashRouter + search params)
  const id = useMemo(() => {
    const qp = sp.get('id') || sp.get('rid') || sp.get('recipe') || ''
    if (qp) return qp
    // fallback: /recipes/:id
    const parts = location.pathname.split('/').filter(Boolean)
    const maybe = parts[parts.length - 1]
    if (maybe && maybe.length >= 6 && maybe !== 'editor') return maybe
    return ''
  }, [location.pathname, sp])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [subRecipes, setSubRecipes] = useState<Recipe[]>([])

  // Meta fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // legacy + steps
  const [methodLegacy, setMethodLegacy] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])

  // Nutrition (manual)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // Pricing (per portion)
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

  // Recursive cache for subrecipes
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})

  // Smart back + autosave tracking
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
      portions: String(Math.max(1, toNum(portions, 1))),
      description: description.trim(),
      methodLegacy: methodLegacy.trim(),
      steps: normalizeSteps(steps),
      stepPhotos: (stepPhotos ?? []).map((x) => (x ?? '').trim()),
      calories: calories.trim(),
      protein: protein.trim(),
      carbs: carbs.trim(),
      fat: fat.trim(),
      currency: (currency || 'USD').toUpperCase(),
      sellingPrice: sellingPrice.trim(),
      targetFC: targetFC.trim(),
      isSubRecipe,
      yieldQty: yieldQty.trim(),
      yieldUnit: safeUnit(yieldUnit),
    })
  }

  const loadAll = async (rid: string) => {
    setLoading(true)
    setErr('')
    try {
      const rRes = await supabase.from('recipes').select('*').eq('id', rid).maybeSingle()
      if (rRes.error) throw rRes.error
      const r = rRes.data as Recipe | null
      if (!r) {
        setRecipe(null)
        setLines([])
        setLoading(false)
        return
      }

      setRecipe(r)

      setName(r.name ?? '')
      setCategory(r.category ?? '')
      setPortions(String(Math.max(1, toNum(r.portions, 1))))
      setDescription(r.description ?? '')

      setMethodLegacy(r.method ?? '')
      setSteps((r.method_steps ?? []).map((x) => (x ?? '').trim()).filter(Boolean))
      setStepPhotos((r.method_step_photos ?? []).map((x) => (x ?? '').trim()))

      setCalories(r.calories == null ? '' : String(Math.max(0, Math.floor(toNum(r.calories, 0)))))
      setProtein(r.protein_g == null ? '' : String(Math.max(0, toNum(r.protein_g, 0))))
      setCarbs(r.carbs_g == null ? '' : String(Math.max(0, toNum(r.carbs_g, 0))))
      setFat(r.fat_g == null ? '' : String(Math.max(0, toNum(r.fat_g, 0))))

      setCurrency((r.currency ?? 'USD').toUpperCase())
      setSellingPrice(r.selling_price == null ? '' : String(Math.max(0, toNum(r.selling_price, 0))))
      setTargetFC(r.target_food_cost_pct == null ? '30' : String(Math.min(99, Math.max(1, toNum(r.target_food_cost_pct, 30)))))

      setIsSubRecipe(!!r.is_subrecipe)
      setYieldQty(r.yield_qty == null ? '' : String(Math.max(0, toNum(r.yield_qty, 0))))
      const yu = safeUnit(r.yield_unit || 'g') as any
      setYieldUnit(['g', 'kg', 'ml', 'l', 'pcs'].includes(yu) ? yu : 'g')

      const lRes = await supabase
        .from('recipe_lines')
        .select('*')
        .eq('recipe_id', rid)
        .order('position', { ascending: true })
      if (lRes.error) throw lRes.error
      setLines((lRes.data ?? []) as Line[])

      const iRes = await supabase.from('ingredients').select('id,name,pack_unit,net_unit_cost').order('name', { ascending: true })
      if (iRes.error) throw iRes.error
      setIngredients((iRes.data ?? []) as Ingredient[])

      const srRes = await supabase.from('recipes').select('id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct').eq('is_archived', false)
      if (srRes.error) throw srRes.error
      setSubRecipes((srRes.data ?? []) as Recipe[])

      lastSavedSnapshotRef.current = currentMetaSnapshot()
      setMetaStatus('saved')
      setLastSavedAt(Date.now())
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) {
      setErr('Missing recipe id.')
      setLoading(false)
      return
    }
    loadAll(id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Mark dirty on meta change
  useEffect(() => {
    if (loading) return
    const snap = currentMetaSnapshot()
    if (!lastSavedSnapshotRef.current) lastSavedSnapshotRef.current = snap
    if (snap !== lastSavedSnapshotRef.current) setMetaStatus('dirty')
  }, [
    loading,
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

  const totalCost = useMemo(() => {
    const ingById = new Map<string, Ingredient>()
    for (const i of ingredients) ingById.set(i.id, i)
    let sum = 0
    for (const l of lines) {
      if (l.line_type !== 'ingredient') continue
      if (!l.ingredient_id) continue
      const ing = ingById.get(l.ingredient_id)
      const nuc = toNum(ing?.net_unit_cost, 0)
      const qty = Math.max(0, toNum(l.qty, 0))
      sum += qty * nuc
    }
    return sum
  }, [lines, ingredients])

  const cpp = useMemo(() => {
    const p = Math.max(1, toNum(portions, 1))
    return totalCost / p
  }, [totalCost, portions])

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

  const [savingMeta, setSavingMeta] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)

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

  // Autosave debounce
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

  // Keyboard shortcuts
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

  const ensureRecipeLinesLoaded = async (rid: string) => {
    if (recipeLinesCache[rid]) return
    const res = await supabase.from('recipe_lines').select('*').eq('recipe_id', rid).order('position', { ascending: true })
    if (!res.error) {
      setRecipeLinesCache((prev) => ({ ...prev, [rid]: (res.data ?? []) as Line[] }))
    }
  }

  // Yield Smart
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

      if (pieces > 0) {
        setYieldQty(String(Math.round(pieces * 100) / 100))
        setYieldUnit('pcs')
        showToast('Yield smart: pcs ✅ (remember Save)')
      } else if (volumeML > 0) {
        setYieldQty(String(Math.round(volumeML * 100) / 100))
        setYieldUnit('ml')
        showToast('Yield smart: ml ✅ (remember Save)')
      } else if (weightG > 0) {
        setYieldQty(String(Math.round(weightG * 100) / 100))
        setYieldUnit('g')
        showToast('Yield smart: g ✅ (remember Save)')
      } else {
        showToast('Yield smart: no measurable qty found')
      }
    } finally {
      setYieldSmartLoading(false)
    }
  }

  const addStep = () => {
    const s = newStep.trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
    setTimeout(() => newStepInputRef.current?.focus(), 10)
  }

  const deleteStepAt = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx))
    setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const arr = [...prev]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return arr
    })
    setStepPhotos((prev) => {
      const arr = [...prev]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return arr
    })
  }

  const uploadStepPhoto = async (idx: number, file: File) => {
    if (!recipe) return
    setStepUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `recipes/${recipe.id}/steps/${Date.now()}_${idx}.${ext}`

      const up = await supabase.storage.from('recipe-photos').upload(path, file, { upsert: true })
      if (up.error) throw up.error

      const pub = supabase.storage.from('recipe-photos').getPublicUrl(path)
      const url = pub.data.publicUrl

      setStepPhotos((prev) => {
        const arr = [...prev]
        arr[idx] = url
        return arr
      })
      showToast('Step photo uploaded ✅ (remember Save)')
    } catch (e: any) {
      showToast(e?.message ?? 'Upload failed')
    } finally {
      setStepUploading(false)
    }
  }

  // Ingredients + cost mapping
  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  // Pack D: Consolidated shopping list
  const consolidated = useMemo(() => {
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

  // Pack D: Cost history memo
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

  // Guards
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

  const metaBadge =
    metaStatus === 'saving'
      ? 'Saving…'
      : metaStatus === 'dirty'
        ? 'Unsaved'
        : lastSavedAt
          ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'Saved'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="gc-label">RECIPE EDITOR</div>
            <div className="mt-1 text-2xl font-extrabold">{name?.trim() ? name : 'Untitled recipe'}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Mode: <b>{isKitchen ? 'Kitchen' : 'Management'}</b> • <span className="gc-chip">{metaBadge}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="gc-btn gc-btn-ghost" onClick={() => navigate('/recipes')}>
              Back
            </button>
            <button className="gc-btn gc-btn-ghost" onClick={() => setCostOpen((v) => !v)}>
              Cost History
            </button>
            <button className="gc-btn gc-btn-ghost" onClick={printNow}>
              Print
            </button>
            <button className="gc-btn gc-btn-primary" onClick={() => saveMeta()} disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="gc-card p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="gc-label">NAME</div>
            <input className="gc-input mt-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div className="gc-label">CATEGORY</div>
            <input className="gc-input mt-2 w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Salad, Main, Dessert" />
          </div>

          <div>
            <div className="gc-label">PORTIONS</div>
            <input className="gc-input mt-2 w-full text-right" value={portions} onChange={(e) => setPortions(e.target.value)} inputMode="decimal" />
          </div>
        </div>

        <div className="mt-4">
          <div className="gc-label">DESCRIPTION (Menu)</div>
          <textarea className="gc-input mt-2 w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short menu description..." />
        </div>
      </div>

      {/* Method Steps */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="gc-label">METHOD STEPS</div>
            <div className="text-xs text-neutral-500">Tip: Ctrl/Cmd + Enter adds step • Ctrl/Cmd + S saves</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={newStepInputRef}
            className="gc-input flex-1 min-w-[240px]"
            placeholder="Add a step..."
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
          />
          <button className="gc-btn gc-btn-primary" onClick={addStep}>
            + Add Step
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {steps.length === 0 ? (
            <div className="text-sm text-neutral-500">No steps yet. Add your first step above.</div>
          ) : (
            steps.map((s, idx) => (
              <div key={idx} className="gc-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      Step {idx + 1}
                    </div>
                    <div className="mt-1 text-sm text-neutral-700">{s}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="gc-btn gc-btn-ghost cursor-pointer">
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadStepPhoto(idx, f).catch(() => {})
                          }}
                        />
                      </label>

                      {stepPhotos[idx] ? (
                        <button
                          className="gc-btn gc-btn-ghost"
                          onClick={() => {
                            setStepPhotos((prev) => {
                              const arr = [...prev]
                              arr[idx] = ''
                              return arr
                            })
                            showToast('Step photo removed (remember Save)')
                          }}
                        >
                          Remove Photo
                        </button>
                      ) : null}
                    </div>

                    {stepPhotos[idx] ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border">
                        <img src={stepPhotos[idx]} alt={`Step ${idx + 1}`} className="h-56 w-full object-cover" />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button className="gc-btn gc-btn-ghost" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                      ↑
                    </button>
                    <button className="gc-btn gc-btn-ghost" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                      ↓
                    </button>
                    <button className="gc-btn gc-btn-ghost" onClick={() => deleteStepAt(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* legacy (optional) */}
        <div className="mt-6">
          <div className="gc-label">LEGACY METHOD (optional)</div>
          <textarea className="gc-input mt-2 w-full" rows={3} value={methodLegacy} onChange={(e) => setMethodLegacy(e.target.value)} placeholder="(Optional) old text method..." />
        </div>
      </div>

      {/* Lines */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="gc-label">RECIPE LINES</div>
            <div className="text-xs text-neutral-500">Add ingredients, sub-recipes, and groups. Edit in place.</div>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Total</div>
            <div className="text-xl font-extrabold">{money(totalCost, currency)}</div>
            <div className="text-xs text-neutral-500">
              CPP: <b>{money(cpp, currency)}</b>
            </div>
          </div>
        </div>

        {/* Inline Add */}
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="gc-label">SEARCH</div>
            <input className="gc-input mt-2 w-full" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Search ingredient..." />
          </div>

          <div>
            <div className="gc-label">TYPE</div>
            <select className="gc-input mt-2 w-full" value={addType} onChange={(e) => setAddType(e.target.value as LineType)}>
              <option value="ingredient">Ingredient</option>
              <option value="subrecipe">Sub-Recipe</option>
              <option value="group">Group</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="gc-label">PICK</div>
            {addType === 'ingredient' ? (
              <select className="gc-input mt-2 w-full" value={addIngredientId} onChange={(e) => setAddIngredientId(e.target.value)}>
                <option value="">Select ingredient…</option>
                {ingredients
                  .filter((i) => {
                    const q = ingSearch.trim().toLowerCase()
                    if (!q) return true
                    return (i.name ?? '').toLowerCase().includes(q)
                  })
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name ?? 'Ingredient'}
                    </option>
                  ))}
              </select>
            ) : addType === 'subrecipe' ? (
              <select className="gc-input mt-2 w-full" value={addSubRecipeId} onChange={(e) => setAddSubRecipeId(e.target.value)}>
                <option value="">Select sub-recipe…</option>
                {subRecipes
                  .filter((r) => r.id !== recipe.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            ) : (
              <input className="gc-input mt-2 w-full" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group title..." />
            )}
          </div>

          <div>
            <div className="gc-label">QTY</div>
            <input className="gc-input mt-2 w-full text-right" value={addQty} onChange={(e) => setAddQty(e.target.value)} inputMode="decimal" />
          </div>

          <div>
            <div className="gc-label">UNIT</div>
            {/* ✅ unit visibility fix: gc-unit-select */}
            <select className="gc-input mt-2 w-full gc-unit-select" value={addUnit} onChange={(e) => setAddUnit(e.target.value as any)}>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
              <option value="pcs">pcs</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <div className="gc-label">NOTE</div>
          <input className="gc-input mt-2 w-full" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Optional note..." />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="gc-btn gc-btn-primary"
            disabled={savingAdd || savingGroup}
            onClick={async () => {
              if (!recipe) return

              if (addType === 'group') {
                const gt = groupTitle.trim()
                if (!gt) return showToast('Group title is required')
                setSavingGroup(true)
                try {
                  const pos = lines.length ? Math.max(...lines.map((x) => toNum(x.position, 0))) + 1 : 1
                  const ins = await supabase.from('recipe_lines').insert({
                    recipe_id: recipe.id,
                    kitchen_id: recipe.kitchen_id,
                    line_type: 'group',
                    group_title: gt,
                    ingredient_id: null,
                    sub_recipe_id: null,
                    qty: 0,
                    unit: 'g',
                    note: null,
                    yield_percent: null,
                    position: pos,
                  })
                  if (ins.error) throw ins.error
                  setGroupTitle('')
                  await loadAll(recipe.id)
                  showToast('Group added ✅')
                } catch (e: any) {
                  showToast(e?.message ?? 'Add failed')
                } finally {
                  setSavingGroup(false)
                }
                return
              }

              if (addType === 'ingredient' && !addIngredientId) return showToast('Pick an ingredient')
              if (addType === 'subrecipe' && !addSubRecipeId) return showToast('Pick a sub-recipe')

              setSavingAdd(true)
              try {
                const pos = lines.length ? Math.max(...lines.map((x) => toNum(x.position, 0))) + 1 : 1
                const ins = await supabase.from('recipe_lines').insert({
                  recipe_id: recipe.id,
                  kitchen_id: recipe.kitchen_id,
                  line_type: addType,
                  group_title: null,
                  ingredient_id: addType === 'ingredient' ? addIngredientId : null,
                  sub_recipe_id: addType === 'subrecipe' ? addSubRecipeId : null,
                  qty: Math.max(0, toNum(addQty, 0)),
                  unit: safeUnit(addUnit),
                  note: addNote.trim() || null,
                  yield_percent: null,
                  position: pos,
                })
                if (ins.error) throw ins.error
                setAddQty('1')
                setAddUnit('g')
                setAddNote('')
                setAddIngredientId('')
                setAddSubRecipeId('')
                await loadAll(recipe.id)
                showToast('Added ✅')
              } catch (e: any) {
                showToast(e?.message ?? 'Add failed')
              } finally {
                setSavingAdd(false)
              }
            }}
          >
            {savingAdd || savingGroup ? 'Saving…' : addType === 'group' ? '+ Add Group' : '+ Add Line'}
          </button>

          <button
            className="gc-btn gc-btn-ghost"
            onClick={async () => {
              if (!recipe) return
              await loadAll(recipe.id)
              showToast('Refreshed ✅')
            }}
          >
            Refresh
          </button>
        </div>

        {/* Lines table */}
        <div className="mt-6 space-y-2">
          {lines.length === 0 ? (
            <div className="text-sm text-neutral-500">No lines yet.</div>
          ) : (
            lines.map((r) => {
              const isGroup = r.line_type === 'group'
              const isIng = r.line_type === 'ingredient'
              const isSub = r.line_type === 'subrecipe'
              const ing = r.ingredient_id ? ingById.get(r.ingredient_id) : null
              const sr = r.sub_recipe_id ? subRecipes.find((x) => x.id === r.sub_recipe_id) : null

              const rowKey = r.id
              const ed = edit[rowKey] ?? {
                qty: String(toNum(r.qty, 0)),
                unit: safeUnit(r.unit),
                yield_percent: r.yield_percent == null ? '' : String(toNum(r.yield_percent, 0)),
                note: (r.note ?? '').trim(),
              }

              const lineCost = isIng && ing ? Math.max(0, toNum(r.qty, 0)) * Math.max(0, toNum(ing.net_unit_cost, 0)) : 0

              return (
                <div key={r.id} className="gc-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-[220px]">
                      <div className="text-sm font-bold">
                        {isGroup ? `📁 ${r.group_title || 'Group'}` : isIng ? (ing?.name ?? 'Ingredient') : `🧩 ${sr?.name ?? 'Sub-Recipe'}`}
                      </div>
                      {r.note?.trim() ? <div className="mt-1 text-xs text-neutral-500">{clampStr(r.note, 140)}</div> : null}
                    </div>

                    {!isGroup ? (
                      <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                        <input
                          className="gc-input w-full text-right"
                          value={ed.qty}
                          inputMode="decimal"
                          onChange={(e) => setEdit((p) => ({ ...p, [rowKey]: { ...ed, qty: e.target.value } }))}
                        />

                        {/* ✅ unit visibility fix: gc-unit-select */}
                        <select
                          className="gc-input w-full text-right gc-unit-select"
                          value={safeUnit(r.unit)}
                          onChange={(ev) => {
                            const u = safeUnit(ev.target.value)
                            setEdit((p) => ({ ...p, [rowKey]: { ...ed, unit: u } }))
                            setLines((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit: u } : x)))
                          }}
                        >
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="pcs">pcs</option>
                        </select>

                        <div className="text-right text-sm font-semibold">{money(lineCost, currency)}</div>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-neutral-500">Group</div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="gc-btn gc-btn-ghost"
                        onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                        disabled={!isSub}
                      >
                        {expanded[r.id] ? 'Hide Breakdown' : 'Expand'}
                      </button>

                      {/* Mgmt-only controls */}
                      {isMgmt ? (
                        <span className="gc-chip gc-chip--dark">MGMT</span>
                      ) : (
                        <span className="gc-chip">KITCHEN</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="gc-btn gc-btn-ghost"
                        disabled={rowSaving[rowKey] || isGroup}
                        onClick={async () => {
                          if (!recipe) return
                          if (isGroup) return
                          setRowSaving((p) => ({ ...p, [rowKey]: true }))
                          try {
                            const upd = await supabase
                              .from('recipe_lines')
                              .update({
                                qty: Math.max(0, toNum(ed.qty, 0)),
                                unit: safeUnit(ed.unit),
                                note: ed.note.trim() || null,
                                yield_percent: ed.yield_percent.trim() === '' ? null : Math.max(0, toNum(ed.yield_percent, 0)),
                              })
                              .eq('id', r.id)
                            if (upd.error) throw upd.error
                            showToast('Row saved ✅')
                            await loadAll(recipe.id)
                          } catch (e: any) {
                            showToast(e?.message ?? 'Save failed')
                          } finally {
                            setRowSaving((p) => ({ ...p, [rowKey]: false }))
                          }
                        }}
                      >
                        {rowSaving[rowKey] ? 'Saving…' : 'Save Row'}
                      </button>

                      <button
                        className="gc-btn gc-btn-ghost"
                        onClick={async () => {
                          if (!recipe) return
                          try {
                            const del = await supabase.from('recipe_lines').delete().eq('id', r.id)
                            if (del.error) throw del.error
                            showToast('Deleted ✅')
                            await loadAll(recipe.id)
                          } catch (e: any) {
                            showToast(e?.message ?? 'Delete failed')
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {isSub && expanded[r.id] ? (
                    <div className="mt-4 border-t pt-4">
                      <div className="text-xs font-semibold text-neutral-600">SUB-RECIPE BREAKDOWN</div>
                      <div className="mt-2 text-xs text-neutral-500">This is a view-only breakdown for reference.</div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Sub-recipe settings */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="gc-label">SUB-RECIPE SETTINGS</div>
            <div className="text-xs text-neutral-500">Enable yield fields when this recipe is used as a sub-recipe.</div>
          </div>
          <button className="gc-btn gc-btn-ghost" onClick={yieldSmart} disabled={!isSubRecipe || yieldSmartLoading}>
            {yieldSmartLoading ? 'Calculating…' : 'Yield Smart'}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isSubRecipe} onChange={(e) => setIsSubRecipe(e.target.checked)} />
            <span className="text-sm font-semibold">This is a sub-recipe</span>
          </label>

          <div>
            <div className="gc-label">YIELD QTY</div>
            <input className="gc-input mt-2 w-full text-right" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="decimal" disabled={!isSubRecipe} />
          </div>

          <div>
            <div className="gc-label">YIELD UNIT</div>
            {/* ✅ unit visibility fix: gc-unit-select */}
            <select
              className="gc-input mt-2 w-full gc-unit-select"
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
      </div>

      {/* Nutrition + Pricing (Mgmt view can see pricing emphasis) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="gc-card p-6">
          <div className="gc-label">NUTRITION (per portion)</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div>
              <div className="gc-label">KCAL</div>
              <input className="gc-input mt-2 w-full text-right" value={calories} onChange={(e) => setCalories(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <div className="gc-label">PROTEIN</div>
              <input className="gc-input mt-2 w-full text-right" value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="gc-label">CARBS</div>
              <input className="gc-input mt-2 w-full text-right" value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="gc-label">FAT</div>
              <input className="gc-input mt-2 w-full text-right" value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" />
            </div>
          </div>
        </div>

        <div className="gc-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="gc-label">PRICING (per portion)</div>
              <div className="text-xs text-neutral-500">{isMgmt ? 'Management view: pricing tools enabled.' : 'Kitchen view: pricing still visible (read-only mindset).'}</div>
            </div>
            {isMgmt ? <span className="gc-chip gc-chip--dark">MGMT</span> : <span className="gc-chip">KITCHEN</span>}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="gc-label">CURRENCY</div>
              <input className="gc-input mt-2 w-full" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
            <div>
              <div className="gc-label">SELLING PRICE</div>
              <input className="gc-input mt-2 w-full text-right" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="gc-label">TARGET FC %</div>
              <input className="gc-input mt-2 w-full text-right" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="gc-card p-4">
              <div className="text-xs text-neutral-500">CPP</div>
              <div className="text-lg font-extrabold">{money(cpp, currency)}</div>
            </div>
            <div className="gc-card p-4">
              <div className="text-xs text-neutral-500">Food Cost</div>
              <div className="text-lg font-extrabold">{fcPct == null ? '—' : `${Math.round(fcPct * 10) / 10}%`}</div>
            </div>
            <div className="gc-card p-4">
              <div className="text-xs text-neutral-500">Margin</div>
              <div className="text-lg font-extrabold">{money(margin, currency)}</div>
              <div className="text-xs text-neutral-500">{marginPct == null ? '—' : `${Math.round(marginPct * 10) / 10}%`}</div>
            </div>
            <div className="gc-card p-4">
              <div className="text-xs text-neutral-500">Suggested</div>
              <div className="text-lg font-extrabold">{money(suggestedPrice, currency)}</div>
              <button className="gc-btn gc-btn-ghost mt-2" onClick={applySuggested} disabled={!isMgmt}>
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pack D: Cost History Drawer */}
      {costOpen ? (
        <div className="gc-card p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="gc-label">COST HISTORY</div>
              <div className="text-xs text-neutral-500">Local history points saved after successful Save.</div>
            </div>
            <button className="gc-btn gc-btn-ghost" onClick={() => setCostOpen(false)}>
              Close
            </button>
          </div>

          {costPoints.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-500">No history yet.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {costPoints.slice().reverse().map((p: any, idx: number) => (
                <div key={idx} className="gc-card p-4 flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-semibold">{money(toNum(p.cpp, 0), p.currency || currency)}</div>
                    <div className="text-xs text-neutral-500">
                      Portions: {toNum(p.portions, 1)} • Total: {money(toNum(p.totalCost, 0), p.currency || currency)}
                    </div>
                  </div>
                  <button
                    className="gc-btn gc-btn-ghost"
                    onClick={() => {
                      if (!id) return
                      deleteCostPoint(id, p.ts)
                      showToast('Removed history point')
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
