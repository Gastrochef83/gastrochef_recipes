// src/pages/RecipeEditor.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'
import { useMode } from '../lib/mode'
import { getIngredientsCached } from '../lib/ingredientsCache'
import { CostTimeline } from '../components/CostTimeline'
import { addCostPoint, clearCostPoints, listCostPoints, deleteCostPoint } from '../lib/costHistory'
import { useKitchen } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import { exportRecipeExcelUltra } from '../utils/exportRecipeExcelUltra'

type LineType = 'ingredient' | 'subrecipe' | 'group'

type Recipe = {
  id: string
  code?: string | null
  code_category?: string | null
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

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean | null
}

type Line = {
  id: string
  kitchen_id: string | null
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number
  qty: number // NET qty
  unit: string
  yield_percent: number
  notes: string | null
  gross_qty_override: number | null // manual gross
  line_type: LineType
  group_title: string | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}
function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
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
function fmtQty(n: number) {
  const v = Number.isFinite(n) ? n : 0
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(3)
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

function uid() {
  // client-side ID for optimistic rows (will be replaced by DB id on insert)
  return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`
}


// ===============================
// Draft lines persistence (so Add Ingredients never disappears)
// ===============================
const draftKey = (rid: string) => `gc_recipe_lines_draft__${rid}`

function readDraftLines(rid: string): Line[] {
  try {
    const raw = localStorage.getItem(draftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Line[]
  } catch {
    return []
  }
}

function writeDraftLines(rid: string, lines: Line[]) {
  try {
    localStorage.setItem(draftKey(rid), JSON.stringify(lines))
  } catch {
    // ignore
  }
}

function clearDraftLines(rid: string) {
  try {
    localStorage.removeItem(draftKey(rid))
  } catch {
    // ignore
  }
}

function mergeDbAndDraft(db: Line[], draft: Line[]): Line[] {
  const byId = new Set((db || []).map((l) => l.id))
  const extra = (draft || []).filter((l) => l && l.id && !byId.has(l.id))
  const merged = [...(db || []), ...extra]
  merged.sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
  return merged
}
const PHOTO_BUCKET = 'recipe-photos'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

export default function RecipeEditor() {
  const { isKitchen, isMgmt } = useMode()
  const showCost = isMgmt
  const tableColSpan = 8 + (showCost ? 1 : 0)
const k = useKitchen()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const id = sp.get('id')

  // Global autosave status (drives the topbar badge + local save UX)
  const autosave = useAutosave()

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])

  // ===============================
  // GOD ERP SAFE LINES UPDATE (prevents crashes + race updates)
  // ===============================
  const setLinesSafe = useCallback(
    (updater: any) => {
      setLines((prev) => {
        try {
          if (typeof updater === 'function') return updater(prev)
          if (Array.isArray(updater)) return updater
          return prev
        } catch (e) {
          console.error('setLinesSafe prevented crash', e)
          return prev
        }
      })
    },
    [setLines]
  )

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }, [])

  

  // =======================================
  // GOD SAFE UPDATE LINE (UI only)
  // =======================================
  
// Meta fields
  const [code, setCode] = useState('')
  const [codeCategory, setCodeCategory] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])

  // Nutrition
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // Pricing
  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')

  // Subrecipe settings
  const [isSubRecipe, setIsSubRecipe] = useState(false)
  const [yieldQty, setYieldQty] = useState('')
  const [yieldUnit, setYieldUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')

  // Uploading
  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)
  // UI
  const [density, setDensity] = useState<'comfort' | 'compact'>(() => {
    try {
      const v = localStorage.getItem('gc_density')
      if (v === 'compact' || v === 'comfort') return v
      // legacy
      const v2 = localStorage.getItem('gc_v5_density')
      return v2 === 'dense' ? 'compact' : 'comfort'
    } catch {
      return 'comfort'
    }
  })


useEffect(() => {
  try {
    const d = density === 'compact' ? 'compact' : 'comfort'
    document.documentElement.setAttribute('data-density', d)
    localStorage.setItem('gc_density', d)
    // legacy
    localStorage.setItem('gc_v5_density', d === 'compact' ? 'dense' : 'comfortable')
  } catch {}
}, [density])
  // Header tabs active state (scroll-aware)
  const [activeSection, setActiveSection] = useState<string>('sec-basics')
  useEffect(() => {
    const ids = ['sec-basics','sec-method','sec-nutrition','sec-lines','sec-print','sec-cook','sec-cost']
    const els = ids.map((x) => document.getElementById(x)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio - a.intersectionRatio))
        const top = visible[0]
        if (top?.target?.id) setActiveSection(top.target.id)
      },
      { root: null, rootMargin: '-20% 0px -70% 0px', threshold: [0.05, 0.1, 0.2, 0.35] }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const scrollToSection = useCallback((anchorId: string) => {
    try {
      const el = document.getElementById(anchorId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {}
  }, [])

  // Inline add
  const [addType, setAddType] = useState<LineType>('ingredient')
  const [ingSearch, setIngSearch] = useState('')


  // Derived (must be declared BEFORE any early returns to keep hooks order stable)
  const cur = (currency || 'USD').toUpperCase()

  const visibleLines = useMemo(
    () => [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [lines]
  )

  const filteredIngredients = useMemo(() => {
    const s = ingSearch.trim().toLowerCase()
    let list = ingredients
    if (s) list = list.filter((i) => (i.name || '').toLowerCase().includes(s))
    return list.slice(0, 60)
  }, [ingredients, ingSearch])

  const subRecipeOptions = useMemo(() => {
    const list = allRecipes.filter((r) => !!r.is_subrecipe && !r.is_archived)
    return list.slice(0, 200)
  }, [allRecipes])

  const [addIngredientId, setAddIngredientId] = useState('')
  const [addSubRecipeId, setAddSubRecipeId] = useState('')
  const [addGroupTitle, setAddGroupTitle] = useState('')
  const [addNetQty, setAddNetQty] = useState('1')
  const [addUnit, setAddUnit] = useState('g')
  const [addYield, setAddYield] = useState('100')
  const [addGross, setAddGross] = useState('') // optional gross override
  const [flashLineId, setFlashLineId] = useState<string | null>(null)

    useEffect(() => {
    if (!flashLineId) return
    const t = window.setTimeout(() => setFlashLineId(null), 700)
    return () => window.clearTimeout(t)
  }, [flashLineId])

// Auto-calc yield for NEW line when both Net and Gross are provided
  useEffect(() => {
    const raw = (addGross || '').trim()
    if (!raw) return
    const gross = toNum(raw, NaN as any)
    if (!Number.isFinite(gross) || gross <= 0) return
    const net = Math.max(0, toNum(addNetQty, 0))
    const y = clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100)
    // Keep it stable for typing
    setAddYield(String(Math.round(y * 100) / 100))
  }, [addGross, addNetQty])

  // Cost History
  const [costPoints, setCostPoints] = useState(() => (id ? listCostPoints(id) : []))
  useEffect(() => {
    if (!id) return
    setCostPoints(listCostPoints(id))
  }, [id])

  // ---------- Refs to avoid freeze ----------
  const recipeRef = useRef<Recipe | null>(null)
  const linesRef = useRef<Line[]>([])
  useEffect(() => {
    recipeRef.current = recipe
  }, [recipe])
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  // ---------- Draft helpers (MUST be declared before hooks that reference them) ----------
  const deletedLineIdsRef = useRef<string[]>([])
  const isDraftLine = useCallback((l: Line) => {
    const lid = (l?.id || '') as string
    return lid.startsWith('tmp_')
  }, [])

  // Persist drafts locally whenever there are tmp_ lines or pending deletions,
  // so navigating to Cook Mode won't drop unsaved additions.
  useEffect(() => {
    if (!id) return
    const cur = (lines || []) as Line[]
    const hasDraft = cur.some(isDraftLine) || (deletedLineIdsRef.current?.length || 0) > 0
    if (hasDraft) writeDraftLines(id, cur)
  }, [id, lines, isDraftLine])

  // ---------- Load ----------
  useEffect(() => {
    if (!id) {
      setErr('Missing recipe id.')
      setLoading(false)
      return
    }

    let alive = true
    async function load() {
      if (!alive) return
      setLoading(true)
      setErr(null)

      try {
        const { data: r, error: rErr } = await supabase
          .from('recipes')
          .select(
            'id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
          )
          .eq('id', id)
          .single()
        if (rErr) throw rErr

        const recipeRow = r as Recipe
        if (!alive) return

        setRecipe(recipeRow)
        try {
          localStorage.setItem('gc_last_recipe_id', recipeRow.id)
          localStorage.setItem('gc_last_recipe_name', recipeRow.name || '')
          localStorage.setItem('gc_last_recipe_ts', String(Date.now()))
        } catch {}

        setCode((recipeRow.code || '').toUpperCase())
        setCodeCategory((recipeRow.code_category || '').toUpperCase())
        setName(recipeRow.name || '')
        setCategory(recipeRow.category || '')
        setPortions(String(recipeRow.portions ?? 1))
        setDescription(recipeRow.description || '')

        setSteps((recipeRow.method_steps || []).filter((x) => typeof x === 'string'))
        setStepPhotos((recipeRow.method_step_photos || []).filter((x) => typeof x === 'string'))
        setMethodLegacy(recipeRow.method || '')

        setCalories(recipeRow.calories != null ? String(recipeRow.calories) : '')
        setProtein(recipeRow.protein_g != null ? String(recipeRow.protein_g) : '')
        setCarbs(recipeRow.carbs_g != null ? String(recipeRow.carbs_g) : '')
        setFat(recipeRow.fat_g != null ? String(recipeRow.fat_g) : '')

        setCurrency((recipeRow.currency || 'USD').toUpperCase())
        setSellingPrice(recipeRow.selling_price != null ? String(recipeRow.selling_price) : '')
        setTargetFC(recipeRow.target_food_cost_pct != null ? String(recipeRow.target_food_cost_pct) : '30')

        setIsSubRecipe(!!recipeRow.is_subrecipe)
        setYieldQty(recipeRow.yield_qty != null ? String(recipeRow.yield_qty) : '')
        setYieldUnit((safeUnit(recipeRow.yield_unit || 'g') as any) || 'g')

        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select(
            'id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title'
          )
          .eq('recipe_id', id)
          .order('position', { ascending: true })
        if (lErr) throw lErr
        if (!alive) return
        const draft = readDraftLines(id)
        const mergedLines = draft?.length ? mergeDbAndDraft((l || []) as Line[], draft) : ((l || []) as Line[])
        setLines(mergedLines as Line[])

        const ing = await getIngredientsCached()
        if (!alive) return
        setIngredients((ing || []) as Ingredient[])

        // list recipes for subrecipe picker
        const { data: rs, error: rsErr } = await supabase
          .from('recipes')
          .select('id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,currency')
          .order('name', { ascending: true })
        if (rsErr) throw rsErr
        if (!alive) return
        setAllRecipes((rs || []) as Recipe[])
      } catch (e: any) {
      const msg = e?.message || 'Failed to save lines.'
      autosave.setError(msg)

        if (!alive) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }

    load().catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  // ---------- Derived maps ----------
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

  // ---------- Smart math per line ----------
  const lineComputed = useMemo(() => {
    const res = new Map<
      string,
      { net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; warnings: string[] }
    >()

    const cur = (currency || 'USD').toUpperCase()
    void cur

    for (const l of lines) {
      const warnings: string[] = []

      const net = Math.max(0, toNum(l.qty, 0))
      const yieldPct = clamp(toNum(l.yield_percent, 100), 0.0001, 100)

      // gross logic: if override exists use it else compute from yield
      const gross = l.gross_qty_override != null && l.gross_qty_override > 0 ? Math.max(0, l.gross_qty_override) : net / (yieldPct / 100)

      let unitCost = 0
      let lineCost = 0

      if (l.line_type === 'ingredient') {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        unitCost = toNum(ing?.net_unit_cost, 0)
        if (!ing) warnings.push('Missing ingredient')
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')

        const packUnit = ing?.pack_unit || l.unit
        const qtyInPack = convertQtyToPackUnit(gross, l.unit, packUnit)
        lineCost = qtyInPack * unitCost
      } else if (l.line_type === 'subrecipe') {
        // keep safe: do not recursively compute (can be heavy)
        // later can compute from snapshots/view
        warnings.push('Subrecipe cost not expanded')
      } else {
        // group title line: no cost
      }

      res.set(l.id, {
        net,
        gross,
        yieldPct,
        unitCost,
        lineCost: Number.isFinite(lineCost) ? lineCost : 0,
        warnings,
      })
    }

    return res
  }, [lines, ingById, currency])

  const totals = useMemo(() => {
    let totalCost = 0
    let warnings: string[] = []

    for (const l of lines) {
      if (l.line_type === 'group') continue
      const c = lineComputed.get(l.id)
      if (!c) continue
      totalCost += c.lineCost
      if (c.warnings.length) warnings = warnings.concat(c.warnings)
    }

    const p = Math.max(1, toNum(portions, 1))
    const cpp = p > 0 ? totalCost / p : 0

    const sell = Math.max(0, toNum(sellingPrice, 0))
    const fcPct = sell > 0 ? (cpp / sell) * 100 : null
    const margin = sell - cpp
    const marginPct = sell > 0 ? (margin / sell) * 100 : null

    const uniqWarnings = Array.from(new Set(warnings)).slice(0, 4)

    return { totalCost, cpp, fcPct, margin, marginPct, warnings: uniqWarnings }
  }, [lines, lineComputed, portions, sellingPrice])

  // ---------- Debounced meta save ----------
  const [savingMeta, setSavingMeta] = useState(false)
  const metaSaveTimer = useRef<number | null>(null)


  // ---------- Debounced lines save ----------
  const [savingLines, setSavingLines] = useState(false)
  const linesSaveTimer = useRef<number | null>(null)
  // ---------- Save indicator smoothing (prevents flicker) ----------
  const [savePulse, setSavePulse] = useState(false)
  const savePulseTimer = useRef<number | null>(null)

  useEffect(() => {
    const active = savingMeta || savingLines
    if (active) {
      if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
      setSavePulse(true)
      return
    }
    if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
    savePulseTimer.current = window.setTimeout(() => setSavePulse(false), 700)

    return () => {
      if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
    }
  }, [savingMeta, savingLines])

  const saveLinesNow = useCallback(async (override?: Line[]): Promise<boolean> => {
    if (!id) return false
    const rid = id
    const kitchenId = recipeRef.current?.kitchen_id ?? k.kitchenId ?? null
    if (!kitchenId) {
      setErr('Kitchen not resolved yet. Please wait a moment and try again.')
      return false
    }

    setErr(null)
    setSavingLines(true)
    autosave.setSaving()
    try {
      // 1) delete removed DB lines (if any)
      const delIds = deletedLineIdsRef.current.filter((x) => x && !x.startsWith('tmp_'))
      if (delIds.length) {
        deletedLineIdsRef.current = []
        const { error: delErr } = await supabase.from('recipe_lines').delete().in('id', delIds)
        if (delErr) throw delErr
      }

      // 2) split draft vs persisted
      const cur = ((override ?? linesRef.current) || []) as Line[]
      const drafts = cur.filter(isDraftLine)
      const persisted = cur.filter((l) => !isDraftLine(l))
      const needsReload = drafts.length > 0 || delIds.length > 0

      // 3) upsert persisted rows
      if (persisted.length) {
        const payload = persisted.map((l) => ({
          id: l.id,
          kitchen_id: l.kitchen_id ?? kitchenId,
          recipe_id: rid,
          ingredient_id: l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id,
          position: l.position,
          qty: toNum(l.qty, 0),
          unit: safeUnit(l.unit),
          yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
          notes: l.notes ?? null,
          gross_qty_override: l.gross_qty_override ?? null,
          line_type: l.line_type,
          group_title: l.group_title ?? null,
        }))
        const { error: upErr } = await supabase.from('recipe_lines').upsert(payload)
        if (upErr) throw upErr
      }

      // 4) insert drafts (DB generates ids) then reload
      if (drafts.length) {
        const payload = drafts.map((l) => ({
          kitchen_id: kitchenId,
          recipe_id: rid,
          ingredient_id: l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id,
          position: l.position,
          qty: toNum(l.qty, 0),
          unit: safeUnit(l.unit),
          yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
          notes: l.notes ?? null,
          gross_qty_override: l.gross_qty_override ?? null,
          line_type: l.line_type,
          group_title: l.group_title ?? null,
        }))
        const { error: insErr } = await supabase.from('recipe_lines').insert(payload)
        if (insErr) throw insErr
      }

      // 5) reload authoritative lines ONLY when we inserted drafts (need real ids) or deleted rows.
      if (needsReload) {
        const { data: l2, error: l2Err } = await supabase
          .from('recipe_lines')
          .select('id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title')
          .eq('recipe_id', rid)
          .order('position', { ascending: true })
        if (l2Err) throw l2Err
        setLinesSafe((l2 || []) as Line[])
        clearDraftLines(rid)
      } else {
        // No reload = no cursor/typing flicker (especially Notes). We already updated local state.
        clearDraftLines(rid)
      }

      autosave.setSaved()
      return true
    } catch (e: any) {
      try {
        // Keep current lines locally so navigation (Cook Mode) won't lose them.
        const cur = ((override ?? linesRef.current) || []) as Line[]
        writeDraftLines(rid, cur)
      } catch {}
      setErr(msg)
      return false
    } finally {
      setSavingLines(false)
    }
  }, [id, isDraftLine, setLinesSafe, k.kitchenId, autosave])

  const scheduleLinesSave = useCallback(() => {
    if (!id) return
    if (linesSaveTimer.current) window.clearTimeout(linesSaveTimer.current)
    linesSaveTimer.current = window.setTimeout(() => {
      saveLinesNow().then(() => {}).catch(() => {})

    }, 650)
  }, [id, saveLinesNow])

  // Update a single line locally, then schedule save (prevents note flicker / lost typing)
  const updateLine = useCallback(
    (lineId: string, patch: Partial<Line>) => {
      if (!lineId) return
      const cur = (linesRef.current || []) as Line[]
      const next = cur.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
      linesRef.current = next
      setLinesSafe(next)
      scheduleLinesSave()
    },
    [scheduleLinesSave, setLinesSafe]
  )



  
  const duplicateLineLocal = useCallback(
    (lineId: string) => {
      if (!lineId) return
      const cur = (linesRef.current || []) as Line[]
      const src = cur.find((l) => l.id === lineId)
      if (!src) return

      const maxPos = cur.reduce((m, l) => Math.max(m, toNum(l.position, 0)), 0)
      const copy: Line = {
        ...src,
        id: uid(),
        position: maxPos + 1,
        // keep ingredient/subrecipe ids, qty/unit/yield/notes/gross override, type
      }

      const next = [...cur, copy].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
      linesRef.current = next
      setLinesSafe(next)
      // Persist immediately so Cook Mode sees it and it won't disappear.
      saveLinesNow(next).then(() => {}).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )

const deleteLineLocal = useCallback(
    (lineId: string) => {
      if (!lineId) return

      const cur = (linesRef.current || []) as Line[]
      const next = cur.filter((x) => x.id !== lineId)

      // mark for DB delete if needed (avoid duplicates)
      if (!lineId.startsWith('tmp_') && !deletedLineIdsRef.current.includes(lineId)) {
        deletedLineIdsRef.current.push(lineId)
      }

      linesRef.current = next
      setLinesSafe(next)

      // Persist immediately so refresh won't bring the line back.
      saveLinesNow(next).then(() => {}).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )


  const buildMetaPatch = useCallback(() => {
    const patch: any = {
      code: (code || '').trim().toUpperCase() || null,
      code_category: (codeCategory || '').trim().toUpperCase() || null,
      name: (name || '').trim() || 'Untitled',
      category: (category || '').trim() || null,
      portions: Math.max(1, Math.floor(toNum(portions, 1))),
      description: description || '',
      method_steps: steps,
      method_step_photos: stepPhotos,
      method: methodLegacy || '',
      calories: calories === '' ? null : toNum(calories, null as any),
      protein_g: protein === '' ? null : toNum(protein, null as any),
      carbs_g: carbs === '' ? null : toNum(carbs, null as any),
      fat_g: fat === '' ? null : toNum(fat, null as any),
      currency: (currency || 'USD').toUpperCase(),
      selling_price: sellingPrice === '' ? null : toNum(sellingPrice, null as any),
      target_food_cost_pct: targetFC === '' ? null : toNum(targetFC, null as any),
      is_subrecipe: !!isSubRecipe,
      yield_qty: yieldQty === '' ? null : toNum(yieldQty, null as any),
      yield_unit: safeUnit(yieldUnit),
    }
    return patch
  }, [
    code,
    codeCategory,
    name,
    category,
    portions,
    description,
    steps,
    stepPhotos,
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
  ])

  const saveMetaNow = useCallback(async () => {
    if (!id) return
    setErr(null)
    setSavingMeta(true)
    try {
      const patch = buildMetaPatch()
      const { error } = await supabase.from('recipes').update(patch).eq('id', id)
      if (error) throw error
      showToast('Saved.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to save.')
    } finally {
      setSavingMeta(false)
    }
  }, [id, buildMetaPatch, showToast])

  const scheduleMetaSave = useCallback(() => {
    if (!id) return
    if (metaSaveTimer.current) window.clearTimeout(metaSaveTimer.current)
    metaSaveTimer.current = window.setTimeout(() => {
      saveMetaNow().catch(() => {})
    }, 650)
  }, [id, saveMetaNow])

  // auto-save recipe meta (name/portions/steps/photos/etc)
  const metaHydratedRef = useRef(false)
  useEffect(() => {
    if (!recipe) return
    // Skip the first run right after loading from DB
    if (!metaHydratedRef.current) {
      metaHydratedRef.current = true
      return
    }
    scheduleMetaSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    code,
    codeCategory,
    name,
    category,
    portions,
    description,
    steps,
    stepPhotos,
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
  ])

const addLineLocal = useCallback(async () => {
    if (!id) return
    const rid = id

    const basePos = (linesRef.current?.length || 0) + 1
    const yRaw = clamp(toNum(addYield, 100), 0.0001, 100)
    const net = Math.max(0, toNum(addNetQty, 0))
    const gross = addGross.trim() === '' ? null : Math.max(0, toNum(addGross, 0))

    // If user provided BOTH net and gross, compute yield automatically (best UX):
    // yield% = (net / gross) * 100. We still store net in qty and keep gross as override.
    const y = gross != null && gross > 0 && net >= 0 ? clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100) : yRaw

    if (addType === 'ingredient') {
      if (!addIngredientId) {
        setErr('Pick an ingredient first.')
        return
      }
      const newL: Line = {
        id: uid(),
        kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
        recipe_id: rid,
        ingredient_id: addIngredientId,
        sub_recipe_id: null,
        position: basePos,
        qty: net,
        unit: addUnit || 'g',
        yield_percent: y,
        notes: null,
        gross_qty_override: gross,
        line_type: 'ingredient',
        group_title: null,
      }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      if (ok) {
        showToast('Line added & saved.')
      } else {
        showToast('Could not save line yet. It is kept locally — try again in a moment.')
      }
      return
    }

    if (addType === 'subrecipe') {
      if (!addSubRecipeId) {
        setErr('Pick a subrecipe first.')
        return
      }
      const newL: Line = {
        id: uid(),
        kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
        recipe_id: rid,
        ingredient_id: null,
        sub_recipe_id: addSubRecipeId,
        position: basePos,
        qty: net,
        unit: addUnit || 'g',
        yield_percent: y,
        notes: null,
        gross_qty_override: gross,
        line_type: 'subrecipe',
        group_title: null,
      }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      showToast(ok ? 'Subrecipe line added & saved.' : 'Subrecipe line added — saved locally (syncing...).')
      if (!ok) scheduleLinesSave()
      return
    }

    // group
    const title = (addGroupTitle || '').trim()
    if (!title) {
      setErr('Enter group title.')
      return
    }
    const newL: Line = {
      id: uid(),
      kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
      recipe_id: rid,
      ingredient_id: null,
      sub_recipe_id: null,
      position: basePos,
      qty: 0,
      unit: 'g',
      yield_percent: 100,
      notes: null,
      gross_qty_override: null,
      line_type: 'group',
      group_title: title,
    }
    setErr(null)
    const next = [...(linesRef.current || []), newL]
    linesRef.current = next
    setLinesSafe(next)
    const ok = await saveLinesNow(next)
    showToast(ok ? 'Group added & saved.' : 'Group added — saved locally (syncing...).')
    if (!ok) scheduleLinesSave()
  }, [
    id,
    addType,
    addIngredientId,
    addSubRecipeId,
    addGroupTitle,
    addNetQty,
    addUnit,
    addYield,
    addGross,
    setLinesSafe,
    saveLinesNow,
    scheduleLinesSave,
    showToast,
    k.kitchenId,
])

  // ---------- Smart syncing handlers ----------
  const onNetChange = useCallback(
    (lineId: string, value: string) => {
      const net = Math.max(0, toNum(value, 0))
      const line = linesRef.current.find((x) => x.id === lineId)
      if (!line) return

      // if gross override exists -> yield becomes net/gross*100
      if (line.gross_qty_override != null && line.gross_qty_override > 0) {
        const gross = Math.max(0.0000001, line.gross_qty_override)
        const y = clamp((net / gross) * 100, 0.0001, 100)
        updateLine(lineId, { qty: net, yield_percent: y })
      } else {
        updateLine(lineId, { qty: net })
      }
    },
    [updateLine]
  )

  const onGrossChange = useCallback(
    (lineId: string, value: string) => {
      const raw = value.trim()
      const line = linesRef.current.find((x) => x.id === lineId)
      if (!line) return

      if (raw === '') {
        // remove override: gross becomes computed from yield
        updateLine(lineId, { gross_qty_override: null })
        return
      }

      const gross = Math.max(0, toNum(raw, 0))
      if (gross <= 0) {
        updateLine(lineId, { gross_qty_override: null })
        return
      }

      const net = Math.max(0, toNum(line.qty, 0))
      const y = clamp((net / gross) * 100, 0.0001, 100)
      updateLine(lineId, { gross_qty_override: gross, yield_percent: y })
    },
    [updateLine]
  )

  const onYieldChange = useCallback(
    (lineId: string, value: string) => {
      const y = clamp(toNum(value, 100), 0.0001, 100)
      // rule: if user edits yield, we clear gross override to avoid conflicts
      updateLine(lineId, { yield_percent: y, gross_qty_override: null })
    },
    [updateLine]
  )

  // ---------- Reorder ----------
  const moveLine = useCallback(
    (lineId: string, dir: -1 | 1) => {
      const arr = [...linesRef.current].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const idx = arr.findIndex((x) => x.id === lineId)
      if (idx < 0) return
      const j = idx + dir
      if (j < 0 || j >= arr.length) return
      const tmp = arr[idx]
      arr[idx] = arr[j]
      arr[j] = tmp
      setLinesSafe(arr)
    },
    [setLinesSafe]
  )

  // ---------- Photo upload ----------
  const uploadRecipePhoto = useCallback(
    async (file: File) => {
      if (!id) return
      setErr(null)
      setUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${id}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`

        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        })
        if (upErr) throw upErr

        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        const url = pub?.publicUrl || null

        const { error: rErr } = await supabase.from('recipes').update({ photo_url: url }).eq('id', id)
        if (rErr) throw rErr

        setRecipe((prev) => (prev ? { ...prev, photo_url: url } : prev))
        showToast('Photo updated.')
      } catch (e: any) {
        setErr(e?.message || 'Failed to upload photo.')
      } finally {
        setUploading(false)
      }
    },
    [id, showToast]
  )

  const uploadStepPhoto = useCallback(
    async (file: File, stepIndex: number) => {
      if (!id) return
      setErr(null)
      setStepUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${id}/steps/${stepIndex}_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`

        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        })
        if (upErr) throw upErr

        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        const url = pub?.publicUrl || ''

        setStepPhotos((prev) => {
          const next = [...prev]
          next[stepIndex] = url
          return next
        })
        scheduleMetaSave()
        showToast('Step photo updated.')
      } catch (e: any) {
        setErr(e?.message || 'Failed to upload step photo.')
      } finally {
        setStepUploading(false)
      }
    },
    [id, showToast, scheduleMetaSave]
  )

  // ---------- Steps ----------
  const addStep = useCallback(() => {
    const s = (newStep || '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
    // Persist steps/step photos via meta autosave
    scheduleMetaSave()
  }, [newStep, scheduleMetaSave])

  const removeStep = useCallback(
    (idx: number) => {
      setSteps((prev) => prev.filter((_, i) => i !== idx))
      setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
      scheduleMetaSave()
    },
    [scheduleMetaSave]
  )

  const updateStep = useCallback(
    (idx: number, value: string) => {
      setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)))
      scheduleMetaSave()
    },
    [scheduleMetaSave]
  )

// ---------- Cost point snapshot ----------
  const addSnapshot = useCallback(() => {
    if (!id) return
    const p = Math.max(1, Math.floor(toNum(portions, 1)))
    const cur = (currency || 'USD').toUpperCase()
    const totalCost = totals.totalCost
    const cpp = totals.cpp
    addCostPoint(id, {
      createdAt: Date.now(),
      totalCost,
      cpp,
      portions: p,
      currency: cur,
    } as any)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshot added.')
  }, [id, portions, currency, totals.totalCost, totals.cpp, showToast])

  const clearSnapshots = useCallback(() => {
    if (!id) return
    const ok = window.confirm('Clear all cost snapshots for this recipe?')
    if (!ok) return
    clearCostPoints(id)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshots cleared.')
  }, [id, showToast])

  const removeSnapshot = useCallback(
    (pid: string) => {
      if (!id) return
      deleteCostPoint(id, pid)
      setCostPoints(listCostPoints(id))
      showToast('Snapshot removed.')
    },
    [id, showToast]
  )

  // ---------- Print ----------
  // Printing the editor page can yield blank/partial output.
  // We always print via the dedicated /print route which renders a clean print card.
  const printNow = useCallback(() => {
    if (!id) return
    const url = `#/print?id=${encodeURIComponent(id)}&autoprint=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [id])


  // ---------- Export (Excel) ----------
  const exportExcel = useCallback(async () => {
    try {
      const meta = {
        id: id || undefined,
        name: name || 'Recipe',
        category: category || '',
        portions: Math.max(1, Math.floor(Number(portions || 1))),
        yield_qty: yieldQty ? Number(yieldQty) : null,
        yield_unit: yieldUnit || null,
        currency: currency || 'USD',
        selling_price: sellingPrice ? Number(sellingPrice) : null,
        target_food_cost_pct: targetFC ? Number(targetFC) : null,
        description: description || '',
        steps: (steps || []).filter(Boolean),
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null,
        carbs_g: carbs ? Number(carbs) : null,
        fat_g: fat ? Number(fat) : null,
      }

      const rows = lines
        .filter((l) => l.line_type !== 'group')
        .map((l) => {
          const c = lineComputed.get(l.id)
          const base = {
            type: l.line_type === 'subrecipe' ? 'subrecipe' : 'ingredient',
            name:
              l.line_type === 'ingredient'
                ? (l.ingredient_id ? ingById.get(l.ingredient_id)?.name : null) || 'Ingredient'
                : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.name || 'Subrecipe'),
            net_qty: c?.net ?? 0,
            unit: l.unit || '',
            yield_percent: c?.yieldPct ?? 100,
            gross_qty: c?.gross ?? 0,
            unit_cost: c?.unitCost ?? 0,
            line_cost: c?.lineCost ?? 0,
            notes: l.notes || '',
            warnings: c?.warnings || [],
          }
          return base
        })

      await exportRecipeExcelUltra({
        meta,
        totals: { totalCost: totals.totalCost, cpp: totals.cpp, fcPct: totals.fcPct, margin: totals.margin, marginPct: totals.marginPct },
        lines: rows as any,
      })

      showToast('Excel exported.')
    } catch (e: any) {
      console.error(e)
      showToast('Excel export failed.')
    }
  }, [
    id,
    name,
    category,
    portions,
    yieldQty,
    yieldUnit,
    currency,
    sellingPrice,
    targetFC,
    description,
    steps,
    calories,
    protein,
    carbs,
    fat,
    lines,
    lineComputed,
    ingById,
    allRecipes,
    totals.totalCost,
    totals.cpp,
    totals.fcPct,
    totals.margin,
    totals.marginPct,
    showToast,
  ])

  // ---------- Guards ----------
  if (loading) {
    return (
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label">RECIPE EDITOR</div>
        <div className="gc-hint" style={{ marginTop: 10 }}>
          Loading…
        </div>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label">ERROR</div>
        <div className="gc-hint" style={{ marginTop: 10 }}>
          Missing recipe id.
        </div>
      </div>
    )
  }
  const headerLeft = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <NavLink to="/recipes" className="gc-btn gc-btn-ghost">
        ← Back
      </NavLink>
      <div>
        <div className="gc-label">RECIPE</div>
        <div style={{ fontWeight: 900, fontSize: 15 }}>{(name || 'Untitled').trim()}</div>
        <div className="gc-hint" style={{ marginTop: 2, fontWeight: 700 }}>
          {autosave.status === 'saving'
            ? 'Saving…'
            : autosave.status === 'error'
            ? (autosave.message || 'Save issue. Retrying…')
            : autosave.lastSavedAt
            ? `Saved ${Math.max(1, Math.round((Date.now() - autosave.lastSavedAt) / 1000))}s ago ✓`
            : 'Auto-save ready.'}
        </div>
      </div>
    </div>
  )

  const headerRight = (
    <div className="gc-tabs" style={{ justifyContent: 'flex-end' }}>
      <span className={isKitchen ? 'gc-chip gc-chip-active' : 'gc-chip'}>{isKitchen ? 'Kitchen' : 'Mgmt'}</span>

      <button className="gc-btn-soft" type="button" onClick={() => setDensity((v) => (v === 'compact' ? 'comfort' : 'compact'))}>
        Density: {density}
      </button>

      <button className={cx('gc-btn-soft', activeSection === 'sec-basics' && 'is-active')} type="button" onClick={() => scrollToSection('sec-basics')}>Basics</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-method' && 'is-active')} type="button" onClick={() => scrollToSection('sec-method')}>Method</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-nutrition' && 'is-active')} type="button" onClick={() => scrollToSection('sec-nutrition')}>Nutrition</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-lines' && 'is-active')} type="button" onClick={() => scrollToSection('sec-lines')}>Lines</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-print' && 'is-active')} type="button" onClick={() => scrollToSection('sec-print')}>Print</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-cook' && 'is-active')} type="button" onClick={() => scrollToSection('sec-cook')}>Cook Mode</button>
      {showCost ? (
        <button className={cx('gc-btn-soft', activeSection === 'sec-cost' && 'is-active')} type="button" onClick={() => scrollToSection('sec-cost')}>Cost</button>
      ) : null}
    </div>
  )

  // Print-only CSS injected here (so print works even if global CSS changes)
  const PrintCss = (
    <style>{`
      @media print{
        .gc-shell, .gc-side, .gc-topbar-card, .gc-screen-only, nav, header, aside { display:none !important; }
        .gc-print-only{ display:block !important; }
        body{ background:#fff !important; }
      }
      .gc-print-only{ display:none; }
      .gc-print-page{
        width: 210mm;
        min-height: 297mm;
        padding: 16mm;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial;
        color: #0f172a;
      }
      .gc-print-header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap: 12mm;
        border-bottom: 1px solid rgba(15,23,42,.18);
        padding-bottom: 6mm;
        margin-bottom: 6mm;
      }
      .gc-print-name{ font-size: 20pt; font-weight: 900; }
      .gc-print-sub{ font-size: 10pt; color:#334155; margin-top: 2mm; }
      .gc-print-photo{
        width: 60mm;
        height: 40mm;
        border: 1px solid rgba(15,23,42,.18);
        border-radius: 6mm;
        overflow:hidden;
        background:#f1f5f9;
      }
      .gc-print-photo img{ width:100%; height:100%; object-fit:cover; display:block; }
      .gc-print-section{ margin-top: 6mm; }
      .gc-print-title{ font-size: 11pt; letter-spacing: .12em; font-weight: 900; color:#475569; text-transform: uppercase; }
      .gc-print-text{ margin-top: 2mm; font-size: 10.5pt; line-height: 1.35; white-space: pre-wrap; }
      .gc-print-table{
        width:100%;
        border-collapse: collapse;
        margin-top: 3mm;
        font-size: 10pt;
      }
      .gc-print-table th, .gc-print-table td{
        border-bottom: 1px solid rgba(15,23,42,.14);
        padding: 2.5mm 2mm;
        text-align: left;
        vertical-align: top;
      }
      .gc-print-table th{ font-size: 9.5pt; color:#475569; letter-spacing:.08em; text-transform:uppercase; }
      .gc-print-kpis{ display:flex; gap: 4mm; flex-wrap: wrap; margin-top: 3mm; }
      .gc-print-chip{
        border: 1px solid rgba(15,23,42,.18);
        border-radius: 4mm;
        padding: 2mm 3mm;
        font-size: 10pt;
      }
    `}</style>
  )

  return (
    <>
      {PrintCss}

      <div className="gc-card gc-screen-only">
        <div className="gc-card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {headerLeft}
          {headerRight}
        </div>

        <div className="gc-card-body">
          {err && (
            <div className="gc-card-soft" style={{ padding: 12, borderRadius: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 900, color: 'var(--gc-danger)' }}>{err}</div>
            </div>
          )}

          
          {true && (
            <div className="gc-section gc-card-soft">
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="gc-label" id="sec-print">PRINT (A4)</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>Professional chef-ready A4 print. No overflow.</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="gc-btn gc-btn-secondary" type="button" onClick={printNow}>Print now</button>
                  <button className="gc-btn gc-btn-primary" type="button" onClick={exportExcel}>Export Excel</button>
                  <button
                    className="gc-btn gc-btn-ghost"
                    type="button"
                    onClick={() => (id ? window.open(`#/print?id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer') : null)}
                    disabled={!id}
                  >
                    Open Print Page
                  </button>

                  <div className="gc-hint" style={{ marginLeft: 6 }}>
                    {savePulse ? 'Auto-saving…' : 'Auto-save ready.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {true && (
            <div className="gc-section gc-section-alt gc-card-soft">
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="gc-label" id="sec-cook">COOK MODE</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>Zero distraction cooking workflow.</div>
                </div>
                <button className="gc-btn gc-btn-primary gc-btn-hero" type="button" onClick={() => (id ? navigate(`/cook?id=${encodeURIComponent(id)}`) : null)} disabled={!id}>Open Cook Mode</button>
              </div>
            </div>
          )}


          {/* KPI Row */}
          {showCost && (
            <div className="gc-section gc-card-soft" style={{ padding: 12, borderRadius: 16 }}>
              <div className="gc-label" id="sec-cost">KPI</div>
              <div className="gc-grid-4" style={{ marginTop: 10 }}>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">TOTAL COST</div>
                  <div className="gc-kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                </div>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">COST/PORTION</div>
                  <div className="gc-kpi-value">{fmtMoney(totals.cpp, cur)}</div>
                </div>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">FC%</div>
                  <div className="gc-kpi-value">{totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                </div>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">MARGIN</div>
                  <div className="gc-kpi-value">{fmtMoney(totals.margin, cur)}</div>
                </div>
              </div>

              {totals.warnings?.length ? (
                <div className="gc-card-soft" style={{ marginTop: 10, padding: 10, borderRadius: 14, borderColor: 'rgba(245,158,11,.35)' }}>
                  <div className="gc-label" style={{ color: 'var(--gc-warn)' }}>WARN</div>
                  <div style={{ fontWeight: 900, marginTop: 4, color: 'var(--gc-warn)' }}>{totals.warnings[0]}</div>
                </div>
              ) : null}
            </div>
          )}
{showCost && (
            <div className="gc-section gc-section-alt gc-card-soft">
              <div style={{ padding: 12 }}>
                <div className="gc-label">PRICING / PORTION</div>
                <div className="gc-grid-3" style={{ marginTop: 10 }}>
                  <div className="gc-field"><div className="gc-label">CURRENCY</div><input className="gc-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
                  <div className="gc-field"><div className="gc-label">SELLING PRICE</div><input className="gc-input" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} inputMode="decimal" /></div>
                  <div className="gc-field"><div className="gc-label">TARGET FC%</div><input className="gc-input" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} inputMode="decimal" /></div>
                </div>
                <div className="gc-hint" style={{ marginTop: 8 }}>FC% = cost/portion ÷ selling price.</div>
              </div>
            </div>
          )}


          {true && (
            <div className="gc-section gc-section-alt gc-card-soft">
              <div style={{ padding: 12 }}>
                <div className="gc-label" id="sec-nutrition">NUTRITION / PORTION</div>
                <div className="gc-grid-4" style={{ marginTop: 10 }}>
                  <div className="gc-field">
                    <div className="gc-label">CAL</div>
                    <input className="gc-input" value={calories} onChange={(e) => setCalories(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="gc-field">
                    <div className="gc-label">PROTEIN g</div>
                    <input className="gc-input" value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="gc-field">
                    <div className="gc-label">CARBS g</div>
                    <input className="gc-input" value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="gc-field">
                    <div className="gc-label">FAT g</div>
                    <input className="gc-input" value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" />
                  </div>
                </div>

                <div className="gc-hint" style={{ marginTop: 10 }}>
                  Manual fields (no auto nutrition calc).
                </div>
              </div>
            </div>
          )}

          {/* Meta */}
          {true && (
          <div id="sec-basics" className="gc-section gc-card">
            <div className="gc-card-head">
              <div className="gc-label">META</div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Labels are always above inputs (premium SaaS). Auto-save is enabled.
              </div>
            </div>

            <div className="gc-card-body">
              <div className="gc-field-row">
                <div className="gc-col-6">
                  <div className="gc-field">
                    <div className="gc-label">CODE</div>
                    <input className="gc-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Leave empty to auto-generate" />
                    <div className="mt-2">
                      <div className="gc-label">CODE CATEGORY</div>
                      <input className="gc-input" value={codeCategory} onChange={(e) => setCodeCategory(e.target.value.toUpperCase())} placeholder="e.g. SAUCE / SAND / GEN (optional)" />
                      <div className="mt-1 text-[11px] text-neutral-500">Optional (max 6). If empty, DB uses Category.</div>
                    </div>
                  </div>
                </div>

                <div className="gc-col-3">
                  <div className="gc-field">
                    <div className="gc-label">NAME</div>
                    <input className="gc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name…" />
                  </div>
                </div>

                <div className="gc-col-3">
                  <div className="gc-field">
                    <div className="gc-label">CATEGORY</div>
                    <input className="gc-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Salad" />
                  </div>
                </div>

                <div className="gc-col-3">
                  <div className="gc-field">
                    <div className="gc-label">PORTIONS</div>
                    <input className="gc-input" value={portions} onChange={(e) => setPortions(e.target.value)} inputMode="numeric" />
                  </div>
                </div>

                <div className="gc-col-12">
                  <div className="gc-field">
                    <div className="gc-label">DESCRIPTION</div>
                    <textarea className="gc-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description…" />
                  </div>
                </div>
              </div>

              {/* Photo */}
              <div style={{ marginTop: 12 }} className="gc-card-soft">
                <div style={{ padding: 12 }}>
                  <div className="gc-label">PHOTO</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>
                    Upload uses Supabase bucket: <b>{PHOTO_BUCKET}</b>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ width: 260, height: 160, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--gc-border)', background: 'var(--gc-surface-2)' }}>
                      {recipe?.photo_url ? (
                        <img src={recipe.photo_url} alt="Recipe" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ padding: 12 }} className="gc-hint">
                          No photo.
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          uploadRecipePhoto(f).catch(() => {})
                          e.currentTarget.value = ''
                        }}
                      />
                      <div className="gc-hint" style={{ marginTop: 8 }}>
                        {uploading ? 'Uploading…' : 'PNG/JPG recommended.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subrecipe settings */}
              <div style={{ marginTop: 12 }} className="gc-card-soft">
                <div style={{ padding: 12 }}>
                  <div className="gc-label">SUBRECIPE SETTINGS</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>
                    If enabled, this recipe can be used inside other recipes.
                  </div>

                  <div className="gc-field-row" style={{ marginTop: 10 }}>
                    <div className="gc-col-4">
                      <div className="gc-field">
                        <div className="gc-label">IS SUBRECIPE</div>
                        <select className="gc-select" value={isSubRecipe ? 'yes' : 'no'} onChange={(e) => setIsSubRecipe(e.target.value === 'yes')}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                    </div>

                    <div className="gc-col-4">
                      <div className="gc-field">
                        <div className="gc-label">YIELD QTY</div>
                        <input className="gc-input" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="decimal" />
                      </div>
                    </div>

                    <div className="gc-col-4">
                      <div className="gc-field">
                        <div className="gc-label">YIELD UNIT</div>
                        <select className="gc-select" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value as any)}>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="pcs">pcs</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nutrition + Pricing */}
              <div style={{ marginTop: 12 }} className="gc-field-row">
                
                  {/* (Removed duplicate Nutrition/Portion block) */}
<div className="gc-col-6">
                  <div className="gc-card-soft" style={{ padding: 12, borderRadius: 16 }}>
                    <div className="gc-label">PRICING / PORTION</div>
                    <div className="gc-field-row" style={{ marginTop: 10 }}>
                      <div className="gc-col-4">
                        <div className="gc-field">
                          <div className="gc-label">CURRENCY</div>
                          <input className="gc-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                        </div>
                      </div>
                      <div className="gc-col-4">
                        <div className="gc-field">
                          <div className="gc-label">SELLING PRICE</div>
                          <input className="gc-input" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} inputMode="decimal" />
                        </div>
                      </div>
                      <div className="gc-col-4">
                        <div className="gc-field">
                          <div className="gc-label">TARGET FC%</div>
                          <input className="gc-input" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} inputMode="decimal" />
                        </div>
                      </div>
                    </div>

                    <div className="gc-hint" style={{ marginTop: 8 }}>
                      FC% = cost/portion ÷ selling price.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Add line */}
          {true && (
          <>
          <div style={{ marginTop: 14 }} className="gc-card">
            <div className="gc-card-head">
              <div className="gc-label">ADD LINE</div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Smart rule: edit <b>Gross</b> → yield auto. edit <b>Yield%</b> → clears gross override.
              </div>
            </div>

            <div className="gc-card-body">
              <div className="gc-field-row">
                <div className="gc-col-3">
                  <div className="gc-field">
                    <div className="gc-label">TYPE</div>
                    <select className="gc-select" value={addType} onChange={(e) => setAddType(e.target.value as LineType)}>
                      <option value="ingredient">Ingredient</option>
                      <option value="subrecipe">Subrecipe</option>
                      <option value="group">Group title</option>
                    </select>
                  </div>
                </div>

                {addType === 'group' ? (
                  <div className="gc-col-9">
                    <div className="gc-field">
                      <div className="gc-label">GROUP TITLE</div>
                      <input className="gc-input" value={addGroupTitle} onChange={(e) => setAddGroupTitle(e.target.value)} placeholder="e.g. Sauce / Toppings / Marinade" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="gc-col-3">
                      <div className="gc-field">
                        <div className="gc-label">SEARCH</div>
                        <input className="gc-input" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Type to filter…" />
                      </div>
                    </div>

                    <div className="gc-col-6">
                      <div className="gc-field">
                        <div className="gc-label">{addType === 'ingredient' ? 'INGREDIENT' : 'SUBRECIPE'}</div>
                        {addType === 'ingredient' ? (
                          <select className="gc-select" value={addIngredientId} onChange={(e) => setAddIngredientId(e.target.value)}>
                            <option value="">— Select —</option>
                            {filteredIngredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name || 'Unnamed'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select className="gc-select" value={addSubRecipeId} onChange={(e) => setAddSubRecipeId(e.target.value)}>
                            <option value="">— Select —</option>
                            {subRecipeOptions.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name || 'Untitled'}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {addType !== 'group' ? (
                  <>
                    <div className="gc-col-3">
                      <div className="gc-field">
                        <div className="gc-label">NET</div>
                        <input className="gc-input" value={addNetQty} onChange={(e) => setAddNetQty(e.target.value)} inputMode="decimal" />
                      </div>
                    </div>

                    <div className="gc-col-3">
                      <div className="gc-field">
                        <div className="gc-label">UNIT</div>
                        <input className="gc-input" value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="g / kg / ml / l / pcs" />
                      </div>
                    </div>

                    <div className="gc-col-3">
                      <div className="gc-field">
                        <div className="gc-label">YIELD %</div>
                        <input className="gc-input" value={addYield} onChange={(e) => setAddYield(e.target.value)} inputMode="decimal" />
                      </div>
                    </div>

                    <div className="gc-col-3">
                      <div className="gc-field">
                        <div className="gc-label">GROSS (optional)</div>
                        <input className="gc-input" value={addGross} onChange={(e) => setAddGross(e.target.value)} inputMode="decimal" placeholder="leave empty to auto" />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" type="button" onClick={addLineLocal}>
                  Add line
                </Button>
                <Button variant="ghost" type="button" onClick={saveLinesNow}>
                  Save lines
                </Button>
              </div>
            </div>
          </div>

          {/* Lines */}
          <div style={{ marginTop: 14 }} className="gc-card">
            <div className="gc-card-head">
              <div className="gc-label" id="sec-lines">LINES</div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Edit Net/Gross/Yield safely. Groups have no cost. Subrecipe cost expansion can be added later via SQL view.
              </div>
            </div>

            <div className="gc-card-body">
              {!visibleLines.length ? (
                <div className="gc-hint">No lines yet.</div>
              ) : (
                <div className="gc-kitopi-table-wrap">
                  <table className="gc-kitopi-table gc-kitopi-table-fixed">
                    <colgroup>
                      <col className="gc-col-item" />
                      <col className="gc-col-net" />
                      <col className="gc-col-unit" />
                      <col className="gc-col-gross" />
                      <col className="gc-col-yield" />
                      <col className="gc-col-note" />
                      {showCost ? <col className="gc-col-cost" /> : null}
<col className="gc-col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ width: '34%' }}>Ingredient</th>
                        <th style={{ width: '11%' }}>Net</th>
                        <th style={{ width: '9%' }}>Unit</th>
                        <th style={{ width: '11%' }}>Gross</th>
                        <th style={{ width: '10%' }}>Yield</th>
                        <th style={{ width: '12%' }}>Note</th>
                        {showCost ? <th style={{ width: '12%' }}>Cost</th> : null}
                        
                        <th style={{ width: '5%' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((l) => {
                        const c = lineComputed.get(l.id)
                        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                        const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

                        if (l.line_type === 'group') {
                          return (
                            <tr key={l.id} className={cx("gc-kitopi-group", flashLineId === l.id && "gc-flash-row")}>
                              <td colSpan={tableColSpan}>
                                <div className="gc-kitopi-group-row">
                                  <span className="gc-kitopi-group-title">{l.group_title || 'Group'}</span>
                                  <span className="gc-kitopi-group-actions">
<button className="gc-icon-btn" type="button" onClick={() => duplicateLineLocal(l.id)} title="Duplicate">⧉</button>
<button className="gc-icon-btn gc-icon-btn-danger" type="button" onClick={() => deleteLineLocal(l.id)} title="Delete">✕</button>
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        }

                        const title =
                          l.line_type === 'ingredient'
                            ? ing?.name || 'Ingredient'
                            : l.line_type === 'subrecipe'
                              ? sub?.name || 'Subrecipe'
                              : 'Line'

                        return (
                          <tr key={l.id}>
                            <td>
                              <div className="gc-kitopi-item">
                                <div className="gc-kitopi-item-select">
                                  {l.line_type === 'ingredient' ? (
                                    <select
                                      className="gc-select gc-select-compact"
                                      value={l.ingredient_id || ''}
                                      onChange={(e) => updateLine(l.id, { ingredient_id: e.target.value || null })}
                                    >
                                      <option value="">— Select ingredient —</option>
                                      {ingredients.map((i) => (
                                        <option key={i.id} value={i.id}>
                                          {i.name || 'Unnamed'}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <select
                                      className="gc-select gc-select-compact"
                                      value={l.sub_recipe_id || ''}
                                      onChange={(e) => updateLine(l.id, { sub_recipe_id: e.target.value || null })}
                                    >
                                      <option value="">— Select subrecipe —</option>
                                      {subRecipeOptions.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.name || 'Untitled'}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>                              </div>
                            </td>

                            <td>
                              <input
                                className="gc-input gc-input-compact"
                                value={String(toNum(l.qty, 0))}
                                onChange={(e) => onNetChange(l.id, e.target.value)}
                                inputMode="decimal"
                              />
                            </td>

                            <td>
                              <input
                                className="gc-input gc-input-compact"
                                value={l.unit || 'g'}
                                onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                              />
                            </td>

                            <td>
                              <input
                                className="gc-input gc-input-compact"
                                value={l.gross_qty_override != null ? String(l.gross_qty_override) : ''}
                                onChange={(e) => onGrossChange(l.id, e.target.value)}
                                inputMode="decimal"
                                placeholder={c ? fmtQty(c.gross) : ''}
                              />
                            </td>

                            <td>
                              <input
                                className="gc-input gc-input-compact"
                                value={String(clamp(toNum(l.yield_percent, 100), 0.0001, 100))}
                                onChange={(e) => onYieldChange(l.id, e.target.value)}
                                inputMode="decimal"
                              />
                              {!showCost ? (
                                <div className="gc-kitopi-muted">{c ? `${fmtQty(c.net)} → ${fmtQty(c.gross)} ${safeUnit(l.unit)}` : ''}</div>
                              ) : null}
                            </td>

                            <td>
                              <input
                                className="gc-input gc-input-compact"
                                value={l.notes ?? ''}
                                onChange={(e) => updateLine(l.id, { notes: e.target.value })}
                                placeholder="—"
                              />
                            </td>

                            {showCost ? (
                              <td>
                                <div className="gc-kitopi-money">{c ? fmtMoney(c.lineCost, cur) : '—'}</div>
                                <div className="gc-kitopi-muted">{c ? `${fmtQty(c.net)} → ${fmtQty(c.gross)} ${safeUnit(l.unit)}` : ''}</div>
                              </td>
                            ) : null}

                            <td>
                              <div className="gc-kitopi-row-actions">
<button className="gc-icon-btn" type="button" onClick={() => duplicateLineLocal(l.id)} title="Duplicate">⧉</button>
<button className="gc-icon-btn gc-icon-btn-danger" type="button" onClick={() => deleteLineLocal(l.id)} title="Delete">✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {/* Method steps */}
          {true && (
          <div style={{ marginTop: 14 }} className="gc-card">
            <div className="gc-card-head">
              <div className="gc-label" id="sec-method">METHOD</div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Add steps. You can upload a photo per step.
              </div>
            </div>

            <div className="gc-card-body">
              <div className="gc-field">
                <div className="gc-label">NEW STEP</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="gc-input" value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Write a step…" />
                  <button className="gc-btn gc-btn-primary" type="button" onClick={addStep}>
                    Add step
                  </button>
                </div>
              </div>

              {steps.length ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  {steps.map((s, idx) => (
                    <div key={idx} className="gc-card-soft" style={{ padding: 12, borderRadius: 16 }}>
                      <div className="gc-label">STEP {idx + 1}</div>
                      <textarea className="gc-textarea" value={s} onChange={(e) => updateStep(idx, e.target.value)} />

                      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={stepUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            uploadStepPhoto(f, idx).catch(() => {})
                            e.currentTarget.value = ''
                          }}
                        />
                        <button className="gc-btn gc-btn-danger" type="button" onClick={() => removeStep(idx)}>
                          Remove step
                        </button>
                      </div>

                      {stepPhotos[idx] ? (
                        <div style={{ marginTop: 10, width: 260, height: 160, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--gc-border)' }}>
                          <img src={stepPhotos[idx]} alt={`Step ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="gc-hint" style={{ marginTop: 10 }}>
                  No steps yet.
                </div>
              )}

              {/* Legacy method */}
              <div style={{ marginTop: 12 }} className="gc-card-soft">
                <div style={{ padding: 12 }}>
                  <div className="gc-label">LEGACY METHOD (OPTIONAL)</div>
                  <textarea className="gc-textarea" value={methodLegacy} onChange={(e) => setMethodLegacy(e.target.value)} placeholder="Optional long method text…" />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Cost panel */}
          {showCost && (
            <div style={{ marginTop: 14 }} className="gc-card">
              <div className="gc-card-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="gc-label">COST HISTORY</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>
                    Snapshots stored locally per recipe.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <CostTimeline points={costPoints} currency={currency} />
                  </div>
                  <div className="gc-hint" style={{ marginTop: 8 }}>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="gc-btn gc-btn-primary" type="button" onClick={addSnapshot}>
                    Add snapshot
                  </button>
                  <button className="gc-btn gc-btn-danger" type="button" onClick={clearSnapshots}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="gc-card-body">
                {!costPoints.length ? (
                  <div className="gc-hint">No snapshots yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {costPoints.map((p: any) => (
                      <div key={p.id} className="gc-card-soft" style={{ padding: 12, borderRadius: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{new Date(p.createdAt).toLocaleString()}</div>
                          <div className="gc-hint" style={{ marginTop: 6 }}>
                            Total: {fmtMoney(p.totalCost, p.currency)} • CPP: {fmtMoney(p.cpp, p.currency)} • Portions: {p.portions}
                          </div>
                        </div>

                        <button className="gc-btn gc-btn-danger" type="button" onClick={() => removeSnapshot(p.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PRINT ONLY */}
      <div className="gc-print-only">
        <div className="gc-print-page">
          <div className="gc-print-header">
            <div style={{ flex: 1 }}>
              <div className="gc-print-name">{(name || 'Untitled').trim()}</div>
              <div className="gc-print-sub">
                {(category || 'Uncategorized').trim()} • Portions: {Math.max(1, Math.floor(toNum(portions, 1)))} • Currency: {cur}
              </div>

              <div className="gc-print-kpis">
                <div className="gc-print-chip">Total: {fmtMoney(totals.totalCost, cur)}</div>
                <div className="gc-print-chip">CPP: {fmtMoney(totals.cpp, cur)}</div>
                <div className="gc-print-chip">FC%: {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                <div className="gc-print-chip">Margin: {fmtMoney(totals.margin, cur)}</div>
              </div>
            </div>

            <div className="gc-print-photo">
              {recipe?.photo_url ? <img src={recipe.photo_url} alt="Recipe" /> : null}
            </div>
          </div>

          {description ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Description</div>
              <div className="gc-print-text">{description}</div>
            </div>
          ) : null}

          <div className="gc-print-section">
            <div className="gc-print-title">Ingredients</div>
            <table className="gc-print-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Net</th>
                  <th>Yield%</th>
                  <th>Gross</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines
                  .filter((l) => l.line_type !== 'group')
                  .map((l) => {
                    const c = lineComputed.get(l.id)
                    const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                    const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null
                    const title =
                      l.line_type === 'ingredient'
                        ? ing?.name || 'Ingredient'
                        : l.line_type === 'subrecipe'
                          ? sub?.name || 'Subrecipe'
                          : 'Line'

                    return (
                      <tr key={l.id}>
                        <td>{title}</td>
                        <td>
                          {c ? `${fmtQty(c.net)} ${safeUnit(l.unit)}` : '—'}
                        </td>
                        <td>{c ? `${c.yieldPct.toFixed(2)}%` : '—'}</td>
                        <td>
                          {c ? `${fmtQty(c.gross)} ${safeUnit(l.unit)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {steps.length ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Method</div>
              <div className="gc-print-text">
                {steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
              </div>
            </div>
          ) : methodLegacy ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Method</div>
              <div className="gc-print-text">{methodLegacy}</div>
            </div>
          ) : null}
        </div>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}