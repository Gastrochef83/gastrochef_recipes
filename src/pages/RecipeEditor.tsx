import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

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

// basic unit conversion within same family (g/kg) (ml/l) (pcs)
function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const f = safeUnit(fromUnit)
  const t = safeUnit(toUnit)
  if (f === t) return { ok: true, value: qty }

  // weight
  if (f === 'g' && t === 'kg') return { ok: true, value: qty / 1000 }
  if (f === 'kg' && t === 'g') return { ok: true, value: qty * 1000 }

  // volume
  if (f === 'ml' && t === 'l') return { ok: true, value: qty / 1000 }
  if (f === 'l' && t === 'ml') return { ok: true, value: qty * 1000 }

  // pcs only to pcs
  if (f === 'pcs' && t === 'pcs') return { ok: true, value: qty }

  return { ok: false, value: 0 }
}

// ingredient line: convert line qty to ingredient pack unit (keeps your old behavior)
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

export default function RecipeEditor() {
  const location = useLocation()
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

  // Form fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')

  // Nutrition per portion (manual only)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // Pricing per portion
  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')

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
  const [addUnit, setAddUnit] = useState('g')
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

  // For recursive cost/breakdown: cache lines for recipes that are referenced
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})

  const loadAll = async (recipeId: string) => {
    const { data: r, error: rErr } = await supabase
      .from('recipes')
      .select(
        'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
      )
      .eq('id', recipeId)
      .single()
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

    // recipes list (for subrecipes dropdown)
    const { data: rs, error: rsErr } = await supabase
      .from('recipes')
      .select('id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct')
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
    setSteps(normalizeSteps(rr.method_steps))
    setMethodLegacy(rr.method ?? '')

    setCalories(rr.calories == null ? '' : String(rr.calories))
    setProtein(rr.protein_g == null ? '' : String(rr.protein_g))
    setCarbs(rr.carbs_g == null ? '' : String(rr.carbs_g))
    setFat(rr.fat_g == null ? '' : String(rr.fat_g))

    setCurrency((rr.currency ?? 'USD').toUpperCase())
    setSellingPrice(rr.selling_price == null ? '' : String(rr.selling_price))
    setTargetFC(rr.target_food_cost_pct == null ? '30' : String(rr.target_food_cost_pct))

    // prep edit map
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

    // prime cache for current recipe
    setRecipeLinesCache((p) => ({ ...p, [rr.id]: ll }))
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

  // fetch missing recipe_lines for referenced subrecipes (and their children) on demand
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

    // fetch in chunks (supabase in() supports arrays)
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
    // whenever lines change, try to ensure cache contains children for cost/breakdown
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
        // if child lines not loaded yet, treat as 0 for now
        if (!child || !childLines) continue

        const childRes = getRecipeTotalCost(childId, visited)
        for (const w of childRes.warnings) warnings.push(w)

        const yieldQty = toNum(child.yield_qty, 0)
        const yieldUnit = safeUnit(child.yield_unit ?? '')
        if (yieldQty <= 0 || !yieldUnit) {
          warnings.push(`Missing yield for subrecipe: ${child.name}`)
          continue
        }

        // qty in parent is "amount of yield"
        const qtyParent = toNum(l.qty, 0)
        const conv = convertQty(qtyParent, l.unit, yieldUnit)
        if (!conv.ok) {
          warnings.push(`Unit mismatch for subrecipe "${child.name}" (${safeUnit(l.unit)} -> ${yieldUnit})`)
          continue
        }

        const costPerYieldUnit = childRes.cost / yieldQty
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
    // make sure cache has current recipe lines (already set) and (best effort) children
    const res = getRecipeTotalCost(recipe.id, new Set<string>())
    return { cost: res.cost, warnings: res.warnings }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, recipeLinesCache, ingById, recipeById])

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
  // Save recipe meta
  // -------------------------
  const saveMeta = async () => {
    if (!id) return
    setSavingMeta(true)
    try {
      const payload = {
        name: name.trim() || 'Untitled',
        category: category.trim() || null,
        portions: Math.max(1, toNum(portions, 1)),
        description: description.trim() || null,

        method_steps: normalizeSteps(steps),
        method: methodLegacy.trim() || null,

        calories: calories.trim() === '' ? null : Math.max(0, Math.floor(toNum(calories, 0))),
        protein_g: protein.trim() === '' ? null : Math.max(0, toNum(protein, 0)),
        carbs_g: carbs.trim() === '' ? null : Math.max(0, toNum(carbs, 0)),
        fat_g: fat.trim() === '' ? null : Math.max(0, toNum(fat, 0)),

        currency: (currency || 'USD').toUpperCase(),
        selling_price: sellingPrice.trim() === '' ? null : Math.max(0, toNum(sellingPrice, 0)),
        target_food_cost_pct: Math.min(99, Math.max(1, toNum(targetFC, 30))),
      }

      const { error } = await supabase.from('recipes').update(payload).eq('id', id)
      if (error) throw error

      showToast('Saved ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSavingMeta(false)
    }
  }

  // -------------------------
  // Steps
  // -------------------------
  const addStep = () => {
    const s = newStep.trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setNewStep('')
  }
  const updateStep = (idx: number, value: string) => setSteps((prev) => prev.map((x, i) => (i === idx ? value : x)))
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx))
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  // -------------------------
  // Upload photo
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

  // -------------------------
  // Lines CRUD
  // -------------------------
  const addLineInline = async () => {
    if (!id) return

    const qty = Math.max(0, toNum(addQty, 0))
    if (addType !== 'group' && qty <= 0) return showToast('Qty must be > 0')

    setSavingAdd(true)
    try {
      const maxSort = lines.length ? Math.max(...lines.map((x) => toNum(x.sort_order, 0))) : 0
      const base = {
        recipe_id: id,
        sort_order: maxSort + 10,
        note: addNote.trim() || null,
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
          group_title: null,
        }
        const { error } = await supabase.from('recipe_lines').insert(payload)
        if (error) throw error
      }

      setAddIngredientId('')
      setAddSubRecipeId('')
      setAddQty('1')
      setAddUnit('g')
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
      const maxSort = lines.length ? Math.max(...lines.map((x) => toNum(x.sort_order, 0))) : 0
      const payload = {
        recipe_id: id,
        ingredient_id: null,
        sub_recipe_id: null,
        qty: 0,
        unit: 'g',
        note: null,
        sort_order: maxSort + 10,
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
          .update({ line_type: 'group', group_title: title, ingredient_id: null, sub_recipe_id: null, qty: 0, unit: 'g', note: null })
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
            note: row.note.trim() || null,
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
            note: row.note.trim() || null,
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
        sort_order: toNum(src.sort_order, 0) + 5,
        line_type: src.line_type,
        ingredient_id: src.line_type === 'ingredient' ? src.ingredient_id : null,
        sub_recipe_id: src.line_type === 'subrecipe' ? src.sub_recipe_id : null,
        qty: src.line_type === 'group' ? 0 : src.qty,
        unit: src.line_type === 'group' ? 'g' : safeUnit(src.unit),
        note: src.note,
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
      const updates = ordered.map((x, idx) => ({ id: x.id, sort_order: (idx + 1) * 10 }))
      const tasks = updates.map((u) =>
        supabase.from('recipe_lines').update({ sort_order: u.sort_order }).eq('id', u.id).eq('recipe_id', id)
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
  // Render breakdown (recursive)
  // -------------------------
  const renderBreakdown = (subRecipeId: string, depth: number) => {
    const r = recipeById.get(subRecipeId)
    const rLines = recipeLinesCache[subRecipeId] ?? []
    if (!r) return null

    const res = getRecipeTotalCost(subRecipeId, new Set<string>())
    const yieldQty = toNum(r.yield_qty, 0)
    const yieldUnit = safeUnit(r.yield_unit ?? '')
    const perUnit = yieldQty > 0 ? res.cost / yieldQty : 0

    return (
      <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-neutral-600">SUB-RECIPE BREAKDOWN</div>
            <div className="text-sm font-extrabold">{r.name}</div>
            <div className="text-xs text-neutral-500">
              Yield: <span className="font-semibold">{yieldQty || '—'}</span> {yieldUnit || '—'} · Cost per yield unit:{' '}
              <span className="font-semibold">{fmtMoney(perUnit, currency)}</span>
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
                  <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="text-neutral-700" style={{ paddingLeft: depth * 12 }}>
                      • {label} — {l.qty} {safeUnit(l.unit)}
                    </div>
                    <div className="text-neutral-500">{l.note ? l.note : ''}</div>
                  </div>
                )
              }
              if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
                const child = recipeById.get(l.sub_recipe_id)
                return (
                  <div key={l.id} style={{ paddingLeft: depth * 12 }}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="text-neutral-700">
                        • {child?.name ?? 'Sub-recipe'} — {l.qty} {safeUnit(l.unit)}
                      </div>
                      <div className="text-neutral-500">{l.note ? l.note : ''}</div>
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
  // UI guards
  // -------------------------
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

            <div className="min-w-[min(560px,92vw)]">
              <div className="gc-label">RECIPE EDITOR (SUB-RECIPES TREE + MANUAL NUTRITION)</div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="gc-label">NAME</div>
                  <input className="gc-input mt-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div>
                  <div className="gc-label">CATEGORY</div>
                  <input className="gc-input mt-2 w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Veg / Chicken / Dessert..." />
                </div>

                <div>
                  <div className="gc-label">PORTIONS</div>
                  <input className="gc-input mt-2 w-full" type="number" min={1} step="1" value={portions} onChange={(e) => setPortions(e.target.value)} />
                </div>

                <div className="flex items-end gap-2">
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

                  <button className="gc-btn gc-btn-primary" onClick={saveMeta} disabled={savingMeta}>
                    {savingMeta ? 'Saving…' : 'Save'}
                  </button>

                  <NavLink className="gc-btn gc-btn-ghost" to="/recipes">
                    ← Back
                  </NavLink>
                </div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="gc-label">COST (RECURSIVE)</div>
            <div className="mt-1 text-2xl font-extrabold">{fmtMoney(totalCost, currency)}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Cost/portion: <span className="font-semibold">{fmtMoney(cpp, currency)}</span>
            </div>

            {totalCostRes.warnings.length > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                {totalCostRes.warnings.slice(0, 2).map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Premium Panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Description */}
        <div className="gc-card p-6">
          <div className="gc-label">DESCRIPTION</div>
          <textarea className="gc-input mt-3 w-full min-h-[140px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short premium description for menu / customers..." />
        </div>

        {/* Nutrition (manual only) */}
        <div className="gc-card p-6">
          <div>
            <div className="gc-label">NUTRITION (PER PORTION)</div>
            <div className="mt-1 text-xs text-neutral-500">Manual input only.</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="gc-label">CALORIES</div>
              <input className="gc-input mt-2 w-full" type="number" min={0} step="1" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
            <div>
              <div className="gc-label">PROTEIN (g)</div>
              <input className="gc-input mt-2 w-full" type="number" min={0} step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div>
              <div className="gc-label">CARBS (g)</div>
              <input className="gc-input mt-2 w-full" type="number" min={0} step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div>
              <div className="gc-label">FAT (g)</div>
              <input className="gc-input mt-2 w-full" type="number" min={0} step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Pricing Premium */}
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
              <input className="gc-input mt-2 w-full" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            </div>
            <div>
              <div className="gc-label">SELLING PRICE</div>
              <input className="gc-input mt-2 w-full" type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="e.g., 8.50" />
            </div>
            <div>
              <div className="gc-label">TARGET FOOD COST %</div>
              <input className="gc-input mt-2 w-full" type="number" min={1} max={99} step="1" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} placeholder="30" />
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
            After setting price/target, press <span className="font-semibold">Save</span> to store pricing in DB.
          </div>
        </div>
      </div>

      {/* Step Builder */}
      <div className="gc-card p-6">
        <div className="gc-label">STEP BUILDER</div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="gc-input"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Write step…"
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
            {steps.map((s, idx) => (
              <div key={idx} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* INGREDIENTS + SUBRECIPES TREE */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="gc-label">LINES (INGREDIENTS + SUB-RECIPES)</div>
            <div className="mt-1 text-sm text-neutral-600">Inline add · Groups · Notes · Reorder · Duplicate · Expand breakdown.</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500">{reorderSaving ? 'Saving order…' : ''}</div>
            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => loadAll(id!)}>
              Refresh
            </button>
          </div>
        </div>

        {/* Inline Add */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[.7fr_1.6fr_.6fr_1fr_auto]">
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
                <input className="gc-input mt-2 w-full" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Filter ingredients…" />
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
            <div className="gc-label">QTY + UNIT</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input className="gc-input" type="number" min={0} step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
              <select className="gc-input" value={safeUnit(addUnit)} onChange={(e) => setAddUnit(e.target.value)}>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
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

        {/* Add Group */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="gc-label">ADD GROUP HEADER</div>
            <input className="gc-input mt-2 w-full" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g., Sauce / Filling / Topping" />
          </div>
          <div className="flex items-end">
            <button className="gc-btn gc-btn-ghost w-full" type="button" onClick={addGroup} disabled={savingGroup}>
              {savingGroup ? 'Saving…' : '+ Add Group'}
            </button>
          </div>
        </div>

        {/* Table */}
        {lines.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-600">No lines yet.</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="grid grid-cols-[1.4fr_.55fr_.55fr_1fr_1.2fr] gap-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-600">
              <div>Item</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Unit</div>
              <div>Note</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="divide-y divide-neutral-200">
              {lines.map((l) => {
                const e = edit[l.id]
                const saving = rowSaving[l.id] === true

                // GROUP ROW
                if ((e?.line_type ?? l.line_type) === 'group') {
                  const title = e?.group_title ?? l.group_title ?? ''
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
                                    note: '',
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
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveLine(l.id, -1)} disabled={reorderSaving}>
                            ↑
                          </button>
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveLine(l.id, 1)} disabled={reorderSaving}>
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

                // unified editor state
                const row = e || {
                  line_type: l.line_type,
                  ingredient_id: l.ingredient_id ?? '',
                  sub_recipe_id: l.sub_recipe_id ?? '',
                  qty: String(l.qty ?? 0),
                  unit: safeUnit(l.unit ?? 'g'),
                  note: l.note ?? '',
                  group_title: l.group_title ?? '',
                }

                const setRow = (patch: Partial<EditRow>) =>
                  setEdit((p) => ({
                    ...p,
                    [l.id]: { ...row, ...patch },
                  }))

                // cost display
                let rightInfo = ''
                if (row.line_type === 'ingredient' && row.ingredient_id) {
                  const ing = ingById.get(row.ingredient_id)
                  const net = toNum(ing?.net_unit_cost, 0)
                  const packUnit = safeUnit(ing?.pack_unit ?? 'g')
                  const conv = convertQtyToPackUnit(toNum(row.qty, 0), row.unit, packUnit)
                  const lc = conv * net
                  rightInfo = fmtMoney(lc, currency)
                } else if (row.line_type === 'subrecipe' && row.sub_recipe_id) {
                  const child = recipeById.get(row.sub_recipe_id)
                  const childRes = child ? getRecipeTotalCost(child.id, new Set<string>()) : { cost: 0, warnings: [] as string[] }
                  const yieldQty = child ? toNum(child.yield_qty, 0) : 0
                  const yieldUnit = child ? safeUnit(child.yield_unit ?? '') : ''
                  const conv = child ? convertQty(toNum(row.qty, 0), row.unit, yieldUnit) : { ok: false, value: 0 }
                  const lc = child && yieldQty > 0 && conv.ok ? conv.value * (childRes.cost / yieldQty) : 0
                  rightInfo = fmtMoney(lc, currency)
                }

                const itemLabel =
                  row.line_type === 'ingredient'
                    ? ingById.get(row.ingredient_id)?.name ?? 'Ingredient'
                    : recipeById.get(row.sub_recipe_id)?.name ?? 'Sub-recipe'

                const canExpand = row.line_type === 'subrecipe' && !!row.sub_recipe_id

                return (
                  <div key={l.id} className="px-4 py-3">
                    <div className="grid grid-cols-[1.4fr_.55fr_.55fr_1fr_1.2fr] items-center gap-3">
                      <div className="pr-2">
                        <div className="flex items-center gap-2">
                          <select className="gc-input w-[140px]" value={row.line_type} onChange={(ev) => setRow({ line_type: ev.target.value as any, ingredient_id: '', sub_recipe_id: '' })}>
                            <option value="ingredient">Ingredient</option>
                            <option value="subrecipe">Sub-recipe</option>
                          </select>

                          {row.line_type === 'ingredient' ? (
                            <select className="gc-input flex-1" value={row.ingredient_id} onChange={(ev) => setRow({ ingredient_id: ev.target.value })}>
                              <option value="">Select…</option>
                              {activeIngredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name ?? i.id}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select className="gc-input flex-1" value={row.sub_recipe_id} onChange={(ev) => setRow({ sub_recipe_id: ev.target.value })}>
                              <option value="">Select…</option>
                              {subRecipeOptions.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} (yield: {toNum(r.yield_qty, 0)} {safeUnit(r.yield_unit ?? '') || '—'})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="mt-1 text-[11px] text-neutral-500 flex items-center justify-between">
                          <span className="truncate">{itemLabel}</span>
                          <span className="font-semibold">{rightInfo}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <input className="gc-input w-full text-right" type="number" min={0} step="0.01" value={row.qty} onChange={(ev) => setRow({ qty: ev.target.value })} />
                      </div>

                      <div className="text-right">
                        <select className="gc-input w-full text-right" value={safeUnit(row.unit)} onChange={(ev) => setRow({ unit: ev.target.value })}>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="pcs">pcs</option>
                        </select>
                      </div>

                      <div>
                        <input className="gc-input w-full" value={row.note} onChange={(ev) => setRow({ note: ev.target.value })} placeholder="e.g., chopped / room temp / to taste…" />
                      </div>

                      <div className="flex justify-end gap-2">
                        {canExpand && (
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleExpand(l.id)}>
                            {expanded[l.id] ? 'Hide' : 'Expand'}
                          </button>
                        )}
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveLine(l.id, -1)} disabled={reorderSaving}>
                          ↑
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => moveLine(l.id, 1)} disabled={reorderSaving}>
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

                    {canExpand && expanded[l.id] && row.sub_recipe_id ? renderBreakdown(row.sub_recipe_id, 0) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
