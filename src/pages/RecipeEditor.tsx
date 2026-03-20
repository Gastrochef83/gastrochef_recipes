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
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          RECIPE EDITOR
        </div>
        <div className="gc-hint" style={{ marginTop: 10 }}>
          Loading recipe data...
        </div>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label text-red-600">ERROR</div>
        <div className="gc-hint" style={{ marginTop: 10 }}>
          Missing recipe id.
        </div>
      </div>
    )
  }

  const headerLeft = (
    <div className="gc-recipe-pro-head-left">
      <NavLink to="/recipes" className="gc-btn gc-btn-ghost flex items-center gap-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back
      </NavLink>

      <div className="gc-recipe-pro-titleWrap">
        <div className="gc-recipe-pro-titleIcon" aria-hidden="true">
          {isSubRecipe ? '🧪' : '🍽'}
        </div>

        <div className="gc-recipe-pro-titleBlock">
          <div className="gc-label flex items-center gap-2">
            RECIPE EDITOR
            <span className="px-2 py-0.5 bg-primary/10 rounded-full text-[10px] font-mono text-primary">
              v2.0
            </span>
          </div>
          <div className="gc-recipe-pro-title">{(name || 'Untitled').trim()}</div>

          <div className="gc-recipe-pro-subline">
            <span className={`gc-recipe-pro-statusDot ${autosave.status === 'saving' ? 'animate-pulse' : ''}`} aria-hidden="true" />
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
      <span className={isKitchen ? 'gc-chip gc-chip-active' : 'gc-chip'}>
        {isKitchen ? '👨‍🍳 Kitchen' : '📊 Mgmt'}
      </span>

      <button 
        className="gc-btn-soft flex items-center gap-1.5" 
        type="button" 
        onClick={() => setDensity((v) => (v === 'compact' ? 'comfort' : 'compact'))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
        {density === 'compact' ? 'Compact' : 'Comfort'}
      </button>

      <button className={cx('gc-btn-soft', activeSection === 'sec-basics' && 'is-active')} type="button" onClick={() => scrollToSection('sec-basics')}>📋 Basics</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-method' && 'is-active')} type="button" onClick={() => scrollToSection('sec-method')}>📝 Method</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-nutrition' && 'is-active')} type="button" onClick={() => scrollToSection('sec-nutrition')}>🥗 Nutrition</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-lines' && 'is-active')} type="button" onClick={() => scrollToSection('sec-lines')}>📦 Lines</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-print' && 'is-active')} type="button" onClick={() => scrollToSection('sec-print')}>🖨️ Print</button>
      <button className={cx('gc-btn-soft', activeSection === 'sec-cook' && 'is-active')} type="button" onClick={() => scrollToSection('sec-cook')}>🔥 Cook</button>
      {showCost ? (
        <button className={cx('gc-btn-soft', activeSection === 'sec-cost' && 'is-active')} type="button" onClick={() => scrollToSection('sec-cost')}>💰 Cost</button>
      ) : null}
    </div>
  )

  const NeoStyles = (
    <style>{`
      /* === الألوان الأساسية === */
      :root {
        /* Primary Palette - Teal/Emerald */
        --color-primary-50:  #f0fdfa;
        --color-primary-100: #ccfbf1;
        --color-primary-200: #99f6e4;
        --color-primary-300: #5eead4;
        --color-primary-400: #2dd4bf;
        --color-primary-500: #14b8a6; /* Main Action */
        --color-primary-600: #0d9488; /* Hover */
        --color-primary-700: #0f766e; /* Active */
        --color-primary-800: #115e59;
        --color-primary-900: #134e4a;

        /* Secondary Palette - Amber/Warm */
        --color-secondary-50:  #fffbeb;
        --color-secondary-100: #fef3c7;
        --color-secondary-200: #fde68a;
        --color-secondary-300: #fcd34d;
        --color-secondary-400: #fbbf24;
        --color-secondary-500: #f59e0b; /* Highlights */
        --color-secondary-600: #d97706;
        --color-secondary-700: #b45309;

        /* Neutral Palette */
        --color-neutral-50:  #f8fafc;
        --color-neutral-100: #f1f5f9;
        --color-neutral-200: #e2e8f0;
        --color-neutral-300: #cbd5e1;
        --color-neutral-400: #94a3b8;
        --color-neutral-500: #64748b;
        --color-neutral-600: #475569;
        --color-neutral-700: #334155;
        --color-neutral-800: #1e293b;
        --color-neutral-900: #0f172a;

        /* Semantic Colors */
        --color-success:     #22c55e;
        --color-warning:     #f59e0b;
        --color-error:       #ef4444;
        --color-info:        #3b82f6;

        /* Backgrounds */
        --bg-primary:   #ffffff;
        --bg-secondary: #f8fafc;
        --bg-tertiary:  #f1f5f9;
        --bg-overlay:   rgba(15, 23, 42, 0.5);

        /* Borders */
        --border-light:   rgba(148, 163, 184, 0.2);
        --border-medium:  rgba(148, 163, 184, 0.4);
        --border-strong:  rgba(148, 163, 184, 0.8);

        /* Shadows */
        --shadow-xs:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow-sm:  0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
        --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
        --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
        --shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);

        /* Transitions */
        --transition-fast:   150ms ease;
        --transition-normal: 250ms ease;
        --transition-slow:   400ms ease;

        /* Border Radius */
        --radius-sm:  0.375rem;  /* 6px */
        --radius-md:  0.5rem;    /* 8px */
        --radius-lg:  0.75rem;   /* 12px */
        --radius-xl:  1rem;      /* 16px */
        --radius-2xl: 1.5rem;    /* 24px */
        --radius-full: 9999px;

        /* Typography Scale */
        --text-xs:   0.75rem;   /* 12px */
        --text-sm:   0.875rem;  /* 14px */
        --text-base: 1rem;      /* 16px */
        --text-lg:   1.125rem;  /* 18px */
        --text-xl:   1.25rem;   /* 20px */
        --text-2xl:  1.5rem;    /* 24px */
        --text-3xl:  1.875rem;  /* 30px */
        --text-4xl:  2.25rem;   /* 36px */

        /* Font Weights */
        --font-light:   300;
        --font-normal:  400;
        --font-medium:  500;
        --font-semibold: 600;
        --font-bold:    700;
        --font-extrabold: 800;

        /* Spacing Scale */
        --space-1:  0.25rem;  /* 4px */
        --space-2:  0.5rem;   /* 8px */
        --space-3:  0.75rem;  /* 12px */
        --space-4:  1rem;     /* 16px */
        --space-5:  1.25rem;  /* 20px */
        --space-6:  1.5rem;   /* 24px */
        --space-8:  2rem;     /* 32px */
        --space-10: 2.5rem;   /* 40px */
        --space-12: 3rem;     /* 48px */
      }

      /* === الوضع الليلي (Dark Mode) === */
      [data-theme="dark"] {
        --bg-primary:   #0f172a;
        --bg-secondary: #1e293b;
        --bg-tertiary:  #334155;
        
        --color-neutral-50:  #0f172a;
        --color-neutral-100: #1e293b;
        --color-neutral-200: #334155;
        --color-neutral-300: #475569;
        --color-neutral-400: #64748b;
        --color-neutral-500: #94a3b8;
        --color-neutral-600: #cbd5e1;
        --color-neutral-700: #e2e8f0;
        --color-neutral-800: #f1f5f9;
        --color-neutral-900: #ffffff;

        --border-light:   rgba(148, 163, 184, 0.15);
        --border-medium:  rgba(148, 163, 184, 0.3);
        --border-strong:  rgba(148, 163, 184, 0.6);

        --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
        --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
      }

      /* === التطبيقات العامة === */
      .gc-recipe-pro {
        --primary: var(--color-primary-500);
        --primary-light: var(--color-primary-50);
        --primary-dark: var(--color-primary-700);
        --secondary: var(--color-secondary-500);
        --secondary-dark: var(--color-secondary-700);
        --accent: var(--color-error);
        --text: var(--color-neutral-800);
        --text-light: var(--color-neutral-500);
        --bg-gradient: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
        --card-shadow: var(--shadow-md);
        --hover-shadow: var(--shadow-lg);
        position: relative;
        max-width: 100%;
        overflow-x: hidden;
      }

      /* === أنماط البطاقات المحسنة === */
      .gc-recipe-pro .gc-card-head {
        align-items: center;
        padding: var(--space-5) var(--space-6);
        border-radius: var(--radius-xl);
        background: var(--bg-primary);
        backdrop-filter: blur(10px);
        border: 1px solid var(--border-light);
        box-shadow: var(--shadow-xs);
      }

      .gc-recipe-pro-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-5);
        flex-wrap: wrap;
      }

      .gc-recipe-pro-head-left {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        min-width: 320px;
      }

      .gc-recipe-pro-titleWrap {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        min-width: 0;
      }

      .gc-recipe-pro-titleIcon {
        width: 60px;
        height: 60px;
        flex: 0 0 60px;
        border-radius: var(--radius-xl);
        display: grid;
        place-items: center;
        font-size: 28px;
        background: linear-gradient(145deg, var(--primary-light), var(--bg-primary));
        border: 2px solid rgba(20, 184, 166, 0.2);
        box-shadow: var(--shadow-sm);
        transition: all var(--transition-fast);
      }

      .gc-recipe-pro-titleIcon:hover {
        transform: scale(1.02);
        border-color: var(--primary);
        box-shadow: var(--shadow-md);
      }

      .gc-recipe-pro-titleBlock {
        min-width: 0;
      }

      .gc-recipe-pro-title {
        font-weight: var(--font-extrabold);
        font-size: var(--text-2xl);
        line-height: 1.2;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, var(--primary-dark), var(--primary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-top: var(--space-1);
        word-break: break-word;
      }

      .gc-recipe-pro-subline {
        margin-top: var(--space-2);
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      .gc-recipe-pro-statusDot {
        width: 10px;
        height: 10px;
        border-radius: var(--radius-full);
        background: linear-gradient(135deg, var(--color-success), var(--primary));
        box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.1); }
      }

      .gc-recipe-pro-head-right {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        justify-content: flex-end;
        flex: 1 1 auto;
        min-width: 320px;
        overflow-x: auto;
        padding-bottom: var(--space-1);
        white-space: nowrap;
        scrollbar-width: thin;
      }

      .gc-recipe-pro .gc-btn-soft {
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-full);
        border: 1px solid var(--border-light);
        background: var(--bg-primary);
        backdrop-filter: blur(4px);
        font-weight: var(--font-semibold);
        font-size: var(--text-sm);
        color: var(--text);
        transition: all var(--transition-fast);
        cursor: pointer;
        box-shadow: var(--shadow-xs);
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
      }

      .gc-recipe-pro .gc-btn-soft:hover {
        border-color: var(--primary);
        box-shadow: var(--shadow-sm);
        transform: translateY(-1px);
      }

      .gc-recipe-pro .gc-btn-soft.is-active {
        background: var(--primary-light);
        border-color: var(--primary);
        color: var(--primary-dark);
        font-weight: var(--font-bold);
        box-shadow: inset 0 2px 4px rgba(20, 184, 166, 0.05), var(--shadow-sm);
      }

      /* === أنماط البطاقات === */
      .gc-recipe-pro .gc-card,
      .gc-recipe-pro .gc-card-soft {
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-light);
        background: var(--bg-primary);
        box-shadow: var(--card-shadow);
        transition: all var(--transition-normal);
        margin-bottom: var(--space-5);
        overflow: hidden;
      }

      .gc-recipe-pro .gc-card:hover,
      .gc-recipe-pro .gc-card-soft:hover {
        box-shadow: var(--hover-shadow);
        border-color: rgba(20, 184, 166, 0.2);
      }

      .gc-recipe-pro .gc-card-head {
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid var(--border-light);
        background: linear-gradient(to right, rgba(20, 184, 166, 0.02), transparent);
      }

      .gc-recipe-pro .gc-card-body {
        padding: var(--space-6);
      }

      /* === بطاقات KPI المحسنة === */
      .gc-recipe-pro .gc-kpi-card {
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-light);
        background: linear-gradient(145deg, var(--bg-primary), var(--bg-secondary));
        box-shadow: var(--shadow-sm);
        padding: var(--space-5) var(--space-4) var(--space-4);
        transition: all var(--transition-normal);
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
        box-shadow: var(--shadow-lg);
      }

      .gc-recipe-pro .gc-kpi-label {
        font-size: var(--text-xs);
        letter-spacing: 0.1em;
        font-weight: var(--font-extrabold);
        color: var(--text-light);
        margin-bottom: var(--space-3);
        text-transform: uppercase;
      }

      .gc-recipe-pro .gc-kpi-value {
        font-size: var(--text-2xl);
        line-height: 1.2;
        font-weight: var(--font-extrabold);
        background: linear-gradient(135deg, var(--primary-dark), var(--primary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.03em;
      }

      /* === أنماط الجداول === */
      .gc-recipe-pro .gc-lines-container {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        overflow: hidden;
        border: 1px solid var(--border-light);
        width: 100%;
      }

      .gc-recipe-pro .gc-excel-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: var(--text-sm);
      }

      .gc-recipe-pro .gc-excel-table thead {
        background: linear-gradient(to bottom, var(--bg-secondary), var(--bg-tertiary));
        border-bottom: 2px solid rgba(20, 184, 166, 0.2);
      }

      .gc-recipe-pro .gc-excel-table thead th {
        padding: var(--space-3) var(--space-2);
        font-weight: var(--font-bold);
        font-size: var(--text-xs);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--primary-dark);
        text-align: left;
        white-space: nowrap;
        border-right: 1px solid var(--border-light);
      }

      .gc-recipe-pro .gc-excel-table tbody td {
        padding: var(--space-3) var(--space-2);
        border-bottom: 1px solid var(--border-light);
        vertical-align: middle;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gc-recipe-pro .gc-excel-table tbody tr:hover td {
        background-color: var(--bg-secondary);
      }

      /* === أنماط الإدخال === */
      .gc-recipe-pro .gc-input,
      .gc-recipe-pro .gc-select,
      .gc-recipe-pro .gc-textarea,
      .gc-recipe-pro .gc-modern-input {
        width: 100%;
        box-sizing: border-box;
        color: var(--text);
        background: var(--bg-primary);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        line-height: 1.45;
        border-radius: var(--radius-md);
        border: 1.5px solid var(--border-light);
        transition: all var(--transition-fast);
        -webkit-appearance: none;
        appearance: none;
      }

      .gc-recipe-pro .gc-input:focus,
      .gc-recipe-pro .gc-select:focus,
      .gc-recipe-pro .gc-textarea:focus,
      .gc-recipe-pro .gc-modern-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.1);
      }

      /* === أنماط إضافة المكونات === */
      .gc-recipe-pro .gc-add-line-modern {
        background: linear-gradient(145deg, var(--bg-primary), var(--bg-secondary));
        border-radius: var(--radius-lg);
        padding: var(--space-6);
        border: 1px solid var(--border-light);
      }

      .gc-recipe-pro .gc-add-line-type-bar {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-6);
        background: var(--bg-tertiary);
        padding: var(--space-1);
        border-radius: var(--radius-full);
        border: 1px solid var(--border-light);
      }

      .gc-recipe-pro .gc-type-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-full);
        border: none;
        background: transparent;
        color: var(--text-light);
        font-weight: var(--font-bold);
        font-size: var(--text-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .gc-recipe-pro .gc-type-btn.active {
        background: var(--bg-primary);
        color: var(--primary-dark);
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--border-light);
      }

      .gc-recipe-pro .gc-type-btn:hover:not(.active) {
        background: rgba(255, 255, 255, 0.7);
        color: var(--primary);
      }

      /* === أنماط الشبكة === */
      .gc-recipe-pro .gc-grid-4 {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-5);
      }

      .gc-recipe-pro .gc-pricing-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-4);
        margin-top: var(--space-4);
      }

      .gc-recipe-pro .gc-quantity-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: var(--space-4);
        margin-top: var(--space-4);
      }

      /* === أنماط التحذيرات === */
      .gc-recipe-pro .gc-warning-banner {
        margin-top: var(--space-4);
        padding: var(--space-4) var(--space-5);
        border-radius: var(--radius-lg);
        border: 1px solid rgba(239, 68, 68, 0.2);
        background: rgba(239, 68, 68, 0.03);
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        animation: slideIn 0.3s ease;
      }

      .gc-warning-title {
        font-size: var(--text-xs);
        letter-spacing: 0.1em;
        font-weight: var(--font-extrabold);
        color: var(--color-error);
        margin-bottom: var(--space-1);
      }

      /* === أنماط الخطوات === */
      .steps-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-4);
        margin-top: var(--space-2);
      }

      @media (max-width: 1024px) {
        .steps-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .gc-recipe-pro .gc-grid-4,
        .gc-recipe-pro .gc-pricing-grid,
        .gc-recipe-pro .gc-quantity-grid {
          grid-template-columns: 1fr;
        }
      }
      
      @media (max-width: 640px) {
        .steps-grid {
          grid-template-columns: 1fr;
        }
      }

      /* === أنماط إضافية === */
      .gc-flash-row {
        animation: excel-flash 0.5s ease;
      }

      @keyframes excel-flash {
        0%, 100% { background: transparent; }
        50% { background: rgba(20, 184, 166, 0.1); }
      }

      .gc-recipe-pro .gc-empty-state {
        text-align: center;
        padding: var(--space-12) var(--space-5);
        background: linear-gradient(145deg, var(--bg-secondary), var(--bg-primary));
        border-radius: var(--radius-2xl);
        border: 2px dashed var(--border-light);
      }

      .gc-recipe-pro .gc-btn-primary-modern {
        padding: var(--space-3) var(--space-8);
        border-radius: var(--radius-full);
        border: none;
        background: linear-gradient(135deg, var(--primary), var(--primary-dark));
        color: white;
        font-weight: var(--font-bold);
        font-size: var(--text-sm);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        box-shadow: var(--shadow-sm);
        transition: all var(--transition-fast);
      }

      .gc-recipe-pro .gc-btn-primary-modern:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .gc-recipe-pro .gc-btn-secondary-modern {
        padding: var(--space-3) var(--space-8);
        border-radius: var(--radius-full);
        border: 2px solid var(--border-light);
        background: var(--bg-primary);
        color: var(--text);
        font-weight: var(--font-semibold);
        font-size: var(--text-sm);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        transition: all var(--transition-fast);
      }

      .gc-recipe-pro .gc-btn-secondary-modern:hover {
        border-color: var(--primary);
        color: var(--primary);
        transform: translateY(-1px);
      }

      .gc-recipe-pro .gc-meta-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-lg);
        padding: var(--space-5);
        transition: all var(--transition-fast);
        height: 100%;
      }

      .gc-recipe-pro .gc-meta-card:hover {
        border-color: rgba(20, 184, 166, 0.25);
        box-shadow: var(--shadow-sm);
      }

      .gc-recipe-pro .gc-label {
        font-size: var(--text-xs);
        font-weight: var(--font-extrabold);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-light);
        margin-bottom: var(--space-2);
      }

      .gc-recipe-pro .gc-hint {
        font-size: var(--text-sm);
        color: var(--text-light);
        line-height: 1.5;
      }

      /* === أنماط الطباعة === */
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
          color: var(--color-neutral-800);
          background: white;
        }

        .gc-print-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15mm;
          border-bottom: 2px solid var(--primary);
          padding-bottom: 8mm;
          margin-bottom: 8mm;
        }

        .gc-print-name {
          font-size: 28pt;
          font-weight: var(--font-extrabold);
          color: var(--primary-dark);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .gc-print-sub {
          font-size: 12pt;
          color: var(--text-light);
          margin-top: 4mm;
        }

        .gc-print-photo {
          width: 70mm;
          height: 50mm;
          border: 2px solid var(--primary);
          border-radius: 8mm;
          overflow: hidden;
          background: var(--bg-secondary);
          box-shadow: var(--shadow-sm);
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
          font-weight: var(--font-extrabold);
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4mm;
          border-bottom: 1px solid rgba(20, 184, 166, 0.2);
          padding-bottom: 2mm;
        }

        .gc-print-text {
          font-size: 11pt;
          line-height: 1.6;
          color: var(--color-neutral-800);
          white-space: pre-wrap;
        }

        .gc-print-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
          font-size: 10pt;
          table-layout: fixed;
        }

        .gc-print-table th {
          text-align: left;
          padding: 3mm 2mm;
          background: var(--bg-secondary);
          font-weight: var(--font-extrabold);
          color: var(--primary);
          border-bottom: 2px solid var(--primary);
        }

        .gc-print-table td {
          padding: 2.5mm 2mm;
          border-bottom: 1px solid var(--border-light);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gc-print-kpis {
          display: flex;
          gap: 4mm;
          flex-wrap: wrap;
          margin-top: 4mm;
        }

        .gc-print-chip {
          border: 1px solid var(--primary);
          border-radius: var(--radius-full);
          padding: 2mm 4mm;
          font-size: 10pt;
          font-weight: var(--font-bold);
          color: var(--primary);
          background: white;
        }
      }

      .gc-print-only {
        display: none;
      }

      /* === Utility Classes === */
      .flex { display: flex; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .gap-1 { gap: var(--space-1); }
      .gap-2 { gap: var(--space-2); }
      .gap-3 { gap: var(--space-3); }
      .gap-4 { gap: var(--space-4); }
      .mb-2 { margin-bottom: var(--space-2); }
      .mb-3 { margin-bottom: var(--space-3); }
      .mb-4 { margin-bottom: var(--space-4); }
      .mt-1 { margin-top: var(--space-1); }
      .mt-2 { margin-top: var(--space-2); }
      .p-2 { padding: var(--space-2); }
      .p-3 { padding: var(--space-3); }
      .px-3 { padding-left: var(--space-3); padding-right: var(--space-3); }
      .py-1 { padding-top: var(--space-1); padding-bottom: var(--space-1); }
      .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
      .rounded-lg { border-radius: var(--radius-lg); }
      .rounded-xl { border-radius: var(--radius-xl); }
      .rounded-full { border-radius: var(--radius-full); }
      .border { border-width: 1px; }
      .border-2 { border-width: 2px; }
      .border-dashed { border-style: dashed; }
      .bg-amber-50 { background: var(--color-secondary-50); }
      .border-amber-200 { border-color: var(--color-secondary-200); }
      .text-amber-600 { color: var(--color-secondary-600); }
      .text-amber-700 { color: var(--color-secondary-700); }
      .text-xs { font-size: var(--text-xs); }
      .text-sm { font-size: var(--text-sm); }
      .text-\\[10px\\] { font-size: 10px; }
      .text-\\[11px\\] { font-size: 11px; }
      .font-semibold { font-weight: var(--font-semibold); }
      .font-bold { font-weight: var(--font-bold); }
      .font-medium { font-weight: var(--font-medium); }
      .tracking-wider { letter-spacing: 0.05em; }
      .uppercase { text-transform: uppercase; }
      .w-2 { width: var(--space-2); }
      .w-4 { width: var(--space-4); }
      .w-8 { width: var(--space-8); }
      .h-2 { height: var(--space-2); }
      .h-4 { height: var(--space-4); }
      .h-8 { height: var(--space-8); }
      .min-h-\\[80px\\] { min-height: 80px; }
      .space-y-1 > * + * { margin-top: var(--space-1); }
      .space-y-2 > * + * { margin-top: var(--space-2); }
      .space-y-3 > * + * { margin-top: var(--space-3); }
      .space-y-4 > * + * { margin-top: var(--space-4); }
      .pl-4 { padding-left: var(--space-4); }
      .pl-10 { padding-left: var(--space-10); }
      .list-disc { list-style-type: disc; }
      .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      .font-mono { font-family: 'Courier New', monospace; }
      .text-primary { color: var(--primary); }
      .bg-primary\\/10 { background: rgba(20, 184, 166, 0.1); }
      .bg-primary\\/20 { background: rgba(20, 184, 166, 0.2); }
      .border-primary\\/20 { border-color: rgba(20, 184, 166, 0.2); }
      .from-primary { --tw-gradient-from: var(--primary); }
      .to-primary-dark { --tw-gradient-to: var(--primary-dark); }
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
          table-layout: fixed;
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
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
      {NeoStyles}

      <div className="gc-card gc-screen-only gc-recipe-pro">
        <div className="gc-card-head gc-recipe-pro-head">
          {headerLeft}
          {headerRight}
        </div>

        <div className="gc-card-body">
          {err && (
            <div className="gc-card-soft" style={{ padding: 12, borderRadius: 16, marginBottom: 12, background: '#fee2e2', border: '1px solid #fecaca' }}>
              <div className="flex items-center gap-2 text-red-700">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span style={{ fontWeight: 900 }}>{err}</span>
              </div>
            </div>
          )}

          {/* Print Section */}
          <div className="gc-section gc-card-soft">
            <div style={{ padding: 14 }} className="gc-highlight-head">
              <div>
                <div className="gc-label flex items-center gap-2" id="sec-print">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 9V3h12v6" />
                    <rect x="6" y="15" width="12" height="6" rx="2" />
                  </svg>
                  PRINT (A4)
                </div>
                <div className="gc-hint" style={{ marginTop: 6 }}>Professional chef-ready A4 print. No overflow.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="gc-btn gc-btn-secondary flex items-center gap-2" type="button" onClick={printNow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 9V3h12v6" />
                    <rect x="6" y="15" width="12" height="6" rx="2" />
                  </svg>
                  Print now
                </button>
                <button className="gc-btn gc-btn-primary flex items-center gap-2" type="button" onClick={exportExcel}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="16" x2="16" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Export Excel
                </button>
                <button
                  className="gc-btn gc-btn-ghost"
                  type="button"
                  onClick={() => (id ? window.open(`#/print?id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer') : null)}
                  disabled={!id}
                >
                  Open Print Page
                </button>

                <div className={`gc-hint flex items-center gap-1 ${savePulse ? 'text-primary' : ''}`} style={{ marginLeft: 6 }}>
                  <span className={`w-2 h-2 rounded-full ${savePulse ? 'bg-primary animate-pulse' : 'bg-green-500'}`} />
                  {savePulse ? 'Auto-saving…' : 'Auto-save ready.'}
                </div>
              </div>
            </div>
          </div>

          {/* Cook Mode Section */}
          <div className="gc-section gc-section-alt gc-card-soft">
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="gc-label flex items-center gap-2" id="sec-cook">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                  </svg>
                  COOK MODE
                </div>
                <div className="gc-hint" style={{ marginTop: 6 }}>Zero distraction cooking workflow.</div>
              </div>
              <button className="gc-btn gc-btn-primary gc-btn-hero flex items-center gap-2" type="button" onClick={() => (id ? navigate(`/cook?id=${encodeURIComponent(id)}`) : null)} disabled={!id}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
                Open Cook Mode
              </button>
            </div>
          </div>

          {/* KPI Section */}
          {showCost && (
            <div className="gc-section gc-card-soft" style={{ padding: 14, borderRadius: 18 }}>
              <div className="gc-highlight-head">
                <div>
                  <div className="gc-label flex items-center gap-2" id="sec-cost">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="6" x2="12" y2="12" />
                      <line x1="12" y1="12" x2="16" y2="14" />
                    </svg>
                    KPI
                  </div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>Live recipe performance overview.</div>
                </div>
                <div className="gc-hint flex items-center gap-1" style={{ fontWeight: 800 }}>
                  <span>Currency:</span>
                  <span className="px-2 py-1 bg-primary/10 rounded-full text-primary">{cur}</span>
                </div>
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
                    <div style={{ fontWeight: 900, color: 'var(--accent)' }}>{totals.warnings[0]}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Pricing Section */}
          {showCost && (
            <div className="gc-section gc-section-alt gc-card-soft">
              <div style={{ padding: 14 }}>
                <div className="gc-highlight-head">
                  <div>
                    <div className="gc-label flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="6" x2="12" y2="12" />
                        <line x1="12" y1="12" x2="16" y2="14" />
                      </svg>
                      PRICING / PORTION
                    </div>
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

          {/* Nutrition Section */}
          <div className="gc-section gc-section-alt gc-card-soft">
            <div style={{ padding: 12 }}>
              <div className="gc-label flex items-center gap-2" id="sec-nutrition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M12 12l8-8M12 12l-8-8M12 12l8 8M12 12l-8 8" />
                </svg>
                NUTRITION / PORTION
              </div>
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

              <div className="gc-hint flex items-center gap-1" style={{ marginTop: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Manual fields (no auto nutrition calc).
              </div>
            </div>
          </div>

          {/* Meta Section - Basic Information */}
          <div id="sec-basics" className="gc-section gc-card">
            <div className="gc-card-head">
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="gc-label flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    BASIC INFORMATION
                  </div>
                  <div className="gc-hint" style={{ marginTop: 6 }}>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Auto-save enabled • Labels above inputs
                    </span>
                  </div>
                </div>
                
                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20 text-xs font-semibold text-primary-dark flex items-center gap-1.5">
                    <span className={`w-2 h-2 ${savePulse ? 'bg-primary animate-pulse' : 'bg-green-500'} rounded-full`} />
                    {savePulse ? 'Saving...' : 'All changes saved'}
                  </div>
                </div>
              </div>
            </div>

            <div className="gc-card-body">
              <div className="grid-cols-12">
                {/* Recipe Code Section */}
                <div className="col-span-6">
                  <div className="gc-meta-card group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M16 3h5v5M14 10l6-6M4 21h5v-5M10 14l-6 6" />
                          <rect x="8" y="8" width="8" height="8" rx="2" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary-dark uppercase tracking-wider">
                          RECIPE CODE
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Unique identifier for this recipe
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                          CODE <span className="text-neutral-400 font-normal">(auto-generated if empty)</span>
                        </label>
                        <div className="relative">
                          <input 
                            className={`gc-input pl-10 ${!canEditCodes ? "opacity-60 cursor-not-allowed bg-neutral-50" : ""}`} 
                            value={code} 
                            onChange={(e) => setCode(e.target.value.toUpperCase())} 
                            placeholder="PREP-003"
                            disabled={!canEditCodes} 
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                            #
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                          CODE CATEGORY <span className="text-neutral-400 font-normal">(max 6 chars)</span>
                        </label>
                        <div className="relative">
                          <input 
                            className={`gc-input pl-10 ${!canEditCodes ? "opacity-60 cursor-not-allowed bg-neutral-50" : ""}`} 
                            value={codeCategory} 
                            onChange={(e) => setCodeCategory(e.target.value.toUpperCase())} 
                            placeholder="BASEGR"
                            maxLength={6}
                            disabled={!canEditCodes} 
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                            📂
                          </div>
                        </div>
                      </div>

                      {!canEditCodes && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <span className="text-amber-600 text-sm">🔒</span>
                            <span className="text-[11px] text-amber-700">Code fields are editable by Kitchen Owners only</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recipe Identity Section */}
                <div className="col-span-6">
                  <div className="gc-meta-card group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary-dark uppercase tracking-wider">
                          RECIPE IDENTITY
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Basic identification details
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                          NAME <span className="text-red-500">*</span>
                        </label>
                        <input 
                          className="gc-input" 
                          value={name} 
                          onChange={(e) => setName(e.target.value)} 
                          placeholder="Chop Masala"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                            CATEGORY
                          </label>
                          <select 
                            className="gc-select"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
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
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                            PORTIONS
                          </label>
                          <div className="relative">
                            <input 
                              className="gc-input pl-10" 
                              value={portions} 
                              onChange={(e) => setPortions(e.target.value)} 
                              inputMode="numeric"
                              placeholder="1"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">
                              👥
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description Section */}
                <div className="col-span-12">
                  <div className="gc-meta-card">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary-dark uppercase tracking-wider">
                          DESCRIPTION
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Brief overview of the recipe
                        </div>
                      </div>
                    </div>
                    <textarea 
                      className="gc-textarea min-h-[80px]" 
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)} 
                      placeholder="Write a short description of this recipe..."
                      maxLength={500}
                    />
                    <div className="mt-1 text-right">
                      <span className="text-[10px] text-neutral-400">
                        {description.length}/500 characters
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recipe Photo Section */}
                <div className="col-span-12">
                  <div className="gc-meta-card">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="2" width="20" height="20" rx="2.18" />
                            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                            <path d="M21 15l-5-5L7 21" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-primary-dark uppercase tracking-wider">
                            RECIPE PHOTO
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            Upload from Supabase bucket: <span className="font-mono">{PHOTO_BUCKET}</span>
                          </div>
                        </div>
                      </div>
                      
                      {uploading && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-medium text-primary">Uploading...</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-6 flex-wrap items-start">
                      <div className="relative w-[200px] h-[150px] rounded-xl overflow-hidden border-2 border-dashed border-primary/20 group hover:border-primary/40 transition-all">
                        {recipe?.photo_url ? (
                          <>
                            <img 
                              src={recipe.photo_url} 
                              alt="Recipe" 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button 
                                className="px-3 py-1.5 bg-white rounded-lg text-xs font-medium"
                                onClick={() => {
                                  document.getElementById('photo-upload')?.click()
                                }}
                              >
                                Change
                              </button>
                            </div>
                          </>
                        ) : (
                          <label 
                            htmlFor="photo-upload" 
                            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-neutral-50 hover:bg-neutral-100 transition-colors"
                          >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                              <rect x="2" y="2" width="20" height="20" rx="2.18" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                              <path d="M21 15l-5-5L7 21" />
                            </svg>
                            <span className="mt-2 text-xs text-neutral-500">Click to upload</span>
                            <span className="text-[10px] text-neutral-400">PNG/JPG recommended</span>
                          </label>
                        )}
                      </div>

                      <div className="flex-1 space-y-3">
                        <input
                          id="photo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            uploadRecipePhoto(f).catch(() => {})
                            e.currentTarget.value = ''
                          }}
                        />
                        
                        <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                          <div className="text-[11px] font-medium text-neutral-600 mb-2">Upload tips:</div>
                          <ul className="text-[10px] text-neutral-500 space-y-1 list-disc pl-4">
                            <li>Recommended size: 1200 x 800px</li>
                            <li>Max file size: 5MB</li>
                            <li>Supported formats: JPG, PNG, WebP</li>
                          </ul>
                        </div>

                        {recipe?.photo_url && (
                          <button 
                            className="text-xs text-primary hover:text-primary-dark font-medium"
                            onClick={() => {
                              if (window.confirm('Remove recipe photo?')) {
                                setRecipe(prev => prev ? { ...prev, photo_url: null } : prev)
                                showToast('Photo removed')
                              }
                            }}
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subrecipe Settings */}
                <div className="col-span-12">
                  <div className="gc-meta-card">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 7h16M4 12h16M4 17h10" />
                          <rect x="14" y="15" width="6" height="6" rx="1" stroke="currentColor" />
                          <line x1="17" y1="12" x2="17" y2="15" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-secondary-dark uppercase tracking-wider">
                          SUBRECIPE SETTINGS
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          If enabled, this recipe can be used as a component inside other recipes.
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4">
                      {/* IS SUBRECIPE */}
                      <div className="col-span-12 md:col-span-4">
                        <div className="bg-gradient-to-br from-secondary/5 to-transparent rounded-xl p-4 border border-secondary/10">
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-3">
                            IS SUBRECIPE
                          </label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="isSubRecipe"
                                checked={isSubRecipe}
                                onChange={() => setIsSubRecipe(true)}
                                className="w-4 h-4 text-secondary border-secondary/30 focus:ring-secondary/20"
                              />
                              <span className="text-sm font-medium">Yes</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="isSubRecipe"
                                checked={!isSubRecipe}
                                onChange={() => setIsSubRecipe(false)}
                                className="w-4 h-4 text-secondary border-secondary/30 focus:ring-secondary/20"
                              />
                              <span className="text-sm font-medium">No</span>
                            </label>
                          </div>
                          <div className="mt-2 text-[10px] text-neutral-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-secondary rounded-full" />
                            {isSubRecipe ? 'Recipe can be used in other recipes' : 'Recipe cannot be used as a subrecipe'}
                          </div>
                        </div>
                      </div>

                      {/* YIELD QUANTITY */}
                      <div className="col-span-6 md:col-span-4">
                        <div className="bg-white rounded-xl p-4 border border-neutral-200 hover:border-secondary/30 transition-colors">
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                            YIELD QUANTITY
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={yieldQty}
                              onChange={(e) => setYieldQty(e.target.value)}
                              placeholder="0.0"
                              className="gc-yield-quantity-input"
                              disabled={!isSubRecipe}
                            />
                            <div className="gc-yield-quantity-unit">
                              {yieldUnit}
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] text-neutral-400 flex items-center justify-between">
                            <span>Total yield of this recipe</span>
                            <span className="text-secondary">Required for subrecipes</span>
                          </div>
                        </div>
                      </div>

                      {/* YIELD UNIT */}
                      <div className="col-span-6 md:col-span-4">
                        <div className="bg-white rounded-xl p-4 border border-neutral-200 hover:border-secondary/30 transition-colors">
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                            YIELD UNIT
                          </label>
                          <select
                            value={yieldUnit}
                            onChange={(e) => setYieldUnit(e.target.value as any)}
                            className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all appearance-none bg-white"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23C17B4A'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 1rem center',
                              backgroundSize: '1.5rem'
                            }}
                            disabled={!isSubRecipe}
                          >
                            <option value="g">g (gram)</option>
                            <option value="kg">kg (kilogram)</option>
                            <option value="ml">ml (milliliter)</option>
                            <option value="l">l (liter)</option>
                            <option value="pcs">pcs (pieces)</option>
                          </select>
                          <div className="mt-1.5 text-[10px] text-neutral-400">
                            Unit of measurement for the yield
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* معلومات إضافية عند تفعيل subrecipe */}
                    {isSubRecipe && (
                      <div className="mt-4 p-4 bg-secondary/5 rounded-xl border border-secondary/20">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-secondary text-xs">✓</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-secondary-dark mb-1">
                              Subrecipe Mode Active
                            </div>
                            <div className="text-xs text-neutral-600">
                              This recipe is now available as a component in other recipes. When used as a subrecipe, 
                              the system will use the yield quantity ({yieldQty || '0'} {yieldUnit}) to calculate 
                              the cost and quantity in parent recipes.
                            </div>
                            {(!yieldQty || parseFloat(yieldQty) <= 0) && (
                              <div className="mt-2 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                <span className="text-sm">⚠️</span>
                                <span className="text-xs font-medium">Please set a valid yield quantity for accurate subrecipe calculations</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ADD LINE Section */}
          <div style={{ marginTop: 14 }} className="gc-card">
            <div className="gc-card-head">
              <div className="gc-label flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                ADD LINE
              </div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Smart rule: edit <b>Gross</b> → yield auto. edit <b>Yield%</b> → clears gross override.
              </div>
            </div>

            <div className="gc-card-body">
              <div className="gc-add-line-modern">
                <div className="gc-add-line-type-bar">
                  <button
                    className={cx("gc-type-btn", addType === 'ingredient' && "active")}
                    onClick={() => setAddType('ingredient')}
                    type="button"
                  >
                    <span className="gc-type-icon">🥗</span>
                    <span>Ingredient</span>
                  </button>
                  <button
                    className={cx("gc-type-btn", addType === 'subrecipe' && "active")}
                    onClick={() => setAddType('subrecipe')}
                    type="button"
                  >
                    <span className="gc-type-icon">📋</span>
                    <span>Subrecipe</span>
                  </button>
                  <button
                    className={cx("gc-type-btn", addType === 'group' && "active")}
                    onClick={() => setAddType('group')}
                    type="button"
                  >
                    <span className="gc-type-icon">📌</span>
                    <span>Group</span>
                  </button>
                </div>

                {addType !== 'group' && (
                  <div className="gc-add-line-search-section">
                    <div className="gc-search-field">
                      <svg className="gc-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        className="gc-search-input"
                        value={ingSearch}
                        onChange={(e) => setIngSearch(e.target.value)}
                        placeholder={`Search ${addType === 'ingredient' ? 'ingredients' : 'subrecipes'}...`}
                      />
                    </div>

                    <div className="gc-select-wrapper">
                      <select
                        className="gc-modern-select"
                        value={addType === 'ingredient' ? addIngredientId : addSubRecipeId}
                        onChange={(e) => {
                          if (addType === 'ingredient') {
                            setAddIngredientId(e.target.value)
                          } else {
                            setAddSubRecipeId(e.target.value)
                          }
                        }}
                      >
                        <option value="">— Select {addType === 'ingredient' ? 'ingredient' : 'subrecipe'} —</option>
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
                )}

                {addType === 'group' && (
                  <div className="gc-group-title-field">
                    <input
                      className="gc-modern-input gc-group-input"
                      value={addGroupTitle}
                      onChange={(e) => setAddGroupTitle(e.target.value)}
                      placeholder="Enter group title (e.g. Sauce, Toppings, Marinade)..."
                    />
                  </div>
                )}

                {addType !== 'group' && (
                  <div className="gc-add-line-quantities">
                    <div className="gc-quantity-grid">
                      <div className="gc-quantity-field">
                        <label className="gc-field-label">NET</label>
                        <div className="gc-input-unit-group">
                          <input
                            className="gc-modern-input gc-number-input gc-number-input-inline"
                            value={addNetQty}
                            onChange={(e) => setAddNetQty(e.target.value)}
                            inputMode="decimal"
                            placeholder="0.000"
                          />
                          <span className="gc-unit-badge">qty</span>
                        </div>
                      </div>

                      <div className="gc-quantity-field">
                        <label className="gc-field-label">UNIT</label>
                        <select
                          className="gc-modern-select gc-unit-select"
                          value={addUnit}
                          onChange={(e) => setAddUnit(e.target.value)}
                        >
                          <option value="g">g (gram)</option>
                          <option value="kg">kg (kilogram)</option>
                          <option value="ml">ml (milliliter)</option>
                          <option value="l">l (liter)</option>
                          <option value="pcs">pcs (pieces)</option>
                          <option value="tbsp">tbsp</option>
                          <option value="tsp">tsp</option>
                          <option value="cup">cup</option>
                        </select>
                      </div>

                      <div className="gc-quantity-field">
                        <label className="gc-field-label">YIELD %</label>
                        <div className="gc-input-unit-group">
                          <input
                            className="gc-modern-input gc-number-input gc-number-input-inline"
                            value={addYield}
                            onChange={(e) => setAddYield(e.target.value)}
                            inputMode="decimal"
                            placeholder="100"
                          />
                          <span className="gc-unit-badge">%</span>
                        </div>
                        <div className="gc-field-hint">edit → auto gross</div>
                      </div>

                      <div className="gc-quantity-field">
                        <label className="gc-field-label">GROSS</label>
                        <div className="gc-input-unit-group">
                          <input
                            className="gc-modern-input gc-number-input gc-number-input-inline"
                            value={addGross}
                            onChange={(e) => setAddGross(e.target.value)}
                            inputMode="decimal"
                            placeholder="auto"
                          />
                          <span className="gc-unit-badge">{addUnit || 'g'}</span>
                        </div>
                        <div className="gc-field-hint">optional • auto from yield</div>
                      </div>

                      <div className="gc-quantity-field gc-note-field">
                        <label className="gc-field-label">NOTE</label>
                        <input
                          className="gc-modern-input"
                          value={addNote}
                          onChange={(e) => setAddNote(e.target.value)}
                          placeholder="e.g. Chopped, Powdered, Fresh..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="gc-add-line-actions-modern">
                  <button
                    className="gc-btn-primary-modern"
                    type="button"
                    onClick={addLineLocal}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add {addType === 'group' ? 'Group' : 'Line'}
                  </button>
                  <button
                    className="gc-btn-secondary-modern"
                    type="button"
                    onClick={() => { saveLinesNow().catch(() => { }) }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Lines
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* LINES Section */}
          <div style={{ marginTop: 14 }} className="gc-card">
            <div className="gc-card-head">
              <div className="gc-label flex items-center gap-2" id="sec-lines">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                LINES
              </div>
              <div className="gc-hint" style={{ marginTop: 6 }}>
                Edit Net/Gross/Yield safely. Groups have no cost.
              </div>
            </div>

            <div className="gc-card-body">
              {!visibleLines.length ? (
                <div className="gc-empty-state">
                  <div className="gc-empty-icon">📝</div>
                  <div className="gc-empty-title">No ingredients yet</div>
                  <div className="gc-empty-description">Start adding ingredients, subrecipes, or groups using the form above</div>
                </div>
              ) : (
                <div className="gc-lines-container">
                  <div className="gc-table-toolbar">
                    <div className="gc-table-info">
                      <span className="gc-table-count">{visibleLines.length} items</span>
                      {visibleLines.filter(l => l.line_type === 'group').length > 0 && (
                        <span className="gc-table-badge">{visibleLines.filter(l => l.line_type === 'group').length} groups</span>
                      )}
                    </div>
                  </div>

                  <table className="gc-excel-table">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      {showCost ? <col /> : null}
                      <col />
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
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((l) => {
                        const c = lineComputed.get(l.id)
                        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                        const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

                        if (l.line_type === 'group') {
                          return (
                            <tr key={l.id} className={cx("gc-group-row", flashLineId === l.id && "gc-flash-row")}>
                              <td colSpan={tableColSpan} className="gc-group-cell">
                                <div className="gc-group-content">
                                  <div className="gc-group-title">
                                    <span className="gc-group-icon">📁</span>
                                    <span className="gc-group-name">{l.group_title || 'Untitled Group'}</span>
                                    <span className="gc-group-badge">Group</span>
                                  </div>
                                  <div className="gc-group-actions">
                                    <button
                                      className="gc-action-btn"
                                      type="button"
                                      onClick={() => duplicateLineLocal(l.id)}
                                      title="Duplicate group"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                    </button>
                                    <button
                                      className="gc-action-btn gc-action-btn-danger"
                                      type="button"
                                      onClick={() => deleteLineLocal(l.id)}
                                      title="Delete group"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }

                        return (
                          <tr
                            key={l.id}
                            className={cx(
                              flashLineId === l.id && "gc-flash-row",
                              l.notes && "has-note"
                            )}
                          >
                            <td>
                              <span className="gc-code-cell" title={l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')}>
                                {l.line_type === 'ingredient'
                                  ? (ing?.code || '—')
                                  : (sub?.code || '—')}
                              </span>
                            </td>

                            <td>
                              <div className="gc-ingredient-cell">
                                <span className="gc-ingredient-name" title={l.line_type === 'ingredient' ? (ing?.name || 'Unknown Ingredient') : (sub?.name || 'Unknown Subrecipe')}>
                                  {l.line_type === 'ingredient'
                                    ? (ing?.name || 'Unknown Ingredient')
                                    : (sub?.name || 'Unknown Subrecipe')}
                                </span>
                                {l.notes && (
                                  <span className="gc-ingredient-note" title={l.notes}>
                                    <span>📝</span> {l.notes}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td>
                              <div className="gc-input-wrapper">
                                <input
                                  className="gc-number-input"
                                  value={fmtQty(toNum(l.qty, 0))}
                                  onChange={(e) => onNetChange(l.id, e.target.value)}
                                  inputMode="decimal"
                                />
                              </div>
                            </td>

                            <td>
                              <span className="gc-unit-cell">{l.unit || 'g'}</span>
                            </td>

                            <td>
                              <div className="gc-input-wrapper">
                                <input
                                  className="gc-number-input"
                                  value={l.gross_qty_override != null ? fmtQty(l.gross_qty_override) : ''}
                                  onChange={(e) => onGrossChange(l.id, e.target.value)}
                                  inputMode="decimal"
                                  placeholder={c ? fmtQty(c.gross) : ''}
                                />
                              </div>
                            
