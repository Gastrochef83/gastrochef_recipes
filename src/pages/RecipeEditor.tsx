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
  if (Math.abs(v) >= 1000) return v.toFixed(0)
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
  } catch {}
}

function clearDraftLines(rid: string) {
  try {
    localStorage.removeItem(draftKey(rid))
  } catch {}
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
    const ids = ['sec-basics', 'sec-method', 'sec-nutrition', 'sec-lines', 'sec-print', 'sec-cook', 'sec-cost']
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
      <div className="cs-loading">
        <div className="cs-loading-content">
          <div className="cs-loading-icon">
            <svg viewBox="0 0 24 24" fill="none" className="cs-spinner">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="cs-loading-text">Loading Recipe Editor</div>
          <div className="cs-loading-hint">Preparing your culinary workspace...</div>
        </div>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="cs-error">
        <div className="cs-error-icon">⚠️</div>
        <div className="cs-error-title">Recipe Not Found</div>
        <div className="cs-error-text">Missing recipe ID. Please select a valid recipe.</div>
      </div>
    )
  }

  const ScreenCss = (
    <style>{`
      /* ===== Culinary Studio Design System ===== */
      :root {
        --cs-primary: #B8860B;
        --cs-primary-light: #FFD700;
        --cs-primary-dark: #8B6914;
        --cs-secondary: #8B4513;
        --cs-secondary-light: #CD853F;
        --cs-accent: #C41E3A;
        --cs-success: #228B22;
        --cs-warning: #FF8C00;
        --cs-text: #1A1A2E;
        --cs-text-muted: #5C5C7A;
        --cs-text-light: #8B8BA7;
        --cs-bg: #F5F0E8;
        --cs-bg-card: #FFFFFF;
        --cs-bg-elevated: #FDFCFA;
        --cs-border: #E8E0D5;
        --cs-border-light: #F0EBE3;
        --cs-shadow: 0 8px 32px rgba(139, 69, 19, 0.08);
        --cs-shadow-lg: 0 16px 48px rgba(139, 69, 19, 0.12);
        --cs-shadow-xl: 0 24px 64px rgba(139, 69, 19, 0.16);
        --cs-radius: 20px;
        --cs-radius-lg: 28px;
        --cs-radius-full: 9999px;
        --cs-transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        --cs-gold-gradient: linear-gradient(135deg, #B8860B 0%, #FFD700 50%, #B8860B 100%);
        --cs-copper-gradient: linear-gradient(135deg, #8B4513 0%, #CD853F 50%, #8B4513 100%);
        --cs-warm-gradient: linear-gradient(180deg, #FDFCFA 0%, #F5F0E8 100%);
      }

      /* ===== Base Layout ===== */
      .cs-container {
        min-height: 100vh;
        background: var(--cs-bg);
        padding: 24px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      /* ===== Loading State ===== */
      .cs-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--cs-bg);
      }

      .cs-loading-content {
        text-align: center;
      }

      .cs-loading-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
      }

      .cs-spinner {
        width: 100%;
        height: 100%;
        color: var(--cs-primary);
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .cs-loading-text {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--cs-text);
        margin-bottom: 8px;
      }

      .cs-loading-hint {
        font-size: 0.95rem;
        color: var(--cs-text-muted);
      }

      /* ===== Error State ===== */
      .cs-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--cs-bg);
        text-align: center;
        padding: 24px;
      }

      .cs-error-icon {
        font-size: 4rem;
        margin-bottom: 24px;
      }

      .cs-error-title {
        font-size: 1.75rem;
        font-weight: 800;
        color: var(--cs-accent);
        margin-bottom: 12px;
      }

      .cs-error-text {
        font-size: 1rem;
        color: var(--cs-text-muted);
      }

      /* ===== Header Section ===== */
      .cs-header {
        background: var(--cs-bg-card);
        border-radius: var(--cs-radius-lg);
        padding: 28px 32px;
        margin-bottom: 24px;
        box-shadow: var(--cs-shadow);
        border: 1px solid var(--cs-border-light);
        position: relative;
        overflow: hidden;
      }

      .cs-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--cs-gold-gradient);
      }

      .cs-header-inner {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        flex-wrap: wrap;
      }

      .cs-header-left {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .cs-back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--cs-bg);
        border: 1px solid var(--cs-border);
        color: var(--cs-text);
        cursor: pointer;
        transition: var(--cs-transition);
        text-decoration: none;
      }

      .cs-back-btn:hover {
        background: var(--cs-primary);
        color: white;
        border-color: var(--cs-primary);
        transform: translateX(-2px);
      }

      .cs-recipe-icon {
        width: 72px;
        height: 72px;
        border-radius: 18px;
        background: var(--cs-warm-gradient);
        border: 2px solid var(--cs-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        box-shadow: var(--cs-shadow);
        position: relative;
      }

      .cs-recipe-icon::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 20px;
        background: var(--cs-gold-gradient);
        opacity: 0;
        transition: var(--cs-transition);
        z-index: -1;
      }

      .cs-recipe-icon:hover::after {
        opacity: 1;
      }

      .cs-recipe-info {
        min-width: 0;
      }

      .cs-recipe-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.1), rgba(255, 215, 0, 0.1));
        border-radius: var(--cs-radius-full);
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--cs-primary-dark);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
        border: 1px solid rgba(184, 134, 11, 0.2);
      }

      .cs-recipe-name {
        font-size: 1.75rem;
        font-weight: 800;
        color: var(--cs-text);
        letter-spacing: -0.02em;
        line-height: 1.2;
        margin-bottom: 8px;
        background: linear-gradient(135deg, var(--cs-text), var(--cs-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .cs-autosave-status {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.85rem;
        color: var(--cs-text-muted);
        font-weight: 500;
      }

      .cs-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cs-success);
        position: relative;
      }

      .cs-status-dot::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        border: 2px solid var(--cs-success);
        opacity: 0.3;
        animation: pulse-ring 2s infinite;
      }

      @keyframes pulse-ring {
        0% { transform: scale(1); opacity: 0.3; }
        50% { transform: scale(1.3); opacity: 0; }
        100% { transform: scale(1); opacity: 0.3; }
      }

      .cs-status-dot.saving {
        background: var(--cs-warning);
      }

      .cs-status-dot.error {
        background: var(--cs-accent);
      }

      /* ===== Navigation Tabs ===== */
      .cs-nav {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 4px;
        background: var(--cs-bg);
        border-radius: var(--cs-radius-full);
        border: 1px solid var(--cs-border);
      }

      .cs-nav-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: var(--cs-radius-full);
        background: transparent;
        border: none;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--cs-text-muted);
        cursor: pointer;
        transition: var(--cs-transition);
        white-space: nowrap;
      }

      .cs-nav-item:hover {
        background: var(--cs-bg-card);
        color: var(--cs-text);
      }

      .cs-nav-item.active {
        background: var(--cs-bg-card);
        color: var(--cs-primary-dark);
        box-shadow: var(--cs-shadow);
      }

      .cs-nav-icon {
        font-size: 1.1rem;
      }

      /* ===== Cards ===== */
      .cs-card {
        background: var(--cs-bg-card);
        border-radius: var(--cs-radius-lg);
        margin-bottom: 24px;
        box-shadow: var(--cs-shadow);
        border: 1px solid var(--cs-border-light);
        overflow: hidden;
        transition: var(--cs-transition);
      }

      .cs-card:hover {
        box-shadow: var(--cs-shadow-lg);
      }

      .cs-card-head {
        padding: 24px 28px;
        border-bottom: 1px solid var(--cs-border-light);
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.02), transparent);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
      }

      .cs-card-title {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .cs-card-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.1), rgba(139, 69, 19, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cs-primary);
      }

      .cs-card-label {
        font-size: 0.8rem;
        font-weight: 800;
        color: var(--cs-text);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .cs-card-hint {
        font-size: 0.85rem;
        color: var(--cs-text-muted);
        margin-top: 4px;
      }

      .cs-card-body {
        padding: 28px;
      }

      /* ===== Form Elements ===== */
      .cs-field {
        margin-bottom: 20px;
      }

      .cs-field:last-child {
        margin-bottom: 0;
      }

      .cs-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--cs-text-muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .cs-input,
      .cs-select,
      .cs-textarea {
        width: 100%;
        padding: 14px 18px;
        border-radius: 14px;
        border: 2px solid var(--cs-border);
        background: var(--cs-bg-elevated);
        font-size: 0.95rem;
        color: var(--cs-text);
        transition: var(--cs-transition);
        font-family: inherit;
      }

      .cs-input:focus,
      .cs-select:focus,
      .cs-textarea:focus {
        outline: none;
        border-color: var(--cs-primary);
        box-shadow: 0 0 0 4px rgba(184, 134, 11, 0.1);
      }

      .cs-input::placeholder,
      .cs-textarea::placeholder {
        color: var(--cs-text-light);
      }

      .cs-textarea {
        min-height: 120px;
        resize: vertical;
        line-height: 1.6;
      }

      .cs-select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23B8860B'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 16px center;
        background-size: 20px;
        padding-right: 48px;
        cursor: pointer;
      }

      /* ===== Grid System ===== */
      .cs-grid-2 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }

      .cs-grid-3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
      }

      .cs-grid-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
      }

      .cs-grid-5 {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 16px;
      }

      @media (max-width: 1024px) {
        .cs-grid-4 { grid-template-columns: repeat(2, 1fr); }
        .cs-grid-5 { grid-template-columns: repeat(3, 1fr); }
      }

      @media (max-width: 640px) {
        .cs-grid-2,
        .cs-grid-3,
        .cs-grid-4,
        .cs-grid-5 { grid-template-columns: 1fr; }
      }

      /* ===== KPI Cards ===== */
      .cs-kpi {
        background: var(--cs-bg-elevated);
        border-radius: 18px;
        padding: 24px;
        border: 1px solid var(--cs-border-light);
        position: relative;
        overflow: hidden;
        transition: var(--cs-transition);
      }

      .cs-kpi::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--cs-gold-gradient);
      }

      .cs-kpi:hover {
        transform: translateY(-4px);
        box-shadow: var(--cs-shadow-lg);
      }

      .cs-kpi-label {
        font-size: 0.7rem;
        font-weight: 800;
        color: var(--cs-text-muted);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 12px;
      }

      .cs-kpi-value {
        font-size: 2rem;
        font-weight: 900;
        color: var(--cs-text);
        letter-spacing: -0.03em;
        line-height: 1;
      }

      /* ===== Buttons ===== */
      .cs-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 14px 28px;
        border-radius: var(--cs-radius-full);
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: var(--cs-transition);
        border: none;
        font-family: inherit;
        white-space: nowrap;
      }

      .cs-btn-primary {
        background: var(--cs-gold-gradient);
        color: white;
        box-shadow: 0 4px 20px rgba(184, 134, 11, 0.3);
      }

      .cs-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(184, 134, 11, 0.4);
      }

      .cs-btn-secondary {
        background: var(--cs-bg-card);
        color: var(--cs-text);
        border: 2px solid var(--cs-border);
      }

      .cs-btn-secondary:hover {
        border-color: var(--cs-primary);
        color: var(--cs-primary-dark);
      }

      .cs-btn-ghost {
        background: transparent;
        color: var(--cs-text-muted);
        padding: 10px 16px;
      }

      .cs-btn-ghost:hover {
        background: var(--cs-bg);
        color: var(--cs-text);
      }

      .cs-btn-danger {
        background: var(--cs-accent);
        color: white;
      }

      .cs-btn-danger:hover {
        background: #a01830;
      }

      .cs-btn-sm {
        padding: 10px 18px;
        font-size: 0.85rem;
      }

      /* ===== Table ===== */
      .cs-table-wrapper {
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid var(--cs-border-light);
      }

      .cs-table {
        width: 100%;
        border-collapse: collapse;
      }

      .cs-table thead {
        background: linear-gradient(135deg, var(--cs-bg), var(--cs-bg-elevated));
      }

      .cs-table th {
        padding: 16px 12px;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--cs-text-muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border-bottom: 2px solid var(--cs-border);
      }

      .cs-table td {
        padding: 14px 12px;
        border-bottom: 1px solid var(--cs-border-light);
        font-size: 0.9rem;
        color: var(--cs-text);
      }

      .cs-table tbody tr {
        transition: var(--cs-transition);
      }

      .cs-table tbody tr:hover {
        background: rgba(184, 134, 11, 0.03);
      }

      .cs-table-code {
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--cs-primary-dark);
        background: rgba(184, 134, 11, 0.08);
        padding: 4px 10px;
        border-radius: 6px;
        display: inline-block;
      }

      .cs-table-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--cs-border);
        border-radius: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        text-align: right;
        background: var(--cs-bg-card);
        transition: var(--cs-transition);
      }

      .cs-table-input:focus {
        outline: none;
        border-color: var(--cs-primary);
        box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.1);
      }

      .cs-table-unit {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--cs-text-muted);
        background: var(--cs-bg);
        padding: 4px 10px;
        border-radius: 6px;
        text-align: center;
        min-width: 50px;
        display: inline-block;
      }

      .cs-table-cost {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        color: var(--cs-primary-dark);
        text-align: right;
      }

      .cs-table-actions {
        display: flex;
        gap: 8px;
        justify-content: center;
      }

      .cs-action-btn {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        border: 1px solid var(--cs-border);
        background: var(--cs-bg-card);
        color: var(--cs-text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--cs-transition);
      }

      .cs-action-btn:hover {
        border-color: var(--cs-primary);
        color: var(--cs-primary);
        background: rgba(184, 134, 11, 0.05);
      }

      .cs-action-btn.danger:hover {
        border-color: var(--cs-accent);
        color: var(--cs-accent);
        background: rgba(196, 30, 58, 0.05);
      }

      /* ===== Group Row ===== */
      .cs-group-row {
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.05), rgba(139, 69, 19, 0.03));
      }

      .cs-group-row td {
        padding: 16px;
      }

      .cs-group-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
      }

      .cs-group-title {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .cs-group-icon {
        font-size: 1.25rem;
      }

      .cs-group-name {
        font-size: 1rem;
        font-weight: 800;
        color: var(--cs-secondary);
      }

      .cs-group-badge {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--cs-primary-dark);
        background: rgba(184, 134, 11, 0.1);
        padding: 4px 12px;
        border-radius: var(--cs-radius-full);
        margin-left: 8px;
      }

      /* ===== Add Line Section ===== */
      .cs-add-line {
        background: var(--cs-bg-elevated);
        border-radius: 18px;
        padding: 28px;
        border: 1px solid var(--cs-border-light);
      }

      .cs-type-selector {
        display: flex;
        gap: 8px;
        padding: 6px;
        background: var(--cs-bg);
        border-radius: var(--cs-radius-full);
        margin-bottom: 24px;
        border: 1px solid var(--cs-border);
      }

      .cs-type-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 14px 20px;
        border-radius: var(--cs-radius-full);
        border: none;
        background: transparent;
        color: var(--cs-text-muted);
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: var(--cs-transition);
        font-family: inherit;
      }

      .cs-type-btn:hover {
        background: var(--cs-bg-card);
        color: var(--cs-text);
      }

      .cs-type-btn.active {
        background: var(--cs-bg-card);
        color: var(--cs-primary-dark);
        box-shadow: var(--cs-shadow);
      }

      .cs-type-icon {
        font-size: 1.2rem;
      }

      /* ===== Method Steps ===== */
      .cs-steps-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-top: 20px;
      }

      @media (max-width: 1024px) {
        .cs-steps-grid { grid-template-columns: repeat(2, 1fr); }
      }

      @media (max-width: 640px) {
        .cs-steps-grid { grid-template-columns: 1fr; }
      }

      .cs-step-card {
        background: var(--cs-bg-elevated);
        border-radius: 18px;
        border: 1px solid var(--cs-border-light);
        overflow: hidden;
        transition: var(--cs-transition);
      }

      .cs-step-card:hover {
        box-shadow: var(--cs-shadow);
      }

      .cs-step-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--cs-border-light);
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.03), transparent);
      }

      .cs-step-number {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--cs-gold-gradient);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.95rem;
      }

      .cs-step-label {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--cs-text-muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .cs-step-remove {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: rgba(196, 30, 58, 0.1);
        color: var(--cs-accent);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--cs-transition);
      }

      .cs-step-remove:hover {
        background: var(--cs-accent);
        color: white;
      }

      .cs-step-body {
        padding: 20px;
      }

      .cs-step-textarea {
        width: 100%;
        min-height: 100px;
        padding: 14px;
        border: 1px solid var(--cs-border);
        border-radius: 12px;
        font-size: 0.9rem;
        line-height: 1.6;
        resize: vertical;
        font-family: inherit;
        color: var(--cs-text);
        background: var(--cs-bg-card);
        transition: var(--cs-transition);
      }

      .cs-step-textarea:focus {
        outline: none;
        border-color: var(--cs-primary);
      }

      .cs-step-photo {
        margin-top: 16px;
      }

      .cs-step-photo-preview {
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        aspect-ratio: 1;
      }

      .cs-step-photo-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .cs-step-photo-upload {
        border: 2px dashed var(--cs-border);
        border-radius: 12px;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: var(--cs-transition);
        color: var(--cs-text-muted);
      }

      .cs-step-photo-upload:hover {
        border-color: var(--cs-primary);
        color: var(--cs-primary);
        background: rgba(184, 134, 11, 0.03);
      }

      /* ===== Warning Banner ===== */
      .cs-warning {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 20px;
        background: rgba(196, 30, 58, 0.05);
        border: 1px solid rgba(196, 30, 58, 0.2);
        border-radius: 16px;
        margin-top: 20px;
      }

      .cs-warning-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(196, 30, 58, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .cs-warning-title {
        font-size: 0.85rem;
        font-weight: 800;
        color: var(--cs-accent);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .cs-warning-text {
        font-size: 0.9rem;
        color: var(--cs-text);
        font-weight: 600;
      }

      /* ===== Empty State ===== */
      .cs-empty {
        text-align: center;
        padding: 60px 40px;
        background: var(--cs-bg-elevated);
        border-radius: 20px;
        border: 2px dashed var(--cs-border);
      }

      .cs-empty-icon {
        font-size: 4rem;
        margin-bottom: 20px;
        opacity: 0.6;
      }

      .cs-empty-title {
        font-size: 1.25rem;
        font-weight: 800;
        color: var(--cs-text);
        margin-bottom: 8px;
      }

      .cs-empty-text {
        font-size: 0.95rem;
        color: var(--cs-text-muted);
      }

      /* ===== Animations ===== */
      @keyframes flash {
        0%, 100% { background: transparent; }
        50% { background: rgba(184, 134, 11, 0.15); }
      }

      .cs-flash {
        animation: flash 0.6s ease;
      }

      /* ===== Print Styles ===== */
      @media print {
        .cs-container { display: none; }
      }

      .cs-print-only {
        display: none;
      }

      @media print {
        .cs-print-only { display: block; }
      }

      /* ===== Responsive ===== */
      @media (max-width: 768px) {
        .cs-container {
          padding: 16px;
        }

        .cs-header {
          padding: 20px;
        }

        .cs-header-inner {
          flex-direction: column;
          align-items: stretch;
        }

        .cs-header-left {
          flex-direction: column;
          align-items: flex-start;
        }

        .cs-recipe-icon {
          width: 56px;
          height: 56px;
          font-size: 1.5rem;
        }

        .cs-recipe-name {
          font-size: 1.4rem;
        }

        .cs-nav {
          overflow-x: auto;
          justify-content: flex-start;
          padding-bottom: 8px;
        }

        .cs-nav-item {
          padding: 10px 14px;
          font-size: 0.85rem;
        }

        .cs-card-body {
          padding: 20px;
        }
      }
    `}</style>
  )

  const PrintCss = (
    <style>{`
      @media print {
        .cs-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          box-sizing: border-box;
          font-family: 'Georgia', serif;
          color: #1a1a1a;
          background: white;
        }

        .cs-print-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15mm;
          border-bottom: 3px double #B8860B;
          padding-bottom: 10mm;
          margin-bottom: 10mm;
        }

        .cs-print-name {
          font-size: 32pt;
          font-weight: bold;
          color: #8B4513;
          letter-spacing: -0.02em;
        }

        .cs-print-sub {
          font-size: 12pt;
          color: #5C5C7A;
          margin-top: 3mm;
        }

        .cs-print-photo {
          width: 60mm;
          height: 45mm;
          border: 2px solid #B8860B;
          border-radius: 4mm;
          overflow: hidden;
        }

        .cs-print-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cs-print-section {
          margin-top: 8mm;
        }

        .cs-print-title {
          font-size: 14pt;
          font-weight: bold;
          color: #B8860B;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-bottom: 4mm;
          border-bottom: 1px solid #E8E0D5;
          padding-bottom: 2mm;
        }

        .cs-print-text {
          font-size: 11pt;
          line-height: 1.7;
          white-space: pre-wrap;
        }

        .cs-print-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
          font-size: 10pt;
        }

        .cs-print-table th {
          text-align: left;
          padding: 3mm 2mm;
          background: #F5F0E8;
          font-weight: bold;
          color: #8B4513;
          border-bottom: 2px solid #B8860B;
        }

        .cs-print-table td {
          padding: 2.5mm 2mm;
          border-bottom: 1px solid #E8E0D5;
        }

        .cs-print-kpis {
          display: flex;
          gap: 4mm;
          flex-wrap: wrap;
          margin-top: 4mm;
        }

        .cs-print-chip {
          border: 1px solid #B8860B;
          border-radius: 20px;
          padding: 2mm 5mm;
          font-size: 10pt;
          font-weight: bold;
          color: #8B4513;
        }
      }
    `}</style>
  )

  return (
    <>
      {PrintCss}
      {ScreenCss}

      <div className="cs-container">
        {/* Header */}
        <header className="cs-header">
          <div className="cs-header-inner">
            <div className="cs-header-left">
              <NavLink to="/recipes" className="cs-back-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </NavLink>

              <div className="cs-recipe-icon">
                {isSubRecipe ? '🧪' : '🍽️'}
              </div>

              <div className="cs-recipe-info">
                <div className="cs-recipe-badge">
                  <span>RECIPE EDITOR</span>
                  <span>•</span>
                  <span>{isSubRecipe ? 'SUBRECIPE' : 'MAIN RECIPE'}</span>
                </div>
                <h1 className="cs-recipe-name">{(name || 'Untitled Recipe').trim()}</h1>
                <div className="cs-autosave-status">
                  <span className={`cs-status-dot ${autosave.status === 'saving' ? 'saving' : autosave.status === 'error' ? 'error' : ''}`} />
                  <span>
                    {autosave.status === 'saving'
                      ? 'Saving changes...'
                      : autosave.status === 'error'
                        ? (autosave.message || 'Save failed - retrying...')
                        : autosave.lastSavedAt
                          ? `Saved ${Math.max(1, Math.round((Date.now() - autosave.lastSavedAt) / 1000))}s ago`
                          : 'Ready to edit'}
                  </span>
                </div>
              </div>
            </div>

            <nav className="cs-nav">
              <button className={`cs-nav-item ${activeSection === 'sec-basics' ? 'active' : ''}`} onClick={() => scrollToSection('sec-basics')}>
                <span className="cs-nav-icon">📋</span>
                <span>Basics</span>
              </button>
              <button className={`cs-nav-item ${activeSection === 'sec-method' ? 'active' : ''}`} onClick={() => scrollToSection('sec-method')}>
                <span className="cs-nav-icon">📝</span>
                <span>Method</span>
              </button>
              <button className={`cs-nav-item ${activeSection === 'sec-nutrition' ? 'active' : ''}`} onClick={() => scrollToSection('sec-nutrition')}>
                <span className="cs-nav-icon">🥗</span>
                <span>Nutrition</span>
              </button>
              <button className={`cs-nav-item ${activeSection === 'sec-lines' ? 'active' : ''}`} onClick={() => scrollToSection('sec-lines')}>
                <span className="cs-nav-icon">📦</span>
                <span>Lines</span>
              </button>
              <button className={`cs-nav-item ${activeSection === 'sec-print' ? 'active' : ''}`} onClick={() => scrollToSection('sec-print')}>
                <span className="cs-nav-icon">🖨️</span>
                <span>Print</span>
              </button>
              {showCost && (
                <button className={`cs-nav-item ${activeSection === 'sec-cost' ? 'active' : ''}`} onClick={() => scrollToSection('sec-cost')}>
                  <span className="cs-nav-icon">💰</span>
                  <span>Cost</span>
                </button>
              )}
            </nav>
          </div>
        </header>

        {/* Error Banner */}
        {err && (
          <div className="cs-warning" style={{ marginBottom: '24px' }}>
            <div className="cs-warning-icon">⚠️</div>
            <div>
              <div className="cs-warning-title">Error</div>
              <div className="cs-warning-text">{err}</div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="cs-card">
          <div className="cs-card-body" style={{ padding: '20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="cs-btn cs-btn-secondary cs-btn-sm" onClick={printNow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print A4
                </button>
                <button className="cs-btn cs-btn-primary cs-btn-sm" onClick={exportExcel}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Export Excel
                </button>
                <button 
                  className="cs-btn cs-btn-secondary cs-btn-sm" 
                  onClick={() => id && navigate(`/cook?id=${encodeURIComponent(id)}`)}
                  disabled={!id}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
                    <line x1="6" y1="1" x2="6" y2="4" />
                    <line x1="10" y1="1" x2="10" y2="4" />
                    <line x1="14" y1="1" x2="14" y2="4" />
                  </svg>
                  Cook Mode
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="cs-label" style={{ margin: 0, fontSize: '0.7rem' }}>VIEW:</span>
                <button 
                  className={`cs-btn cs-btn-ghost cs-btn-sm ${density === 'comfort' ? 'active' : ''}`}
                  onClick={() => setDensity('comfort')}
                  style={{ opacity: density === 'comfort' ? 1 : 0.6 }}
                >
                  Comfort
                </button>
                <button 
                  className={`cs-btn cs-btn-ghost cs-btn-sm ${density === 'compact' ? 'active' : ''}`}
                  onClick={() => setDensity('compact')}
                  style={{ opacity: density === 'compact' ? 1 : 0.6 }}
                >
                  Compact
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Section */}
        {showCost && (
          <div id="sec-cost" className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <div className="cs-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v12M9 9h6M9 15h6" />
                  </svg>
                </div>
                <div>
                  <div className="cs-card-label">Cost Analysis</div>
                  <div className="cs-card-hint">Real-time recipe financial metrics</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cs-label" style={{ margin: 0 }}>Currency:</span>
                <span className="cs-table-code">{cur}</span>
              </div>
            </div>
            <div className="cs-card-body">
              <div className="cs-grid-4">
                <div className="cs-kpi">
                  <div className="cs-kpi-label">Total Cost</div>
                  <div className="cs-kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                </div>
                <div className="cs-kpi">
                  <div className="cs-kpi-label">Cost Per Portion</div>
                  <div className="cs-kpi-value">{fmtMoney(totals.cpp, cur)}</div>
                </div>
                <div className="cs-kpi">
                  <div className="cs-kpi-label">Food Cost %</div>
                  <div className="cs-kpi-value">{totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                </div>
                <div className="cs-kpi">
                  <div className="cs-kpi-label">Margin</div>
                  <div className="cs-kpi-value">{fmtMoney(totals.margin, cur)}</div>
                </div>
              </div>

              {totals.warnings?.length > 0 && (
                <div className="cs-warning" style={{ marginTop: '24px' }}>
                  <div className="cs-warning-icon">⚠️</div>
                  <div>
                    <div className="cs-warning-title">Pricing Warning</div>
                    <div className="cs-warning-text">{totals.warnings[0]}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div id="sec-basics" className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <div className="cs-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
              </div>
              <div>
                <div className="cs-card-label">Basic Information</div>
                <div className="cs-card-hint">Core recipe details and identification</div>
              </div>
            </div>
          </div>
          <div className="cs-card-body">
            <div className="cs-grid-2">
              {/* Recipe Identity */}
              <div className="cs-field">
                <label className="cs-label">Recipe Code</label>
                <input
                  className="cs-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., PREP-001"
                  disabled={!canEditCodes}
                />
                {!canEditCodes && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--cs-text-muted)' }}>
                    🔒 Only kitchen owners can edit codes
                  </div>
                )}
              </div>

              <div className="cs-field">
                <label className="cs-label">Code Category</label>
                <input
                  className="cs-input"
                  value={codeCategory}
                  onChange={(e) => setCodeCategory(e.target.value.toUpperCase())}
                  placeholder="e.g., BASEGR"
                  maxLength={6}
                  disabled={!canEditCodes}
                />
              </div>

              <div className="cs-field">
                <label className="cs-label">Recipe Name *</label>
                <input
                  className="cs-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Classic Tomato Soup"
                />
              </div>

              <div className="cs-field">
                <label className="cs-label">Category</label>
                <select className="cs-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select category</option>
                  <option value="Appetizer">Appetizer</option>
                  <option value="Main Course">Main Course</option>
                  <option value="Dessert">Dessert</option>
                  <option value="Sauce">Sauce</option>
                  <option value="Soup">Soup</option>
                  <option value="Salad">Salad</option>
                  <option value="Beverage">Beverage</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="cs-field">
                <label className="cs-label">Portions</label>
                <input
                  className="cs-input"
                  type="number"
                  value={portions}
                  onChange={(e) => setPortions(e.target.value)}
                  min="1"
                  placeholder="1"
                />
              </div>

              <div className="cs-field">
                <label className="cs-label">Currency</label>
                <input
                  className="cs-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>
            </div>

            <div className="cs-field" style={{ marginTop: '20px' }}>
              <label className="cs-label">Description</label>
              <textarea
                className="cs-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a brief description of this recipe..."
                maxLength={500}
              />
              <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '0.75rem', color: 'var(--cs-text-muted)' }}>
                {description.length}/500 characters
              </div>
            </div>

            {/* Subrecipe Settings */}
            <div style={{ marginTop: '32px', padding: '24px', background: 'var(--cs-bg)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '1.5rem' }}>🧪</span>
                <div>
                  <div className="cs-card-label" style={{ margin: 0 }}>Subrecipe Settings</div>
                  <div className="cs-card-hint" style={{ margin: '4px 0 0' }}>Enable if this recipe can be used as a component in other recipes</div>
                </div>
              </div>

              <div className="cs-grid-3">
                <div className="cs-field">
                  <label className="cs-label">Is Subrecipe</label>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="isSubRecipe"
                        checked={isSubRecipe}
                        onChange={() => setIsSubRecipe(true)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--cs-primary)' }}
                      />
                      <span style={{ fontWeight: '600' }}>Yes</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="isSubRecipe"
                        checked={!isSubRecipe}
                        onChange={() => setIsSubRecipe(false)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--cs-primary)' }}
                      />
                      <span style={{ fontWeight: '600' }}>No</span>
                    </label>
                  </div>
                </div>

                <div className="cs-field">
                  <label className="cs-label">Yield Quantity</label>
                  <input
                    className="cs-input"
                    type="number"
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                    placeholder="e.g., 1000"
                    disabled={!isSubRecipe}
                  />
                </div>

                <div className="cs-field">
                  <label className="cs-label">Yield Unit</label>
                  <select
                    className="cs-select"
                    value={yieldUnit}
                    onChange={(e) => setYieldUnit(e.target.value as any)}
                    disabled={!isSubRecipe}
                  >
                    <option value="g">g (gram)</option>
                    <option value="kg">kg (kilogram)</option>
                    <option value="ml">ml (milliliter)</option>
                    <option value="l">l (liter)</option>
                    <option value="pcs">pcs (pieces)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div style={{ marginTop: '32px' }}>
              <label className="cs-label">Recipe Photo</label>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '12px' }}>
                <div 
                  style={{ 
                    width: '200px', 
                    height: '150px', 
                    borderRadius: '16px', 
                    border: '2px dashed var(--cs-border)', 
                    overflow: 'hidden',
                    background: 'var(--cs-bg)'
                  }}
                >
                  {recipe?.photo_url ? (
                    <img src={recipe.photo_url} alt="Recipe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <label 
                      htmlFor="photo-upload" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        cursor: 'pointer',
                        color: 'var(--cs-text-muted)'
                      }}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="2" width="20" height="20" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                        <path d="M21 15l-5-5L7 21" />
                      </svg>
                      <span style={{ marginTop: '8px', fontSize: '0.85rem' }}>Click to upload</span>
                    </label>
                  )}
                </div>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadRecipePhoto(f)
                  }}
                />
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--cs-text-muted)', marginBottom: '12px' }}>
                    Upload a high-quality photo for your recipe card.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cs-text-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--cs-success)' }}>✓</span> Recommended: 1200 x 800px
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cs-text-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--cs-success)' }}>✓</span> Max size: 5MB
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cs-text-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--cs-success)' }}>✓</span> Formats: JPG, PNG, WebP
                    </div>
                  </div>
                  {uploading && (
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cs-primary)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="cs-spinner" style={{ width: '16px', height: '16px' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <span style={{ fontSize: '0.85rem' }}>Uploading...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        {showCost && (
          <div className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <div className="cs-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div>
                  <div className="cs-card-label">Pricing & Targets</div>
                  <div className="cs-card-hint">Set selling price and food cost targets</div>
                </div>
              </div>
            </div>
            <div className="cs-card-body">
              <div className="cs-grid-3">
                <div className="cs-field">
                  <label className="cs-label">Selling Price</label>
                  <input
                    className="cs-input"
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="cs-field">
                  <label className="cs-label">Target Food Cost %</label>
                  <input
                    className="cs-input"
                    type="number"
                    value={targetFC}
                    onChange={(e) => setTargetFC(e.target.value)}
                    placeholder="30"
                  />
                </div>
                <div className="cs-field">
                  <label className="cs-label">Actual Food Cost %</label>
                  <div className="cs-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '700', color: totals.fcPct && totals.fcPct > 30 ? 'var(--cs-accent)' : 'var(--cs-success)' }}>
                      {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}
                    </span>
                    {totals.fcPct && targetFC && totals.fcPct > parseFloat(targetFC) && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--cs-accent)' }}>⚠️ Above target</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nutrition Section */}
        <div id="sec-nutrition" className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <div className="cs-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </div>
              <div>
                <div className="cs-card-label">Nutrition Per Portion</div>
                <div className="cs-card-hint">Manual nutritional information</div>
              </div>
            </div>
          </div>
          <div className="cs-card-body">
            <div className="cs-grid-4">
              <div className="cs-field">
                <label className="cs-label">Calories</label>
                <input
                  className="cs-input"
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="cs-field">
                <label className="cs-label">Protein (g)</label>
                <input
                  className="cs-input"
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="cs-field">
                <label className="cs-label">Carbs (g)</label>
                <input
                  className="cs-input"
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="cs-field">
                <label className="cs-label">Fat (g)</label>
                <input
                  className="cs-input"
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Add Line Section */}
        <div className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <div className="cs-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <div>
                <div className="cs-card-label">Add Line</div>
                <div className="cs-card-hint">Add ingredients, subrecipes, or groups</div>
              </div>
            </div>
          </div>
          <div className="cs-card-body">
            <div className="cs-add-line">
              <div className="cs-type-selector">
                <button
                  className={`cs-type-btn ${addType === 'ingredient' ? 'active' : ''}`}
                  onClick={() => setAddType('ingredient')}
                  type="button"
                >
                  <span className="cs-type-icon">🥗</span>
                  <span>Ingredient</span>
                </button>
                <button
                  className={`cs-type-btn ${addType === 'subrecipe' ? 'active' : ''}`}
                  onClick={() => setAddType('subrecipe')}
                  type="button"
                >
                  <span className="cs-type-icon">📋</span>
                  <span>Subrecipe</span>
                </button>
                <button
                  className={`cs-type-btn ${addType === 'group' ? 'active' : ''}`}
                  onClick={() => setAddType('group')}
                  type="button"
                >
                  <span className="cs-type-icon">📁</span>
                  <span>Group</span>
                </button>
              </div>

              {addType !== 'group' ? (
                <>
                  <div className="cs-grid-2" style={{ marginBottom: '20px' }}>
                    <div className="cs-field">
                      <label className="cs-label">Search</label>
                      <input
                        className="cs-input"
                        value={ingSearch}
                        onChange={(e) => setIngSearch(e.target.value)}
                        placeholder={`Search ${addType === 'ingredient' ? 'ingredients' : 'subrecipes'}...`}
                      />
                    </div>
                    <div className="cs-field">
                      <label className="cs-label">Select {addType === 'ingredient' ? 'Ingredient' : 'Subrecipe'}</label>
                      <select
                        className="cs-select"
                        value={addType === 'ingredient' ? addIngredientId : addSubRecipeId}
                        onChange={(e) => {
                          if (addType === 'ingredient') {
                            setAddIngredientId(e.target.value)
                          } else {
                            setAddSubRecipeId(e.target.value)
                          }
                        }}
                      >
                        <option value="">— Select —</option>
                        {addType === 'ingredient'
                          ? filteredIngredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name || 'Unnamed'} {i.code ? `(${i.code})` : ''}
                            </option>
                          ))
                          : subRecipeOptions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name || 'Untitled'} {r.code ? `(${r.code})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="cs-grid-5">
                    <div className="cs-field">
                      <label className="cs-label">Net Qty</label>
                      <input
                        className="cs-input"
                        type="number"
                        value={addNetQty}
                        onChange={(e) => setAddNetQty(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="cs-field">
                      <label className="cs-label">Unit</label>
                      <select className="cs-select" value={addUnit} onChange={(e) => setAddUnit(e.target.value)}>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="pcs">pcs</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                        <option value="cup">cup</option>
                      </select>
                    </div>
                    <div className="cs-field">
                      <label className="cs-label">Yield %</label>
                      <input
                        className="cs-input"
                        type="number"
                        value={addYield}
                        onChange={(e) => setAddYield(e.target.value)}
                        placeholder="100"
                      />
                    </div>
                    <div className="cs-field">
                      <label className="cs-label">Gross</label>
                      <input
                        className="cs-input"
                        type="number"
                        value={addGross}
                        onChange={(e) => setAddGross(e.target.value)}
                        placeholder="auto"
                      />
                    </div>
                    <div className="cs-field">
                      <label className="cs-label">Note</label>
                      <input
                        className="cs-input"
                        value={addNote}
                        onChange={(e) => setAddNote(e.target.value)}
                        placeholder="optional"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="cs-field">
                  <label className="cs-label">Group Title</label>
                  <input
                    className="cs-input"
                    value={addGroupTitle}
                    onChange={(e) => setAddGroupTitle(e.target.value)}
                    placeholder="e.g., Sauce, Toppings, Marinade"
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button className="cs-btn cs-btn-secondary" onClick={() => saveLinesNow()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Lines
                </button>
                <button className="cs-btn cs-btn-primary" onClick={addLineLocal}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add {addType === 'group' ? 'Group' : 'Line'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Lines Table */}
        <div id="sec-lines" className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <div className="cs-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
              <div>
                <div className="cs-card-label">Recipe Lines</div>
                <div className="cs-card-hint">{visibleLines.length} items total</div>
              </div>
            </div>
          </div>
          <div className="cs-card-body" style={{ padding: 0 }}>
            {!visibleLines.length ? (
              <div className="cs-empty">
                <div className="cs-empty-icon">📦</div>
                <div className="cs-empty-title">No ingredients yet</div>
                <div className="cs-empty-text">Start by adding ingredients, subrecipes, or groups above</div>
              </div>
            ) : (
              <div className="cs-table-wrapper">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Gross</th>
                      <th style={{ textAlign: 'right' }}>Yield</th>
                      {showCost && <th style={{ textAlign: 'right' }}>Cost</th>}
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((l) => {
                      const c = lineComputed.get(l.id)
                      const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                      const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id} className={`cs-group-row ${flashLineId === l.id ? 'cs-flash' : ''}`}>
                            <td colSpan={tableColSpan}>
                              <div className="cs-group-content">
                                <div className="cs-group-title">
                                  <span className="cs-group-icon">📁</span>
                                  <span className="cs-group-name">{l.group_title || 'Untitled Group'}</span>
                                  <span className="cs-group-badge">GROUP</span>
                                </div>
                                <div className="cs-table-actions">
                                  <button className="cs-action-btn" onClick={() => duplicateLineLocal(l.id)} title="Duplicate">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                  </button>
                                  <button className="cs-action-btn danger" onClick={() => deleteLineLocal(l.id)} title="Delete">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={l.id} className={flashLineId === l.id ? 'cs-flash' : ''}>
                          <td>
                            <span className="cs-table-code">
                              {l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')}
                            </span>
                          </td>
                          <td>
                            <div>
                              <div style={{ fontWeight: '600' }}>
                                {l.line_type === 'ingredient'
                                  ? (ing?.name || 'Unknown Ingredient')
                                  : (sub?.name || 'Unknown Subrecipe')}
                              </div>
                              {l.notes && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--cs-text-muted)', marginTop: '2px' }}>
                                  📝 {l.notes}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              className="cs-table-input"
                              type="number"
                              value={fmtQty(toNum(l.qty, 0))}
                              onChange={(e) => onNetChange(l.id, e.target.value)}
                            />
                          </td>
                          <td>
                            <span className="cs-table-unit">{l.unit || 'g'}</span>
                          </td>
                          <td>
                            <input
                              className="cs-table-input"
                              type="number"
                              value={l.gross_qty_override != null ? fmtQty(l.gross_qty_override) : ''}
                              onChange={(e) => onGrossChange(l.id, e.target.value)}
                              placeholder={c ? fmtQty(c.gross) : ''}
                            />
                          </td>
                          <td>
                            <input
                              className="cs-table-input"
                              type="number"
                              value={String(Math.round(clamp(toNum(l.yield_percent, 100), 0.0001, 100) * 100) / 100)}
                              onChange={(e) => onYieldChange(l.id, e.target.value)}
                            />
                          </td>
                          {showCost && (
                            <td>
                              <div className="cs-table-cost">
                                {c && c.lineCost > 0 ? (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                    <span>{fmtMoney(c.lineCost, cur)}</span>
                                    {c.warnings.length > 0 && (
                                      <span style={{ color: 'var(--cs-accent)' }} title={c.warnings[0]}>⚠️</span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--cs-text-light)' }}>—</span>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div className="cs-table-actions">
                              <button className="cs-action-btn" onClick={() => duplicateLineLocal(l.id)} title="Duplicate">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                              </button>
                              <button className="cs-action-btn danger" onClick={() => deleteLineLocal(l.id)} title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                              </button>
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

        {/* Method Section */}
        <div id="sec-method" className="cs-card">
          <div className="cs-card-head">
            <div className="cs-card-title">
              <div className="cs-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div>
                <div className="cs-card-label">Cooking Method</div>
                <div className="cs-card-hint">Step-by-step instructions with optional photos</div>
              </div>
            </div>
          </div>
          <div className="cs-card-body">
            {/* New Step Input */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '32px' }}>
              <div className="cs-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="cs-label">Add New Step</label>
                <input
                  className="cs-input"
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder="e.g., Sauté onions until golden brown..."
                  onKeyDown={(e) => e.key === 'Enter' && addStep()}
                />
              </div>
              <button className="cs-btn cs-btn-primary" onClick={addStep}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Step
              </button>
            </div>

            {/* Steps Grid */}
            {steps.length > 0 ? (
              <div className="cs-steps-grid">
                {steps.map((s, idx) => (
                  <div key={idx} className="cs-step-card">
                    <div className="cs-step-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="cs-step-number">{idx + 1}</div>
                        <span className="cs-step-label">Step {idx + 1}</span>
                      </div>
                      <button className="cs-step-remove" onClick={() => removeStep(idx)}>
                        ✕
                      </button>
                    </div>
                    <div className="cs-step-body">
                      <textarea
                        className="cs-step-textarea"
                        value={s}
                        onChange={(e) => updateStep(idx, e.target.value)}
                        placeholder={`Describe step ${idx + 1}...`}
                      />
                      <div className="cs-step-photo">
                        {stepPhotos[idx] ? (
                          <div className="cs-step-photo-preview">
                            <img src={stepPhotos[idx]} alt={`Step ${idx + 1}`} />
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.5)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0,
                              transition: 'var(--cs-transition)'
                            }}>
                              <label htmlFor={`step-photo-${idx}`} style={{ cursor: 'pointer' }}>
                                Change
                              </label>
                            </div>
                          </div>
                        ) : (
                          <label htmlFor={`step-photo-${idx}`} className="cs-step-photo-upload">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="2" width="20" height="20" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                              <path d="M21 15l-5-5L7 21" />
                            </svg>
                            <span style={{ fontSize: '0.8rem' }}>Add Photo</span>
                          </label>
                        )}
                        <input
                          id={`step-photo-${idx}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={stepUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadStepPhoto(f, idx)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cs-empty">
                <div className="cs-empty-icon">📝</div>
                <div className="cs-empty-title">No steps yet</div>
                <div className="cs-empty-text">Add your first cooking step above</div>
              </div>
            )}

            {/* Legacy Method */}
            <div style={{ marginTop: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '1.25rem' }}>📜</span>
                <div>
                  <div className="cs-card-label" style={{ margin: 0 }}>Legacy Method</div>
                  <div className="cs-card-hint" style={{ margin: '4px 0 0' }}>Alternative text block for longer instructions</div>
                </div>
              </div>
              <textarea
                className="cs-textarea"
                value={methodLegacy}
                onChange={(e) => setMethodLegacy(e.target.value)}
                placeholder="Write your full method here if you prefer a single text block..."
                rows={6}
              />
            </div>
          </div>
        </div>

        {/* Cost History */}
        {showCost && (
          <div className="cs-card">
            <div className="cs-card-head">
              <div className="cs-card-title">
                <div className="cs-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div className="cs-card-label">Cost History</div>
                  <div className="cs-card-hint">Track cost changes over time</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="cs-btn cs-btn-primary cs-btn-sm" onClick={addSnapshot}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Add Snapshot
                </button>
                {costPoints.length > 0 && (
                  <button className="cs-btn cs-btn-danger cs-btn-sm" onClick={clearSnapshots}>
                    Clear All
                  </button>
                )}
              </div>
            </div>
            <div className="cs-card-body">
              <CostTimeline points={costPoints} currency={currency} />
              {!costPoints.length && (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--cs-text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📊</div>
                  <div>No cost snapshots yet. Click "Add Snapshot" to track this recipe's cost.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Print Version */}
      <div className="cs-print-only">
        <div className="cs-print-page">
          <div className="cs-print-header">
            <div style={{ flex: 1 }}>
              <div className="cs-print-name">{(name || 'Untitled').trim()}</div>
              <div className="cs-print-sub">
                {(category || 'Uncategorized').trim()} • Portions: {Math.max(1, Math.floor(toNum(portions, 1)))} • Currency: {cur}
              </div>
              <div className="cs-print-kpis">
                <div className="cs-print-chip">Total: {fmtMoney(totals.totalCost, cur)}</div>
                <div className="cs-print-chip">CPP: {fmtMoney(totals.cpp, cur)}</div>
                <div className="cs-print-chip">FC%: {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
              </div>
            </div>
            <div className="cs-print-photo">
              {recipe?.photo_url && <img src={recipe.photo_url} alt="Recipe" />}
            </div>
          </div>

          {description && (
            <div className="cs-print-section">
              <div className="cs-print-title">Description</div>
              <div className="cs-print-text">{description}</div>
            </div>
          )}

          <div className="cs-print-section">
            <div className="cs-print-title">Ingredients</div>
            <table className="cs-print-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Item</th>
                  <th>Net</th>
                  <th>Unit</th>
                  <th>Yield</th>
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
                        <td>{code}</td>
                        <td>{name}</td>
                        <td>{c ? fmtQty(c.net) : '—'}</td>
                        <td>{l.unit || 'g'}</td>
                        <td>{c ? `${c.yieldPct.toFixed(1)}%` : '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {steps.length > 0 && (
            <div className="cs-print-section">
              <div className="cs-print-title">Method</div>
              <div className="cs-print-text">
                {steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n')}
              </div>
            </div>
          )}
        </div>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}
