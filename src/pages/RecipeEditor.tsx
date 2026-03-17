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
  code?: string | null
  code_category?: string | null
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
  qty: number
  unit: string
  yield_percent: number
  notes: string | null
  gross_qty_override: number | null
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
  return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

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
  const tableColSpan = 9 + (showCost ? 1 : 0)
  const k = useKitchen()
  const canEditCodes = k.isOwner
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const id = sp.get('id')

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

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }, [])

  // Meta fields
  const [code, setCode] = useState('')
  const [codeCategory, setCodeCategory] = useState('')
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

  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)

  const [density, setDensity] = useState<'comfort' | 'compact'>(() => {
    try {
      const v = localStorage.getItem('gc_density')
      if (v === 'compact' || v === 'comfort') return v
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
      localStorage.setItem('gc_v5_density', d === 'compact' ? 'dense' : 'comfortable')
    } catch {}
  }, [density])

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

  const [addType, setAddType] = useState<LineType>('ingredient')
  const [ingSearch, setIngSearch] = useState('')
  const [addNote, setAddNote] = useState('')

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
  const [addGross, setAddGross] = useState('')
  const [flashLineId, setFlashLineId] = useState<string | null>(null)

  useEffect(() => {
    if (!flashLineId) return
    const t = window.setTimeout(() => setFlashLineId(null), 700)
    return () => window.clearTimeout(t)
  }, [flashLineId])

  useEffect(() => {
    const raw = (addGross || '').trim()
    if (!raw) return
    const gross = toNum(raw, NaN as any)
    if (!Number.isFinite(gross) || gross <= 0) return
    const net = Math.max(0, toNum(addNetQty, 0))
    const y = clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100)
    setAddYield(String(Math.round(y * 100) / 100))
  }, [addGross, addNetQty])

  const [costPoints, setCostPoints] = useState(() => (id ? listCostPoints(id) : []))
  useEffect(() => {
    if (!id) return
    setCostPoints(listCostPoints(id))
  }, [id])

  const recipeRef = useRef<Recipe | null>(null)
  const linesRef = useRef<Line[]>([])
  useEffect(() => {
    recipeRef.current = recipe
  }, [recipe])
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  const deletedLineIdsRef = useRef<string[]>([])
  const isDraftLine = useCallback((l: Line) => {
    const lid = (l?.id || '') as string
    return lid.startsWith('tmp_')
  }, [])

  useEffect(() => {
    if (!id) return
    const cur = (lines || []) as Line[]
    const hasDraft = cur.some(isDraftLine) || (deletedLineIdsRef.current?.length || 0) > 0
    if (hasDraft) writeDraftLines(id, cur)
  }, [id, lines, isDraftLine])

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
        const draft = id ? readDraftLines(id) : []
        const mergedLines = draft?.length ? mergeDbAndDraft((l || []) as Line[], draft) : ((l || []) as Line[])
        setLines(mergedLines as Line[])

        const ing = await getIngredientsCached()
        if (!alive) return
        setIngredients((ing || []) as Ingredient[])

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

  const lineComputed = useMemo(() => {
    const res = new Map<
      string,
      { net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; warnings: string[] }
    >()

    for (const l of lines) {
      const warnings: string[] = []

      const net = Math.max(0, toNum(l.qty, 0))
      const yieldPct = clamp(toNum(l.yield_percent, 100), 0.0001, 100)

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
        warnings.push('Subrecipe cost not expanded')
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
  }, [lines, ingById])

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

  const [savingMeta, setSavingMeta] = useState(false)
  const metaSaveTimer = useRef<number | null>(null)

  const [savingLines, setSavingLines] = useState(false)
  const linesSaveTimer = useRef<number | null>(null)
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
      const delIds = deletedLineIdsRef.current.filter((x) => x && !x.startsWith('tmp_'))
      if (delIds.length) {
        deletedLineIdsRef.current = []
        const { error: delErr } = await supabase.from('recipe_lines').delete().in('id', delIds)
        if (delErr) throw delErr
      }

      const cur = ((override ?? linesRef.current) || []) as Line[]
      const drafts = cur.filter(isDraftLine)
      const persisted = cur.filter((l) => !isDraftLine(l))
      const needsReload = drafts.length > 0 || delIds.length > 0

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
        clearDraftLines(rid)
      }

      autosave.setSaved()
      return true
    } catch (e: any) {
      try {
        const cur = ((override ?? linesRef.current) || []) as Line[]
        writeDraftLines(rid, cur)
      } catch {}
      const msg = e?.message || 'Failed to save lines.'
      autosave.setError(msg)
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
      }

      const next = [...cur, copy].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
      linesRef.current = next
      setLinesSafe(next)
      saveLinesNow(next).then(() => {}).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )

  const deleteLineLocal = useCallback(
    (lineId: string) => {
      if (!lineId) return

      const cur = (linesRef.current || []) as Line[]
      const next = cur.filter((x) => x.id !== lineId)

      if (!lineId.startsWith('tmp_') && !deletedLineIdsRef.current.includes(lineId)) {
        deletedLineIdsRef.current.push(lineId)
      }

      linesRef.current = next
      setLinesSafe(next)

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
    code, codeCategory, name, category, portions, description, steps, stepPhotos,
    methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC,
    isSubRecipe, yieldQty, yieldUnit,
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

  const metaHydratedRef = useRef(false)
  useEffect(() => {
    if (!recipe) return
    if (!metaHydratedRef.current) {
      metaHydratedRef.current = true
      return
    }
    scheduleMetaSave()
  }, [
    code, codeCategory, name, category, portions, description, steps, stepPhotos,
    methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC,
    isSubRecipe, yieldQty, yieldUnit,
  ])

  const addLineLocal = useCallback(async () => {
    if (!id) return
    const rid = id

    const basePos = (linesRef.current?.length || 0) + 1
    const yRaw = clamp(toNum(addYield, 100), 0.0001, 100)
    const net = Math.max(0, toNum(addNetQty, 0))
    const gross = addGross.trim() === '' ? null : Math.max(0, toNum(addGross, 0))

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
        notes: addNote || null,
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
        setAddNote('')
        setAddNetQty('1')
        setAddGross('')
        setAddYield('100')
        setAddIngredientId('')
        setIngSearch('')
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
        notes: addNote || null,
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
      if (ok) {
        setAddNote('')
        setAddNetQty('1')
        setAddGross('')
        setAddYield('100')
        setAddSubRecipeId('')
        setIngSearch('')
      }
      if (!ok) scheduleLinesSave()
      return
    }

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
    if (ok) {
      setAddGroupTitle('')
    }
    if (!ok) scheduleLinesSave()
  }, [
    id, addType, addIngredientId, addSubRecipeId, addGroupTitle, addNetQty, addUnit,
    addYield, addGross, addNote, setLinesSafe, saveLinesNow, scheduleLinesSave, showToast, k.kitchenId,
  ])

  const onNetChange = useCallback(
    (lineId: string, value: string) => {
      const net = Math.max(0, toNum(value, 0))
      const line = linesRef.current.find((x) => x.id === lineId)
      if (!line) return

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
      updateLine(lineId, { yield_percent: y, gross_qty_override: null })
    },
    [updateLine]
  )

  const onNoteChange = useCallback(
    (lineId: string, value: string) => {
      updateLine(lineId, { notes: value || null })
    },
    [updateLine]
  )

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

  const addStep = useCallback(() => {
    const s = (newStep || '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
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

  const printNow = useCallback(() => {
    if (!id) return
    const url = `#/print?id=${encodeURIComponent(id)}&autoprint=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [id])

  const exportExcel = useCallback(async () => {
    try {
      const meta = {
        id: id || undefined,
        code: code || null,
        kitchen_id: (recipeRef.current as any)?.kitchen_id ?? null,
        name: name || 'Recipe',
        category: category || '',
        portions: Math.max(1, Math.floor(Number(portions || 1))),
        yield_qty: yieldQty ? Number(yieldQty) : null,
        yield_unit: yieldUnit || null,
        currency: currency || 'USD',
        selling_price: sellingPrice ? Number(sellingPrice) : null,
        target_food_cost_pct: targetFC ? Number(targetFC) : null,
        photo_url: recipe?.photo_url || null,
        step_photos: stepPhotos,
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
            code:
              l.line_type === 'ingredient'
                ? (l.ingredient_id ? (ingById.get(l.ingredient_id) as any)?.code : null) || ''
                : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.code || ''),
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
    id, name, category, portions, yieldQty, yieldUnit, currency, sellingPrice, targetFC,
    description, steps, stepPhotos, calories, protein, carbs, fat, lines, lineComputed,
    ingById, allRecipes, totals, showToast,
  ])

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
    <div className="gc-recipe-pro-head-left">
      <NavLink to="/recipes" className="gc-btn gc-btn-ghost">
        ← Back
      </NavLink>

      <div className="gc-recipe-pro-titleWrap">
        <div className="gc-recipe-pro-titleIcon" aria-hidden="true">
          {isSubRecipe ? '🧪' : '🍽'}
        </div>

        <div className="gc-recipe-pro-titleBlock">
          <div className="gc-label">RECIPE EDITOR</div>
          <div className="gc-recipe-pro-title">{(name || 'Untitled').trim()}</div>

          <div className="gc-recipe-pro-subline">
            <span className="gc-recipe-pro-statusDot" aria-hidden="true" />
            <span className="gc-hint" style={{ fontWeight: 800 }}>
              {autosave.status === 'saving'
                ? 'Saving…'
                : autosave.status === 'error'
                ? (autosave.message || 'Save issue. Retrying…')
                : autosave.lastSavedAt
                ? `Saved ${Math.max(1, Math.round((Date.now() - autosave.lastSavedAt) / 1000))}s ago ✓`
                : 'Auto-save ready.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  const headerRight = (
    <div className="gc-tabs gc-recipe-pro-head-right">
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

  const ScreenCss = (
    <style>{`
      .gc-recipe-pro {
        --primary: #2E7D78;
        --primary-light: #E8F3F2;
        --primary-dark: #1E5A56;
        --secondary: #C17B4A;
        --accent: #D94E4E;
        --text: #1E2A3A;
        --text-light: #64748B;
        --bg-gradient: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        --card-shadow: 0 20px 40px -12px rgba(0,32,64,0.12), 0 8px 24px -8px rgba(0,0,0,0.08);
        --hover-shadow: 0 24px 48px -12px rgba(46,125,120,0.18);
        position: relative;
      }

      .gc-recipe-pro .gc-card-head {
        align-items: center;
        padding: 18px 24px;
        border-radius: 28px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(46,125,120,0.15);
        box-shadow: 0 12px 28px -8px rgba(0,32,64,0.08), inset 0 1px 0 rgba(255,255,255,0.9);
      }

      .gc-recipe-pro-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
      }

      .gc-recipe-pro-head-left {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 320px;
      }

      .gc-recipe-pro-titleWrap {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }

      .gc-recipe-pro-titleIcon {
        width: 60px;
        height: 60px;
        flex: 0 0 60px;
        border-radius: 20px;
        display: grid;
        place-items: center;
        font-size: 28px;
        background: linear-gradient(145deg, var(--primary-light), #ffffff);
        border: 2px solid rgba(46,125,120,0.2);
        box-shadow: 0 8px 16px -4px rgba(46,125,120,0.15);
        transition: all 0.2s ease;
      }

      .gc-recipe-pro-titleIcon:hover {
        transform: scale(1.02);
        border-color: var(--primary);
        box-shadow: 0 12px 24px -6px rgba(46,125,120,0.25);
      }

      .gc-recipe-pro-titleBlock {
        min-width: 0;
      }

      .gc-recipe-pro-title {
        font-weight: 900;
        font-size: 1.5rem;
        line-height: 1.2;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, var(--primary-dark), var(--primary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-top: 4px;
        word-break: break-word;
      }

      .gc-recipe-pro-subline {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .gc-recipe-pro-statusDot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(135deg, #4CAF50, #2E7D78);
        box-shadow: 0 0 0 4px rgba(46,125,120,0.15);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.1); }
      }

      .gc-recipe-pro-head-right {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: flex-end;
        flex: 1 1 auto;
        min-width: 320px;
        overflow-x: auto;
        padding-bottom: 4px;
        white-space: nowrap;
        scrollbar-width: thin;
      }

      .gc-recipe-pro .gc-btn-soft {
        padding: 10px 18px;
        border-radius: 40px;
        border: 1px solid rgba(46,125,120,0.15);
        background: rgba(255,255,255,0.85);
        backdrop-filter: blur(4px);
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--text);
        transition: all 0.15s ease;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      }

      .gc-recipe-pro .gc-btn-soft:hover {
        background: white;
        border-color: var(--primary);
        box-shadow: 0 8px 16px -6px rgba(46,125,120,0.2);
        transform: translateY(-1px);
      }

      .gc-recipe-pro .gc-btn-soft.is-active {
        background: var(--primary-light);
        border-color: var(--primary);
        color: var(--primary-dark);
        font-weight: 700;
        box-shadow: inset 0 2px 4px rgba(46,125,120,0.05), 0 4px 12px rgba(46,125,120,0.15);
      }

      .gc-recipe-pro .gc-card,
      .gc-recipe-pro .gc-card-soft {
        border-radius: 28px;
        border: 1px solid rgba(46,125,120,0.1);
        background: white;
        box-shadow: var(--card-shadow);
        transition: all 0.2s ease;
        margin-bottom: 20px;
        overflow: hidden;
      }

      .gc-recipe-pro .gc-card:hover,
      .gc-recipe-pro .gc-card-soft:hover {
        box-shadow: var(--hover-shadow);
        border-color: rgba(46,125,120,0.2);
      }

      .gc-recipe-pro .gc-card-head {
        padding: 20px 24px;
        border-bottom: 1px solid rgba(46,125,120,0.1);
        background: linear-gradient(to right, rgba(46,125,120,0.02), transparent);
      }

      .gc-recipe-pro .gc-card-body {
        padding: 24px;
      }

      .gc-recipe-pro .gc-kpi-card {
        border-radius: 24px;
        border: 1px solid rgba(46,125,120,0.15);
        background: linear-gradient(145deg, white, #fafcfc);
        box-shadow: 0 8px 20px -8px rgba(0,0,0,0.08);
        padding: 20px 18px 16px;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }

      .gc-recipe-pro .gc-kpi-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, var(--primary), var(--secondary));
        opacity: 0.6;
      }

      .gc-recipe-pro .gc-kpi-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 20px 32px -12px rgba(46,125,120,0.25);
      }

      .gc-recipe-pro .gc-kpi-label {
        font-size: 0.8rem;
        letter-spacing: 0.1em;
        font-weight: 800;
        color: var(--text-light);
        margin-bottom: 12px;
        text-transform: uppercase;
      }

      .gc-recipe-pro .gc-kpi-value {
        font-size: 2rem;
        line-height: 1.2;
        font-weight: 900;
        color: var(--primary-dark);
        letter-spacing: -0.03em;
      }

      .gc-recipe-pro .gc-grid-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
      }

      .gc-recipe-pro .gc-pricing-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 16px;
      }

      .gc-recipe-pro .gc-pricing-field {
        border-radius: 20px;
        border: 1px solid rgba(46,125,120,0.12);
        background: rgba(255,255,255,0.7);
        backdrop-filter: blur(4px);
        padding: 16px;
        transition: all 0.15s ease;
      }

      .gc-pricing-field:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(46,125,120,0.1);
      }

      .gc-recipe-pro .gc-warning-banner {
        margin-top: 16px;
        padding: 16px 20px;
        border-radius: 20px;
        border: 1px solid rgba(217,78,78,0.2);
        background: rgba(217,78,78,0.03);
        display: flex;
        align-items: flex-start;
        gap: 14px;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .gc-recipe-pro .gc-warning-icon {
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 16px;
        background: rgba(217,78,78,0.1);
        border: 1px solid rgba(217,78,78,0.2);
      }

      .gc-warning-title {
        font-size: 0.8rem;
        letter-spacing: 0.1em;
        font-weight: 900;
        color: var(--accent);
        margin-bottom: 6px;
      }

      .gc-recipe-pro .gc-kitopi-table-wrap {
        overflow: auto;
        border-radius: 24px;
        border: 1px solid rgba(46,125,120,0.1);
        background: white;
        box-shadow: 0 8px 20px -8px rgba(0,0,0,0.05);
      }

      .gc-recipe-pro .gc-kitopi-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      .gc-recipe-pro .gc-kitopi-table thead th {
        background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
        border-bottom: 2px solid rgba(46,125,120,0.15);
        font-size: 0.8rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-light);
        padding: 16px 12px;
      }

      .gc-recipe-pro .gc-kitopi-table tbody td {
        padding: 14px 12px;
        border-bottom: 1px solid rgba(46,125,120,0.08);
        color: var(--text);
        transition: background 0.15s ease;
      }

      .gc-recipe-pro .gc-kitopi-table tbody tr:hover td {
        background: rgba(46,125,120,0.03);
      }

      .gc-recipe-pro .gc-kitopi-group {
        background: linear-gradient(to right, rgba(46,125,120,0.04), rgba(193,123,74,0.04)) !important;
        font-weight: 800;
      }

      .gc-kitopi-group-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
      }

      .gc-kitopi-group-title {
        font-size: 1rem;
        color: var(--primary-dark);
        font-weight: 900;
        letter-spacing: -0.02em;
      }

      .gc-kitopi-group-actions {
        display: flex;
        gap: 10px;
      }

      .gc-recipe-pro .gc-icon-btn {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        border: 1px solid rgba(46,125,120,0.15);
        background: white;
        color: var(--text-light);
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .gc-icon-btn:hover {
        background: var(--primary-light);
        border-color: var(--primary);
        color: var(--primary-dark);
        transform: scale(1.05);
      }

      .gc-icon-btn-danger:hover {
        background: rgba(217,78,78,0.1);
        border-color: var(--accent);
        color: var(--accent);
      }

      .gc-recipe-pro .gc-input,
      .gc-recipe-pro .gc-select,
      .gc-recipe-pro .gc-textarea {
        border-radius: 16px;
        border: 1.5px solid rgba(46,125,120,0.12);
        background: white;
        padding: 12px 16px;
        font-size: 0.95rem;
        transition: all 0.15s ease;
        width: 100%;
        color: var(--text);
      }

      .gc-recipe-pro .gc-input:focus,
      .gc-recipe-pro .gc-select:focus,
      .gc-recipe-pro .gc-textarea:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(46,125,120,0.1);
      }

      .gc-recipe-pro .gc-input-compact {
        padding: 8px 10px;
        font-size: 0.9rem;
        min-width: 80px;
      }

      .gc-recipe-pro .gc-section {
        margin-bottom: 24px;
      }

      .gc-recipe-pro .gc-label {
        font-size: 0.75rem;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-light);
        margin-bottom: 8px;
      }

      .gc-recipe-pro .gc-hint {
        font-size: 0.85rem;
        color: var(--text-light);
        line-height: 1.5;
      }

      .gc-recipe-pro .gc-highlight-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }

      /* أنماط لعرض النص بشكل صحيح */
      .gc-recipe-pro .gc-code-display {
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--primary-dark);
        background: rgba(46,125,120,0.05);
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
        white-space: nowrap;
      }

      .gc-recipe-pro .gc-name-with-note {
        display: flex;
        flex-direction: column;
      }

      .gc-recipe-pro .gc-name-main {
        font-weight: 500;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gc-recipe-pro .gc-name-note {
        font-size: 0.75rem;
        color: var(--text-light);
        margin-top: 2px;
        font-style: italic;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gc-recipe-pro .gc-unit-display {
        font-size: 0.8rem;
        color: var(--text-light);
        background: var(--bg-gradient);
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
        font-weight: 500;
        white-space: nowrap;
      }

      /* تحسين ظهور الـ selects */
      .gc-recipe-pro .gc-select {
        appearance: none;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232E7D78' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 16px;
        padding-right: 40px;
        min-width: 200px;
        color: var(--text);
        background-color: white;
      }

      .gc-recipe-pro .gc-select option {
        color: var(--text);
        background: white;
        padding: 12px;
        font-size: 0.95rem;
      }

      /* تحسين شبكة ADD LINE */
      .gc-recipe-pro .gc-add-line-grid {
        display: grid;
        grid-template-columns: 2fr 2fr 3fr 1fr 1fr 1.5fr 2fr 2fr;
        gap: 12px;
        margin-bottom: 16px;
        align-items: end;
      }

      .gc-recipe-pro .gc-add-line-field {
        display: flex;
        flex-direction: column;
      }

      .gc-recipe-pro .gc-add-line-field .gc-label {
        margin-bottom: 6px;
        font-size: 0.7rem;
      }

      .gc-recipe-pro .gc-gross-hint {
        font-size: 0.7rem;
        color: var(--text-light);
        margin-top: 4px;
        font-style: italic;
        white-space: nowrap;
      }

      .gc-recipe-pro .gc-add-line-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
      }

      @media (max-width: 1200px) {
        .gc-recipe-pro .gc-add-line-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      @media (max-width: 1024px) {
        .gc-recipe-pro .gc-grid-4 {
          grid-template-columns: repeat(2, 1fr);
        }
        
        .gc-recipe-pro .gc-pricing-grid {
          grid-template-columns: 1fr;
        }

        .gc-recipe-pro .gc-add-line-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 768px) {
        .gc-recipe-pro-head-left {
          min-width: 100%;
        }
        
        .gc-recipe-pro-titleIcon {
          width: 48px;
          height: 48px;
          flex-basis: 48px;
          font-size: 22px;
        }
        
        .gc-recipe-pro-title {
          font-size: 1.2rem;
        }
        
        .gc-recipe-pro .gc-card-head {
          padding: 14px 18px;
        }
        
        .gc-recipe-pro .gc-card-body {
          padding: 18px;
        }

        .gc-recipe-pro .gc-add-line-grid {
          grid-template-columns: 1fr;
        }
      }

      .gc-flash-row {
        animation: flash 0.5s ease;
      }

      @keyframes flash {
        0%, 100% { background: transparent; }
        50% { background: rgba(46,125,120,0.1); }
      }

      .gc-btn-hero {
        background: linear-gradient(135deg, var(--primary), var(--primary-dark)) !important;
        color: white !important;
        border: none !important;
        padding: 14px 28px !important;
        border-radius: 40px !important;
        font-weight: 800 !important;
        letter-spacing: 0.02em !important;
        box-shadow: 0 12px 24px -8px rgba(46,125,120,0.4) !important;
        transition: all 0.2s ease !important;
      }

      .gc-btn-hero:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 20px 32px -8px rgba(46,125,120,0.5) !important;
      }

      .gc-tabs {
        display: flex;
        gap: 6px;
        background: rgba(46,125,120,0.04);
        padding: 6px;
        border-radius: 60px;
        backdrop-filter: blur(4px);
      }

      .gc-chip {
        padding: 8px 16px;
        border-radius: 40px;
        font-size: 0.85rem;
        font-weight: 700;
        background: white;
        border: 1px solid rgba(46,125,120,0.1);
        color: var(--text);
      }

      .gc-chip-active {
        background: var(--primary);
        color: white;
        border-color: var(--primary-dark);
      }
    `}</style>
  )

  const PrintCss = (
    <style>{`
      @media print {
        .gc-shell, .gc-side, .gc-topbar-card, .gc-screen-only, nav, header, aside {
          display: none !important;
        }
        .gc-print-only {
          display: block !important;
        }
        body {
          background: white !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        .gc-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          box-sizing: border-box;
          font-family: -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
          color: #1E2A3A;
          background: white;
        }

        .gc-print-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15mm;
          border-bottom: 2px solid #2E7D78;
          padding-bottom: 8mm;
          margin-bottom: 8mm;
        }

        .gc-print-name {
          font-size: 28pt;
          font-weight: 900;
          color: #1E5A56;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .gc-print-sub {
          font-size: 12pt;
          color: #64748B;
          margin-top: 4mm;
        }

        .gc-print-photo {
          width: 70mm;
          height: 50mm;
          border: 2px solid #2E7D78;
          border-radius: 8mm;
          overflow: hidden;
          background: #f8fafc;
          box-shadow: 0 8px 16px rgba(0,0,0,0.05);
        }

        .gc-print-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .gc-print-section {
          margin-top: 8mm;
        }

        .gc-print-title {
          font-size: 14pt;
          font-weight: 900;
          color: #2E7D78;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4mm;
          border-bottom: 1px solid rgba(46,125,120,0.2);
          padding-bottom: 2mm;
        }

        .gc-print-text {
          font-size: 11pt;
          line-height: 1.6;
          color: #1E2A3A;
          white-space: pre-wrap;
        }

        .gc-print-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
          font-size: 10pt;
        }

        .gc-print-table th {
          text-align: left;
          padding: 3mm 2mm;
          background: #f8fafc;
          font-weight: 800;
          color: #2E7D78;
          border-bottom: 2px solid #2E7D78;
        }

        .gc-print-table td {
          padding: 2.5mm 2mm;
          border-bottom: 1px solid rgba(46,125,120,0.15);
        }

        .gc-print-kpis {
          display: flex;
          gap: 4mm;
          flex-wrap: wrap;
          margin-top: 4mm;
        }

        .gc-print-chip {
          border: 1px solid #2E7D78;
          border-radius: 40px;
          padding: 2mm 4mm;
          font-size: 10pt;
          font-weight: 700;
          color: #2E7D78;
          background: white;
        }
      }

      .gc-print-only {
        display: none;
      }
    `}</style>
  )

  return (
    <>
      {PrintCss}
      {ScreenCss}

      <div className="gc-card gc-screen-only gc-recipe-pro">
        <div className="gc-card-head gc-recipe-pro-head">
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
              <div style={{ padding: 14 }} className="gc-highlight-head">
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

          {showCost && (
            <div className="gc-section gc-card-soft" style={{ padding: 14, borderRadius: 18 }}>
              <div className="gc-highlight-head">
                <div>
                  <div className="gc-label" id="sec-cost">KPI</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>Live recipe performance overview.</div>
                </div>
                <div className="gc-hint" style={{ fontWeight: 800 }}>Currency: {cur}</div>
              </div>

              <div className="gc-grid-4" style={{ marginTop: 12 }}>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">TOTAL COST</div>
                  <div className="gc-kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                </div>
                <div className="gc-kpi-card">
                  <div className="gc-kpi-label">COST / PORTION</div>
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
                <div className="gc-warning-banner">
                  <div className="gc-warning-icon" aria-hidden="true">⚠</div>
                  <div>
                    <div className="gc-warning-title">PRICING WARNING</div>
                    <div style={{ fontWeight: 900, color: 'var(--gc-warn)' }}>{totals.warnings[0]}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {showCost && (
            <div className="gc-section gc-section-alt gc-card-soft">
              <div style={{ padding: 14 }}>
                <div className="gc-highlight-head">
                  <div>
                    <div className="gc-label">PRICING / PORTION</div>
                    <div className="gc-hint" style={{ marginTop: 6 }}>Set commercial values for management view and targets.</div>
                  </div>
                  <div className="gc-hint" style={{ fontWeight: 800 }}>FC% = cost / portion ÷ selling price</div>
                </div>

                <div className="gc-pricing-grid">
                  <div className="gc-pricing-field">
                    <div className="gc-label">CURRENCY</div>
                    <input className="gc-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                  </div>

                  <div className="gc-pricing-field">
                    <div className="gc-label">SELLING PRICE</div>
                    <input className="gc-input" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} inputMode="decimal" />
                  </div>

                  <div className="gc-pricing-field">
                    <div className="gc-label">TARGET FC%</div>
                    <input className="gc-input" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} inputMode="decimal" />
                  </div>
                </div>
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

          {true && (
            <div id="sec-basics" className="gc-section gc-card">
              <div className="gc-card-head">
                <div className="gc-label">META</div>
                <div className="gc-hint" style={{ marginTop: 6 }}>
                  Labels are always above inputs. Auto-save is enabled.
                </div>
              </div>

              <div className="gc-card-body">
                <div className="gc-field-row">
                  <div className="gc-col-6">
                    <div className="gc-field">
                      <div className="gc-label">CODE</div>
                      <input className={`gc-input ${!canEditCodes ? "opacity-60 cursor-not-allowed" : ""}`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Leave empty to auto-generate" disabled={!canEditCodes} />
                      <div className="mt-2">
                        <div className="gc-label">CODE CATEGORY</div>
                        <input className={`gc-input ${!canEditCodes ? "opacity-60 cursor-not-allowed" : ""}`} value={codeCategory} onChange={(e) => setCodeCategory(e.target.value.toUpperCase())} placeholder="e.g. SAUCE / SAND / GEN (optional)" disabled={!canEditCodes} />
                        <div className="mt-1 text-[11px] text-neutral-500">Optional (max 6). If empty, DB uses Category.</div>
                        {!canEditCodes && <div className="mt-1 text-[11px] text-amber-700">Code fields are Owner-only.</div>}
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

                <div style={{ marginTop: 12 }} className="gc-field-row">
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
                  <div className="gc-add-line-grid">
                    <div className="gc-add-line-field">
                      <div className="gc-label">TYPE</div>
                      <select className="gc-select" value={addType} onChange={(e) => setAddType(e.target.value as LineType)}>
                        <option value="ingredient">Ingredient</option>
                        <option value="subrecipe">Subrecipe</option>
                        <option value="group">Group title</option>
                      </select>
                    </div>

                    {addType !== 'group' && (
                      <>
                        <div className="gc-add-line-field">
                          <div className="gc-label">SEARCH</div>
                          <input className="gc-input" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Type to filter…" />
                        </div>

                        <div className="gc-add-line-field">
                          <div className="gc-label">{addType === 'ingredient' ? 'INGREDIENT' : 'SUBRECIPE'}</div>
                          {addType === 'ingredient' ? (
                            <select className="gc-select" value={addIngredientId} onChange={(e) => setAddIngredientId(e.target.value)}>
                              <option value="">— Select ingredient —</option>
                              {filteredIngredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name || 'Unnamed'} ({i.code || '—'})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select className="gc-select" value={addSubRecipeId} onChange={(e) => setAddSubRecipeId(e.target.value)}>
                              <option value="">— Select subrecipe —</option>
                              {subRecipeOptions.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name || 'Untitled'} ({r.code || '—'})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </>
                    )}

                    {addType === 'group' && (
                      <div className="gc-add-line-field" style={{ gridColumn: 'span 2' }}>
                        <div className="gc-label">GROUP TITLE</div>
                        <input className="gc-input" value={addGroupTitle} onChange={(e) => setAddGroupTitle(e.target.value)} placeholder="e.g. Sauce / Toppings / Marinade" />
                      </div>
                    )}
                  </div>

                  {addType !== 'group' && (
                    <>
                      <div className="gc-add-line-grid" style={{ marginTop: 12 }}>
                        <div className="gc-add-line-field">
                          <div className="gc-label">NET</div>
                          <input className="gc-input" value={addNetQty} onChange={(e) => setAddNetQty(e.target.value)} inputMode="decimal" />
                        </div>

                        <div className="gc-add-line-field">
                          <div className="gc-label">UNIT</div>
                          <input className="gc-input" value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="g / kg / ml / l / pcs" />
                        </div>

                        <div className="gc-add-line-field">
                          <div className="gc-label">YIELD %</div>
                          <input className="gc-input" value={addYield} onChange={(e) => setAddYield(e.target.value)} inputMode="decimal" />
                        </div>

                        <div className="gc-add-line-field">
                          <div className="gc-label">GROSS</div>
                          <input className="gc-input" value={addGross} onChange={(e) => setAddGross(e.target.value)} inputMode="decimal" placeholder="optional" />
                          <div className="gc-gross-hint">leave empty to auto</div>
                        </div>

                        <div className="gc-add-line-field" style={{ gridColumn: 'span 2' }}>
                          <div className="gc-label">NOTE</div>
                          <input className="gc-input" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="e.g. Chopped, Powder, Fresh..." />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="gc-add-line-actions">
                    <Button variant="primary" type="button" onClick={addLineLocal}>
                      Add line
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => { saveLinesNow().catch(() => {}) }}>
                      Save lines
                    </Button>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }} className="gc-card">
                <div className="gc-card-head">
                  <div className="gc-label" id="sec-lines">LINES</div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>
                    Edit Net/Gross/Yield safely. Groups have no cost.
                  </div>
                </div>

                <div className="gc-card-body">
                  {!visibleLines.length ? (
                    <div className="gc-hint">No lines yet.</div>
                  ) : (
                    <div className="gc-kitopi-table-wrap">
                      <table className="gc-kitopi-table gc-kitopi-table-fixed">
                        <colgroup>
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '25%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '10%' }} />
                          {showCost ? <col style={{ width: '12%' }} /> : null}
                          <col style={{ width: '5%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>CODE</th>
                            <th>INGREDIENT</th>
                            <th>NET</th>
                            <th>UNIT</th>
                            <th>GROSS</th>
                            <th>YIELD</th>
                            {showCost ? <th>COST</th> : null}
                            <th></th>
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

                            return (
                              <tr key={l.id}>
                                <td>
                                  <span className="gc-code-display">
                                    {l.line_type === 'ingredient'
                                      ? (ing?.code || '—')
                                      : (sub?.code || '—')}
                                  </span>
                                </td>

                                <td>
                                  <div className="gc-name-with-note">
                                    <span className="gc-name-main">
                                      {l.line_type === 'ingredient'
                                        ? (ing?.name || 'Ingredient')
                                        : (sub?.name || 'Subrecipe')}
                                    </span>
                                    {l.notes && (
                                      <span className="gc-name-note">{l.notes}</span>
                                    )}
                                  </div>
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
                                  <span className="gc-unit-display">{l.unit || 'g'}</span>
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
                                    value={String(
                                      Math.round(clamp(toNum(l.yield_percent, 100), 0.0001, 100) * 100) / 100
                                    )}
                                    onChange={(e) => onYieldChange(l.id, e.target.value)}
                                    inputMode="decimal"
                                  />
                                </td>

                                {showCost ? (
                                  <td>
                                    <div className="gc-kitopi-money">{c ? fmtMoney(c.lineCost, cur) : '—'}</div>
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

                <div style={{ marginTop: 12 }} className="gc-card-soft">
                  <div style={{ padding: 12 }}>
                    <div className="gc-label">LEGACY METHOD (OPTIONAL)</div>
                    <textarea className="gc-textarea" value={methodLegacy} onChange={(e) => setMethodLegacy(e.target.value)} placeholder="Optional long method text…" />
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  <th>Code</th>
                  <th>Ingredient</th>
                  <th>Net</th>
                  <th>Unit</th>
                  <th>Gross</th>
                  <th>Yield%</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines
                  .filter((l) => l.line_type !== 'group')
                  .map((l) => {
                    const c = lineComputed.get(l.id)
                    const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                    const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null
                    const code = l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')
                    const name = l.line_type === 'ingredient' ? (ing?.name || 'Ingredient') : (sub?.name || 'Subrecipe')

                    return (
                      <tr key={l.id}>
                        <td><span className="gc-code-display">{code}</span></td>
                        <td>
                          <div>
                            <div>{name}</div>
                            {l.notes && <div style={{ fontSize: '8pt', color: '#64748B' }}>{l.notes}</div>}
                          </div>
                        </td>
                        <td>{c ? fmtQty(c.net) : '—'}</td>
                        <td>{l.unit || 'g'}</td>
                        <td>{c ? fmtQty(c.gross) : '—'}</td>
                        <td>{c ? `${c.yieldPct.toFixed(1)}%` : '—'}</td>
                        <td>{l.notes || '—'}</td>
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
