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
      return 'comfort'
    } catch {
      return 'comfort'
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-density', density)
      localStorage.setItem('gc_density', density)
    } catch {}
  }, [density])

  const [activeSection, setActiveSection] = useState<string>('sec-basics')
  useEffect(() => {
    const ids = ['sec-basics', 'sec-method', 'sec-nutrition', 'sec-lines', 'sec-print', 'sec-cook', 'sec-cost']
    const els = ids.map((x) => document.getElementById(x)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => (b.intersectionRatio - a.intersectionRatio))
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

  const visibleLines = useMemo(() => [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [lines])

  const filteredIngredients = useMemo(() => {
    const s = ingSearch.trim().toLowerCase()
    let list = ingredients
    if (s) list = list.filter((i) => (i.name || '').toLowerCase().includes(s))
    return list.slice(0, 60)
  }, [ingredients, ingSearch])

  const subRecipeOptions = useMemo(() => {
    return allRecipes.filter((r) => !!r.is_subrecipe && !r.is_archived).slice(0, 200)
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
  useEffect(() => { recipeRef.current = recipe }, [recipe])
  useEffect(() => { linesRef.current = lines }, [lines])

  const deletedLineIdsRef = useRef<string[]>([])
  const isDraftLine = useCallback((l: Line) => (l?.id || '').startsWith('tmp_'), [])

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
          .select('id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct')
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
          .select('id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title')
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
        autosave.setError(e?.message || 'Failed to load recipe.')
        if (!alive) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }

    load().catch(() => {})
    return () => { alive = false }
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
    const res = new Map<string, { net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; warnings: string[] }>()

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

      res.set(l.id, { net, gross, yieldPct, unitCost, lineCost: Number.isFinite(lineCost) ? lineCost : 0, warnings })
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

    return { totalCost, cpp, fcPct, margin, marginPct, warnings: Array.from(new Set(warnings)).slice(0, 4) }
  }, [lines, lineComputed, portions, sellingPrice])

  const [savingMeta, setSavingMeta] = useState(false)
  const [savingLines, setSavingLines] = useState(false)
  const [savePulse, setSavePulse] = useState(false)

  useEffect(() => {
    const active = savingMeta || savingLines
    if (active) {
      setSavePulse(true)
      return
    }
    const t = window.setTimeout(() => setSavePulse(false), 700)
    return () => window.clearTimeout(t)
  }, [savingMeta, savingLines])

  const saveLinesNow = useCallback(async (override?: Line[]): Promise<boolean> => {
    if (!id) return false
    const rid = id
    const kitchenId = recipeRef.current?.kitchen_id ?? k.kitchenId ?? null
    if (!kitchenId) {
      setErr('Kitchen not resolved yet.')
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
      writeDraftLines(rid, ((override ?? linesRef.current) || []) as Line[])
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
    const t = window.setTimeout(() => saveLinesNow().catch(() => {}), 650)
    return () => window.clearTimeout(t)
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
      const copy: Line = { ...src, id: uid(), position: maxPos + 1 }

      const next = [...cur, copy].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
      linesRef.current = next
      setLinesSafe(next)
      saveLinesNow(next).catch(() => {})
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
      saveLinesNow(next).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )

  const buildMetaPatch = useCallback(() => {
    return {
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
  }, [code, codeCategory, name, category, portions, description, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC, isSubRecipe, yieldQty, yieldUnit])

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
    const t = window.setTimeout(() => saveMetaNow().catch(() => {}), 650)
    return () => window.clearTimeout(t)
  }, [id, saveMetaNow])

  const metaHydratedRef = useRef(false)
  useEffect(() => {
    if (!recipe) return
    if (!metaHydratedRef.current) {
      metaHydratedRef.current = true
      return
    }
    scheduleMetaSave()
  }, [code, codeCategory, name, category, portions, description, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC, isSubRecipe, yieldQty, yieldUnit, recipe, scheduleMetaSave])

  const addLineLocal = useCallback(async () => {
    if (!id) return
    const rid = id

    const basePos = (linesRef.current?.length || 0) + 1
    const yRaw = clamp(toNum(addYield, 100), 0.0001, 100)
    const net = Math.max(0, toNum(addNetQty, 0))
    const gross = addGross.trim() === '' ? null : Math.max(0, toNum(addGross, 0))
    const y = gross != null && gross > 0 && net >= 0 ? clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100) : yRaw

    if (addType === 'ingredient') {
      if (!addIngredientId) { setErr('Pick an ingredient first.'); return }
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
        setAddNote(''); setAddNetQty('1'); setAddGross(''); setAddYield('100'); setAddIngredientId(''); setIngSearch('')
      } else {
        showToast('Could not save line yet. It is kept locally.')
      }
      return
    }

    if (addType === 'subrecipe') {
      if (!addSubRecipeId) { setErr('Pick a subrecipe first.'); return }
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
      showToast(ok ? 'Subrecipe line added & saved.' : 'Subrecipe line added — saved locally.')
      if (ok) { setAddNote(''); setAddNetQty('1'); setAddGross(''); setAddYield('100'); setAddSubRecipeId(''); setIngSearch('') }
      return
    }

    const title = (addGroupTitle || '').trim()
    if (!title) { setErr('Enter group title.'); return }
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
    showToast(ok ? 'Group added & saved.' : 'Group added — saved locally.')
    if (ok) setAddGroupTitle('')
  }, [id, addType, addIngredientId, addSubRecipeId, addGroupTitle, addNetQty, addUnit, addYield, addGross, addNote, setLinesSafe, saveLinesNow, showToast, k.kitchenId])

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
      if (raw === '') { updateLine(lineId, { gross_qty_override: null }); return }
      const gross = Math.max(0, toNum(raw, 0))
      if (gross <= 0) { updateLine(lineId, { gross_qty_override: null }); return }
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

  const onNoteChange = useCallback((lineId: string, value: string) => { updateLine(lineId, { notes: value || null }) }, [updateLine])

  const uploadRecipePhoto = useCallback(
    async (file: File) => {
      if (!id) return
      setErr(null)
      setUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${id}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true })
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
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        const url = pub?.publicUrl || ''
        setStepPhotos((prev) => { const next = [...prev]; next[stepIndex] = url; return next })
        showToast('Step photo updated.')
      } catch (e: any) {
        setErr(e?.message || 'Failed to upload step photo.')
      } finally {
        setStepUploading(false)
      }
    },
    [id, showToast]
  )

  const addStep = useCallback(() => {
    const s = (newStep || '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
  }, [newStep])

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx))
    setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const updateStep = useCallback((idx: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)))
  }, [])

  const addSnapshot = useCallback(() => {
    if (!id) return
    const p = Math.max(1, Math.floor(toNum(portions, 1)))
    addCostPoint(id, { createdAt: Date.now(), totalCost: totals.totalCost, cpp: totals.cpp, portions: p, currency: cur } as any)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshot added.')
  }, [id, portions, cur, totals.totalCost, totals.cpp, showToast])

  const clearSnapshots = useCallback(() => {
    if (!id) return
    if (!window.confirm('Clear all cost snapshots?')) return
    clearCostPoints(id)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshots cleared.')
  }, [id, showToast])

  const removeSnapshot = useCallback((pid: string) => {
    if (!id) return
    deleteCostPoint(id, pid)
    setCostPoints(listCostPoints(id))
    showToast('Snapshot removed.')
  }, [id, showToast])

  const printNow = useCallback(() => {
    if (!id) return
    window.open(`#/print?id=${encodeURIComponent(id)}&autoprint=1`, '_blank', 'noopener,noreferrer')
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
      const rows = lines.filter((l) => l.line_type !== 'group').map((l) => {
        const c = lineComputed.get(l.id)
        return {
          type: l.line_type === 'subrecipe' ? 'subrecipe' : 'ingredient',
          code: l.line_type === 'ingredient' ? (l.ingredient_id ? (ingById.get(l.ingredient_id) as any)?.code : null) || '' : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.code || ''),
          name: l.line_type === 'ingredient' ? (l.ingredient_id ? ingById.get(l.ingredient_id)?.name : null) || 'Ingredient' : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.name || 'Subrecipe'),
          net_qty: c?.net ?? 0,
          unit: l.unit || '',
          yield_percent: c?.yieldPct ?? 100,
          gross_qty: c?.gross ?? 0,
          unit_cost: c?.unitCost ?? 0,
          line_cost: c?.lineCost ?? 0,
          notes: l.notes || '',
          warnings: c?.warnings || [],
        }
      })
      await exportRecipeExcelUltra({ meta, totals: { totalCost: totals.totalCost, cpp: totals.cpp, fcPct: totals.fcPct, margin: totals.margin, marginPct: totals.marginPct }, lines: rows as any })
      showToast('Excel exported.')
    } catch (e: any) {
      console.error(e)
      showToast('Excel export failed.')
    }
  }, [id, name, category, portions, yieldQty, yieldUnit, currency, sellingPrice, targetFC, description, steps, stepPhotos, calories, protein, carbs, fat, lines, lineComputed, ingById, allRecipes, totals, showToast])

  if (loading) {
    return (
      <div className="ik-loading">
        <style>{loadingStyles}</style>
        <div className="ik-loading-inner">
          <div className="ik-loading-spinner"></div>
          <div className="ik-loading-text">Loading Recipe</div>
          <div className="ik-loading-bar"><div className="ik-loading-progress"></div></div>
        </div>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="ik-error-page">
        <style>{loadingStyles}</style>
        <div className="ik-error-icon">⚠</div>
        <div className="ik-error-title">No Recipe Selected</div>
        <div className="ik-error-text">Please select a recipe to edit.</div>
      </div>
    )
  }

  return (
    <>
      <style>{mainStyles}</style>
      
      <div className="ik-app">
        {/* Sidebar */}
        <aside className="ik-sidebar">
          <div className="ik-sidebar-header">
            <NavLink to="/recipes" className="ik-back-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </NavLink>
            <div className="ik-recipe-badge">{isSubRecipe ? 'SUB' : 'MAIN'}</div>
          </div>
          
          <div className="ik-sidebar-title">
            <h1>{(name || 'Untitled').trim()}</h1>
            <div className="ik-autosave">
              <span className={`ik-status-dot ${savePulse ? 'saving' : ''}`}></span>
              <span>{savePulse ? 'Saving...' : 'Auto-saved'}</span>
            </div>
          </div>

          <nav className="ik-nav">
            <button className={`ik-nav-item ${activeSection === 'sec-basics' ? 'active' : ''}`} onClick={() => scrollToSection('sec-basics')}>
              <span className="ik-nav-icon">◈</span>
              <span>Basics</span>
            </button>
            <button className={`ik-nav-item ${activeSection === 'sec-lines' ? 'active' : ''}`} onClick={() => scrollToSection('sec-lines')}>
              <span className="ik-nav-icon">▣</span>
              <span>Lines</span>
            </button>
            <button className={`ik-nav-item ${activeSection === 'sec-method' ? 'active' : ''}`} onClick={() => scrollToSection('sec-method')}>
              <span className="ik-nav-icon">☰</span>
              <span>Method</span>
            </button>
            {showCost && (
              <button className={`ik-nav-item ${activeSection === 'sec-cost' ? 'active' : ''}`} onClick={() => scrollToSection('sec-cost')}>
                <span className="ik-nav-icon">◆</span>
                <span>Cost</span>
              </button>
            )}
            <button className={`ik-nav-item ${activeSection === 'sec-nutrition' ? 'active' : ''}`} onClick={() => scrollToSection('sec-nutrition')}>
              <span className="ik-nav-icon">◎</span>
              <span>Nutrition</span>
            </button>
          </nav>

          <div className="ik-sidebar-actions">
            <button className="ik-action-btn" onClick={printNow} title="Print">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
            <button className="ik-action-btn" onClick={exportExcel} title="Export Excel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </button>
            <button className="ik-action-btn" onClick={() => navigate(`/cook?id=${encodeURIComponent(id)}`)} title="Cook Mode">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </button>
          </div>

          <div className="ik-sidebar-footer">
            <button className="ik-density-btn" onClick={() => setDensity(d => d === 'compact' ? 'comfort' : 'compact')}>
              {density === 'compact' ? '☰ Compact' : '≡ Comfort'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="ik-main">
          {err && (
            <div className="ik-error-banner">
              <span className="ik-error-icon-sm">⚠</span>
              <span>{err}</span>
              <button onClick={() => setErr(null)} className="ik-error-close">✕</button>
            </div>
          )}

          {/* KPI Section */}
          {showCost && (
            <section id="sec-cost" className="ik-section">
              <div className="ik-section-header">
                <h2 className="ik-section-title">COST ANALYSIS</h2>
                <span className="ik-currency-tag">{cur}</span>
              </div>
              <div className="ik-kpi-grid">
                <div className="ik-kpi">
                  <div className="ik-kpi-label">TOTAL COST</div>
                  <div className="ik-kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                </div>
                <div className="ik-kpi">
                  <div className="ik-kpi-label">COST/PORTION</div>
                  <div className="ik-kpi-value">{fmtMoney(totals.cpp, cur)}</div>
                </div>
                <div className="ik-kpi">
                  <div className="ik-kpi-label">FOOD COST %</div>
                  <div className={`ik-kpi-value ${totals.fcPct && totals.fcPct > 30 ? 'negative' : ''}`}>
                    {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="ik-kpi">
                  <div className="ik-kpi-label">MARGIN</div>
                  <div className="ik-kpi-value">{fmtMoney(totals.margin, cur)}</div>
                </div>
              </div>
              {totals.warnings?.length > 0 && (
                <div className="ik-warning-strip">
                  <span>⚠</span>
                  <span>{totals.warnings[0]}</span>
                </div>
              )}
            </section>
          )}

          {/* Basics Section */}
          <section id="sec-basics" className="ik-section">
            <div className="ik-section-header">
              <h2 className="ik-section-title">BASIC INFORMATION</h2>
            </div>
            
            <div className="ik-form-grid">
              <div className="ik-field">
                <label className="ik-label">RECIPE CODE</label>
                <input
                  className="ik-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PREP-001"
                  disabled={!canEditCodes}
                />
              </div>
              <div className="ik-field">
                <label className="ik-label">CODE CATEGORY</label>
                <input
                  className="ik-input"
                  value={codeCategory}
                  onChange={(e) => setCodeCategory(e.target.value.toUpperCase())}
                  placeholder="BASE"
                  maxLength={6}
                  disabled={!canEditCodes}
                />
              </div>
              <div className="ik-field ik-span-2">
                <label className="ik-label">RECIPE NAME *</label>
                <input
                  className="ik-input ik-input-lg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Recipe name"
                />
              </div>
              <div className="ik-field">
                <label className="ik-label">CATEGORY</label>
                <select className="ik-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select...</option>
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
              <div className="ik-field">
                <label className="ik-label">PORTIONS</label>
                <input className="ik-input" type="number" value={portions} onChange={(e) => setPortions(e.target.value)} min="1" />
              </div>
              <div className="ik-field">
                <label className="ik-label">CURRENCY</label>
                <input className="ik-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <div className="ik-field">
                <label className="ik-label">SELLING PRICE</label>
                <input className="ik-input" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="ik-field ik-span-2">
                <label className="ik-label">DESCRIPTION</label>
                <textarea
                  className="ik-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={3}
                />
              </div>
            </div>

            {/* Subrecipe Settings */}
            <div className="ik-subrecipe-toggle">
              <label className="ik-toggle-label">
                <input type="checkbox" checked={isSubRecipe} onChange={(e) => setIsSubRecipe(e.target.checked)} className="ik-toggle" />
                <span className="ik-toggle-slider"></span>
                <span className="ik-toggle-text">USE AS SUBRECIPE</span>
              </label>
              {isSubRecipe && (
                <div className="ik-subrecipe-fields">
                  <div className="ik-field">
                    <label className="ik-label">YIELD QTY</label>
                    <input className="ik-input" type="number" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="1000" />
                  </div>
                  <div className="ik-field">
                    <label className="ik-label">YIELD UNIT</label>
                    <select className="ik-select" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value as any)}>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                      <option value="pcs">pcs</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Photo Upload */}
            <div className="ik-photo-section">
              <label className="ik-label">RECIPE PHOTO</label>
              <div className="ik-photo-upload">
                {recipe?.photo_url ? (
                  <div className="ik-photo-preview">
                    <img src={recipe.photo_url} alt="Recipe" />
                    <div className="ik-photo-overlay">
                      <label htmlFor="photo-upload" className="ik-photo-change">Change</label>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="photo-upload" className="ik-photo-placeholder">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="M21 15l-5-5L7 21"/>
                    </svg>
                    <span>Upload Photo</span>
                  </label>
                )}
                <input id="photo-upload" type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRecipePhoto(f) }} />
              </div>
              {uploading && <div className="ik-uploading">Uploading...</div>}
            </div>
          </section>

          {/* Add Line Section */}
          <section className="ik-section ik-section-dark">
            <div className="ik-section-header">
              <h2 className="ik-section-title">ADD LINE</h2>
            </div>

            <div className="ik-type-tabs">
              {(['ingredient', 'subrecipe', 'group'] as LineType[]).map((t) => (
                <button
                  key={t}
                  className={`ik-type-tab ${addType === t ? 'active' : ''}`}
                  onClick={() => setAddType(t)}
                >
                  {t === 'ingredient' && '🥗'}
                  {t === 'subrecipe' && '📋'}
                  {t === 'group' && '📁'}
                  <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </button>
              ))}
            </div>

            {addType !== 'group' ? (
              <>
                <div className="ik-add-row">
                  <div className="ik-field ik-flex-2">
                    <input
                      className="ik-input"
                      value={ingSearch}
                      onChange={(e) => setIngSearch(e.target.value)}
                      placeholder={`Search ${addType}s...`}
                    />
                  </div>
                  <div className="ik-field ik-flex-3">
                    <select
                      className="ik-select"
                      value={addType === 'ingredient' ? addIngredientId : addSubRecipeId}
                      onChange={(e) => addType === 'ingredient' ? setAddIngredientId(e.target.value) : setAddSubRecipeId(e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {addType === 'ingredient'
                        ? filteredIngredients.map((i) => <option key={i.id} value={i.id}>{i.name} {i.code && `(${i.code})`}</option>)
                        : subRecipeOptions.map((r) => <option key={r.id} value={r.id}>{r.name} {r.code && `(${r.code})`}</option>)}
                    </select>
                  </div>
                </div>
                <div className="ik-add-row">
                  <div className="ik-field">
                    <label className="ik-label-sm">NET</label>
                    <input className="ik-input" type="number" value={addNetQty} onChange={(e) => setAddNetQty(e.target.value)} placeholder="0" />
                  </div>
                  <div className="ik-field">
                    <label className="ik-label-sm">UNIT</label>
                    <select className="ik-select" value={addUnit} onChange={(e) => setAddUnit(e.target.value)}>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                      <option value="pcs">pcs</option>
                    </select>
                  </div>
                  <div className="ik-field">
                    <label className="ik-label-sm">YIELD %</label>
                    <input className="ik-input" type="number" value={addYield} onChange={(e) => setAddYield(e.target.value)} placeholder="100" />
                  </div>
                  <div className="ik-field">
                    <label className="ik-label-sm">GROSS</label>
                    <input className="ik-input" type="number" value={addGross} onChange={(e) => setAddGross(e.target.value)} placeholder="auto" />
                  </div>
                  <div className="ik-field ik-flex-2">
                    <label className="ik-label-sm">NOTE</label>
                    <input className="ik-input" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Optional..." />
                  </div>
                </div>
              </>
            ) : (
              <div className="ik-field">
                <input className="ik-input" value={addGroupTitle} onChange={(e) => setAddGroupTitle(e.target.value)} placeholder="Group title (e.g., Sauce, Toppings)" />
              </div>
            )}

            <div className="ik-add-actions">
              <button className="ik-btn ik-btn-secondary" onClick={() => saveLinesNow()}>Save Lines</button>
              <button className="ik-btn ik-btn-primary" onClick={addLineLocal}>Add {addType === 'group' ? 'Group' : 'Line'}</button>
            </div>
          </section>

          {/* Lines Table */}
          <section id="sec-lines" className="ik-section">
            <div className="ik-section-header">
              <h2 className="ik-section-title">RECIPE LINES</h2>
              <span className="ik-count-badge">{visibleLines.length}</span>
            </div>

            {!visibleLines.length ? (
              <div className="ik-empty">
                <div className="ik-empty-icon">📦</div>
                <div className="ik-empty-title">No Lines Yet</div>
                <div className="ik-empty-text">Add ingredients, subrecipes, or groups above</div>
              </div>
            ) : (
              <div className="ik-table-wrapper">
                <table className="ik-table">
                  <thead>
                    <tr>
                      <th>CODE</th>
                      <th>ITEM</th>
                      <th className="ik-text-right">NET</th>
                      <th>UNIT</th>
                      <th className="ik-text-right">GROSS</th>
                      <th className="ik-text-right">YIELD</th>
                      {showCost && <th className="ik-text-right">COST</th>}
                      <th className="ik-text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((l) => {
                      const c = lineComputed.get(l.id)
                      const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                      const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id} className={`ik-group-row ${flashLineId === l.id ? 'ik-flash' : ''}`}>
                            <td colSpan={tableColSpan}>
                              <div className="ik-group-content">
                                <div className="ik-group-left">
                                  <span className="ik-group-icon">📁</span>
                                  <span className="ik-group-name">{l.group_title}</span>
                                  <span className="ik-group-badge">GROUP</span>
                                </div>
                                <div className="ik-group-actions">
                                  <button className="ik-table-btn" onClick={() => duplicateLineLocal(l.id)}>⧉</button>
                                  <button className="ik-table-btn ik-danger" onClick={() => deleteLineLocal(l.id)}>✕</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={l.id} className={flashLineId === l.id ? 'ik-flash' : ''}>
                          <td><span className="ik-code">{l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')}</span></td>
                          <td>
                            <div className="ik-item-cell">
                              <span className="ik-item-name">{l.line_type === 'ingredient' ? (ing?.name || 'Unknown') : (sub?.name || 'Unknown')}</span>
                              {l.notes && <span className="ik-item-note">{l.notes}</span>}
                            </div>
                          </td>
                          <td><input className="ik-table-input" type="number" value={fmtQty(toNum(l.qty, 0))} onChange={(e) => onNetChange(l.id, e.target.value)} /></td>
                          <td><span className="ik-unit">{l.unit || 'g'}</span></td>
                          <td><input className="ik-table-input" type="number" value={l.gross_qty_override != null ? fmtQty(l.gross_qty_override) : ''} onChange={(e) => onGrossChange(l.id, e.target.value)} placeholder={c ? fmtQty(c.gross) : ''} /></td>
                          <td><input className="ik-table-input" type="number" value={String(Math.round(clamp(toNum(l.yield_percent, 100), 0.0001, 100) * 100) / 100)} onChange={(e) => onYieldChange(l.id, e.target.value)} /></td>
                          {showCost && (
                            <td className="ik-text-right">
                              <span className="ik-cost">{c && c.lineCost > 0 ? fmtMoney(c.lineCost, cur) : '—'}</span>
                              {c?.warnings?.length ? <span className="ik-cost-warn"> ⚠</span> : null}
                            </td>
                          )}
                          <td className="ik-text-center">
                            <button className="ik-table-btn" onClick={() => duplicateLineLocal(l.id)}>⧉</button>
                            <button className="ik-table-btn ik-danger" onClick={() => deleteLineLocal(l.id)}>✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Method Section */}
          <section id="sec-method" className="ik-section">
            <div className="ik-section-header">
              <h2 className="ik-section-title">COOKING METHOD</h2>
            </div>

            <div className="ik-step-input">
              <input
                className="ik-input ik-input-lg"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Add a cooking step..."
                onKeyDown={(e) => e.key === 'Enter' && addStep()}
              />
              <button className="ik-btn ik-btn-primary" onClick={addStep}>Add Step</button>
            </div>

            {steps.length > 0 ? (
              <div className="ik-steps-grid">
                {steps.map((s, idx) => (
                  <div key={idx} className="ik-step-card">
                    <div className="ik-step-header">
                      <div className="ik-step-number">{idx + 1}</div>
                      <span className="ik-step-label">STEP</span>
                      <button className="ik-step-remove" onClick={() => removeStep(idx)}>✕</button>
                    </div>
                    <textarea
                      className="ik-step-textarea"
                      value={s}
                      onChange={(e) => updateStep(idx, e.target.value)}
                      rows={4}
                    />
                    <div className="ik-step-photo">
                      {stepPhotos[idx] ? (
                        <div className="ik-step-photo-preview">
                          <img src={stepPhotos[idx]} alt={`Step ${idx + 1}`} />
                        </div>
                      ) : (
                        <label htmlFor={`step-photo-${idx}`} className="ik-step-photo-upload">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="2" width="20" height="20" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L7 21"/>
                          </svg>
                          <span>Add Photo</span>
                        </label>
                      )}
                      <input id={`step-photo-${idx}`} type="file" accept="image/*" className="hidden" disabled={stepUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStepPhoto(f, idx) }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ik-empty">
                <div className="ik-empty-icon">📝</div>
                <div className="ik-empty-title">No Steps Yet</div>
              </div>
            )}

            <div className="ik-legacy-method">
              <label className="ik-label">LEGACY METHOD (OPTIONAL)</label>
              <textarea
                className="ik-textarea"
                value={methodLegacy}
                onChange={(e) => setMethodLegacy(e.target.value)}
                placeholder="Alternative full method text..."
                rows={4}
              />
            </div>
          </section>

          {/* Nutrition Section */}
          <section id="sec-nutrition" className="ik-section">
            <div className="ik-section-header">
              <h2 className="ik-section-title">NUTRITION / PORTION</h2>
            </div>
            <div className="ik-nutrition-grid">
              <div className="ik-field">
                <label className="ik-label">CALORIES</label>
                <input className="ik-input" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="0" />
              </div>
              <div className="ik-field">
                <label className="ik-label">PROTEIN (g)</label>
                <input className="ik-input" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="0" />
              </div>
              <div className="ik-field">
                <label className="ik-label">CARBS (g)</label>
                <input className="ik-input" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="0" />
              </div>
              <div className="ik-field">
                <label className="ik-label">FAT (g)</label>
                <input className="ik-input" type="number" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="0" />
              </div>
            </div>
          </section>

          {/* Cost History */}
          {showCost && (
            <section className="ik-section">
              <div className="ik-section-header">
                <h2 className="ik-section-title">COST HISTORY</h2>
                <div className="ik-history-actions">
                  <button className="ik-btn ik-btn-sm ik-btn-primary" onClick={addSnapshot}>+ Snapshot</button>
                  {costPoints.length > 0 && <button className="ik-btn ik-btn-sm ik-btn-secondary" onClick={clearSnapshots}>Clear</button>}
                </div>
              </div>
              <CostTimeline points={costPoints} currency={currency} />
              {!costPoints.length && <div className="ik-empty"><div className="ik-empty-text">No snapshots yet</div></div>}
            </section>
          )}
        </main>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}

// ===== STYLES =====
const loadingStyles = `
.ik-loading {
  min-height: 100vh;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ik-loading-inner {
  text-align: center;
  padding: 40px;
}

.ik-loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #1a1a1a;
  border-top-color: #d4a574;
  border-radius: 50%;
  animation: ik-spin 0.8s linear infinite;
  margin: 0 auto 24px;
}

@keyframes ik-spin {
  to { transform: rotate(360deg); }
}

.ik-loading-text {
  font-size: 1.125rem;
  font-weight: 600;
  color: #e5e5e5;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
}

.ik-loading-bar {
  width: 200px;
  height: 2px;
  background: #1a1a1a;
  border-radius: 1px;
  overflow: hidden;
  margin: 0 auto;
}

.ik-loading-progress {
  height: 100%;
  background: linear-gradient(90deg, #d4a574, #c9956c);
  animation: ik-progress 1.5s ease-in-out infinite;
}

@keyframes ik-progress {
  0% { width: 0; transform: translateX(0); }
  50% { width: 70%; }
  100% { width: 100%; transform: translateX(0); }
}

.ik-error-page {
  min-height: 100vh;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.ik-error-icon {
  font-size: 4rem;
  margin-bottom: 24px;
}

.ik-error-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ef4444;
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.ik-error-text {
  color: #737373;
}
`

const mainStyles = `
/* ===== Industrial Kitchen Pro Design System ===== */
:root {
  --ik-bg: #0a0a0a;
  --ik-bg-elevated: #141414;
  --ik-bg-card: #1a1a1a;
  --ik-surface: #242424;
  --ik-border: #2a2a2a;
  --ik-border-light: #333;
  --ik-text: #fafafa;
  --ik-text-secondary: #a3a3a3;
  --ik-text-muted: #737373;
  --ik-accent: #d4a574;
  --ik-accent-hover: #c9956c;
  --ik-success: #22c55e;
  --ik-danger: #ef4444;
  --ik-warning: #f59e0b;
  --ik-radius: 4px;
  --ik-radius-lg: 8px;
  --ik-shadow: 0 4px 12px rgba(0,0,0,0.4);
  --ik-transition: all 0.15s ease;
}

* { box-sizing: border-box; }

.ik-app {
  display: flex;
  min-height: 100vh;
  background: var(--ik-bg);
  color: var(--ik-text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ===== Sidebar ===== */
.ik-sidebar {
  width: 260px;
  background: var(--ik-bg-elevated);
  border-right: 1px solid var(--ik-border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.ik-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-back-link {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-surface);
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  transition: var(--ik-transition);
  text-decoration: none;
}

.ik-back-link:hover {
  background: var(--ik-accent);
  color: var(--ik-bg);
}

.ik-recipe-badge {
  padding: 6px 12px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--ik-accent);
}

.ik-sidebar-title {
  padding: 20px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-sidebar-title h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ik-text);
  margin: 0 0 8px;
  line-height: 1.3;
}

.ik-autosave {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--ik-text-muted);
}

.ik-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ik-success);
}

.ik-status-dot.saving {
  background: var(--ik-warning);
  animation: ik-pulse 1s infinite;
}

@keyframes ik-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ===== Navigation ===== */
.ik-nav {
  flex: 1;
  padding: 12px;
}

.ik-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: var(--ik-transition);
  text-align: left;
}

.ik-nav-item:hover {
  background: var(--ik-surface);
  color: var(--ik-text);
}

.ik-nav-item.active {
  background: var(--ik-accent);
  color: var(--ik-bg);
}

.ik-nav-icon {
  font-size: 1rem;
  opacity: 0.8;
}

.ik-sidebar-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--ik-border);
}

.ik-action-btn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-action-btn:hover {
  background: var(--ik-accent);
  border-color: var(--ik-accent);
  color: var(--ik-bg);
}

.ik-sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--ik-border);
}

.ik-density-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-density-btn:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

/* ===== Main Content ===== */
.ik-main {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.ik-section {
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius-lg);
  margin-bottom: 24px;
  overflow: hidden;
}

.ik-section-dark {
  background: var(--ik-surface);
}

.ik-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--ik-border);
  background: linear-gradient(90deg, rgba(212,165,116,0.05), transparent);
}

.ik-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--ik-accent);
  margin: 0;
}

.ik-currency-tag {
  padding: 4px 10px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--ik-text-secondary);
}

/* ===== Error Banner ===== */
.ik-error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: var(--ik-radius-lg);
  margin-bottom: 24px;
  color: var(--ik-danger);
  font-size: 0.875rem;
}

.ik-error-icon-sm {
  font-size: 1.25rem;
}

.ik-error-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--ik-danger);
  cursor: pointer;
  opacity: 0.7;
  transition: var(--ik-transition);
}

.ik-error-close:hover { opacity: 1; }

/* ===== KPI Grid ===== */
.ik-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--ik-border);
}

.ik-kpi {
  background: var(--ik-bg-card);
  padding: 24px;
}

.ik-kpi-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  margin-bottom: 8px;
}

.ik-kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--ik-text);
  font-variant-numeric: tabular-nums;
}

.ik-kpi-value.negative {
  color: var(--ik-danger);
}

.ik-warning-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: rgba(239,68,68,0.05);
  border-top: 1px solid var(--ik-border);
  font-size: 0.875rem;
  color: var(--ik-danger);
}

/* ===== Forms ===== */
.ik-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  padding: 24px;
}

.ik-field { margin-bottom: 16px; }
.ik-field:last-child { margin-bottom: 0; }

.ik-span-2 { grid-column: span 2; }

.ik-flex-2 { flex: 2; }
.ik-flex-3 { flex: 3; }

.ik-label {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  margin-bottom: 8px;
}

.ik-label-sm {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ik-text-muted);
  margin-bottom: 4px;
  display: block;
}

.ik-input,
.ik-select,
.ik-textarea {
  width: 100%;
  padding: 12px 16px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text);
  font-size: 0.875rem;
  font-family: inherit;
  transition: var(--ik-transition);
}

.ik-input:focus,
.ik-select:focus,
.ik-textarea:focus {
  outline: none;
  border-color: var(--ik-accent);
}

.ik-input::placeholder,
.ik-textarea::placeholder {
  color: var(--ik-text-muted);
}

.ik-input-lg {
  padding: 16px;
  font-size: 1rem;
  font-weight: 600;
}

.ik-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a3a3a3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 40px;
  cursor: pointer;
}

.ik-textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.5;
}

/* ===== Subrecipe Toggle ===== */
.ik-subrecipe-toggle {
  padding: 0 24px 24px;
}

.ik-toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.ik-toggle {
  display: none;
}

.ik-toggle-slider {
  width: 44px;
  height: 24px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: 12px;
  position: relative;
  transition: var(--ik-transition);
}

.ik-toggle-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: var(--ik-text-muted);
  border-radius: 50%;
  transition: var(--ik-transition);
}

.ik-toggle:checked + .ik-toggle-slider {
  background: var(--ik-accent);
  border-color: var(--ik-accent);
}

.ik-toggle:checked + .ik-toggle-slider::after {
  left: 23px;
  background: var(--ik-bg);
}

.ik-toggle-text {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-secondary);
}

.ik-subrecipe-fields {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ik-border);
}

.ik-subrecipe-fields .ik-field {
  flex: 1;
  margin: 0;
}

/* ===== Photo Section ===== */
.ik-photo-section {
  padding: 0 24px 24px;
}

.ik-photo-upload {
  margin-top: 8px;
}

.ik-photo-preview {
  position: relative;
  width: 160px;
  height: 120px;
  border-radius: var(--ik-radius);
  overflow: hidden;
  border: 1px solid var(--ik-border);
}

.ik-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ik-photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: var(--ik-transition);
}

.ik-photo-preview:hover .ik-photo-overlay {
  opacity: 1;
}

.ik-photo-change {
  padding: 8px 16px;
  background: var(--ik-accent);
  border-radius: var(--ik-radius);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-bg);
  cursor: pointer;
}

.ik-photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 160px;
  height: 120px;
  background: var(--ik-surface);
  border: 1px dashed var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-photo-placeholder:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

.ik-photo-placeholder span {
  font-size: 0.75rem;
}

.ik-uploading {
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--ik-accent);
}

.hidden { display: none; }

/* ===== Type Tabs ===== */
.ik-type-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-type-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--ik-bg-card);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-type-tab:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

.ik-type-tab.active {
  background: var(--ik-accent);
  border-color: var(--ik-accent);
  color: var(--ik-bg);
}

/* ===== Add Row ===== */
.ik-add-row {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
}

.ik-add-row .ik-field {
  flex: 1;
  margin: 0;
}

.ik-add-actions {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  justify-content: flex-end;
  border-top: 1px solid var(--ik-border);
}

/* ===== Buttons ===== */
.ik-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--ik-radius);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ik-transition);
  border: none;
  font-family: inherit;
}

.ik-btn-primary {
  background: var(--ik-accent);
  color: var(--ik-bg);
}

.ik-btn-primary:hover {
  background: var(--ik-accent-hover);
}

.ik-btn-secondary {
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  color: var(--ik-text);
}

.ik-btn-secondary:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

.ik-btn-sm {
  padding: 8px 16px;
  font-size: 0.75rem;
}

/* ===== Table ===== */
.ik-table-wrapper {
  overflow-x: auto;
}

.ik-table {
  width: 100%;
  border-collapse: collapse;
}

.ik-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  background: var(--ik-surface);
  border-bottom: 1px solid var(--ik-border);
}

.ik-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ik-border);
  vertical-align: middle;
}

.ik-text-right { text-align: right; }
.ik-text-center { text-align: center; }

.ik-code {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-accent);
  background: var(--ik-surface);
  padding: 4px 8px;
  border-radius: 3px;
}

.ik-item-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ik-item-name {
  font-weight: 500;
}

.ik-item-note {
  font-size: 0.7rem;
  color: var(--ik-text-muted);
  background: var(--ik-surface);
  padding: 2px 6px;
  border-radius: 3px;
  width: fit-content;
}

.ik-unit {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ik-text-secondary);
  background: var(--ik-surface);
  padding: 4px 8px;
  border-radius: 3px;
}

.ik-table-input {
  width: 80px;
  padding: 8px;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  text-align: right;
}

.ik-table-input:focus {
  outline: none;
  border-color: var(--ik-accent);
}

.ik-cost {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--ik-accent);
}

.ik-cost-warn {
  color: var(--ik-danger);
}

.ik-table-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: var(--ik-transition);
  margin: 0 2px;
}

.ik-table-btn:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

.ik-table-btn.ik-danger:hover {
  border-color: var(--ik-danger);
  color: var(--ik-danger);
}

/* ===== Group Row ===== */
.ik-group-row {
  background: rgba(212,165,116,0.05);
}

.ik-group-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ik-group-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ik-group-icon {
  font-size: 1rem;
}

.ik-group-name {
  font-weight: 700;
  color: var(--ik-text);
}

.ik-group-badge {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-accent);
  background: var(--ik-surface);
  padding: 3px 8px;
  border-radius: 3px;
}

.ik-group-actions {
  display: flex;
  gap: 4px;
}

.ik-flash {
  animation: ik-flash 0.5s ease;
}

@keyframes ik-flash {
  0%, 100% { background: transparent; }
  50% { background: rgba(212,165,116,0.2); }
}

/* ===== Count Badge ===== */
.ik-count-badge {
  padding: 4px 10px;
  background: var(--ik-accent);
  border-radius: var(--ik-radius);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ik-bg);
}

/* ===== Empty State ===== */
.ik-empty {
  text-align: center;
  padding: 60px 24px;
}

.ik-empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.ik-empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ik-text-secondary);
  margin-bottom: 4px;
}

.ik-empty-text {
  font-size: 0.875rem;
  color: var(--ik-text-muted);
}

/* ===== Step Input ===== */
.ik-step-input {
  display: flex;
  gap: 12px;
  padding: 24px;
  border-bottom: 1px solid var(--ik-border);
}

.ik-step-input .ik-field {
  flex: 1;
  margin: 0;
}

/* ===== Steps Grid ===== */
.ik-steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 24px;
}

.ik-step-card {
  background: var(--ik-surface);
  border: 1px solid var(--ik-border);
  border-radius: var(--ik-radius-lg);
  overflow: hidden;
}

.ik-step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ik-border);
  background: var(--ik-bg-card);
}

.ik-step-number {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ik-accent);
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--ik-bg);
}

.ik-step-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ik-text-muted);
  flex: 1;
}

.ik-step-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--ik-border);
  border-radius: 50%;
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-step-remove:hover {
  background: var(--ik-danger);
  border-color: var(--ik-danger);
  color: white;
}

.ik-step-textarea {
  width: 100%;
  min-height: 100px;
  padding: 16px;
  background: transparent;
  border: none;
  color: var(--ik-text);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  resize: vertical;
}

.ik-step-textarea:focus {
  outline: none;
}

.ik-step-photo {
  padding: 16px;
  border-top: 1px solid var(--ik-border);
}

.ik-step-photo-preview {
  aspect-ratio: 1;
  border-radius: var(--ik-radius);
  overflow: hidden;
}

.ik-step-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ik-step-photo-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 1;
  background: var(--ik-bg-card);
  border: 1px dashed var(--ik-border);
  border-radius: var(--ik-radius);
  color: var(--ik-text-muted);
  cursor: pointer;
  transition: var(--ik-transition);
}

.ik-step-photo-upload:hover {
  border-color: var(--ik-accent);
  color: var(--ik-accent);
}

.ik-step-photo-upload span {
  font-size: 0.75rem;
}

/* ===== Legacy Method ===== */
.ik-legacy-method {
  padding: 0 24px 24px;
  margin-top: 24px;
  border-top: 1px solid var(--ik-border);
  padding-top: 24px;
}

/* ===== Nutrition Grid ===== */
.ik-nutrition-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding: 24px;
}

.ik-nutrition-grid .ik-field {
  margin: 0;
}

/* ===== History Actions ===== */
.ik-history-actions {
  display: flex;
  gap: 8px;
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .ik-sidebar {
    width: 200px;
  }
  
  .ik-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .ik-steps-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .ik-nutrition-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .ik-app {
    flex-direction: column;
  }
  
  .ik-sidebar {
    width: 100%;
    height: auto;
    position: relative;
  }
  
  .ik-nav {
    display: flex;
    overflow-x: auto;
    padding: 8px;
    gap: 4px;
  }
  
  .ik-nav-item {
    flex-shrink: 0;
    padding: 10px 14px;
  }
  
  .ik-main {
    padding: 16px;
  }
  
  .ik-form-grid,
  .ik-nutrition-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-span-2 {
    grid-column: span 1;
  }
  
  .ik-steps-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-kpi-grid {
    grid-template-columns: 1fr;
  }
  
  .ik-add-row {
    flex-direction: column;
  }
}
