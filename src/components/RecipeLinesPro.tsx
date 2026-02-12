import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

import ServingsSlider from '../components/ServingsSlider'
import RecipeLinesPro, { ProLine, IngredientPick } from '../components/RecipeLinesPro'

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

  method?: string | null // legacy
  method_steps?: string[] | null

  // per portion nutrition
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null

  // pricing
  selling_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean

  // Nutrition per 100g
  kcal_per_100g?: number | null
  protein_per_100g?: number | null
  carbs_per_100g?: number | null
  fat_per_100g?: number | null

  // Conversions for nutrition
  density_g_per_ml?: number | null
  grams_per_piece?: number | null
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

function unitToGrams(qty: number, unit: string, ing: Ingredient | undefined) {
  const u = safeUnit(unit)
  if (u === 'g') return { ok: true, grams: qty, reason: '' }
  if (u === 'kg') return { ok: true, grams: qty * 1000, reason: '' }

  if (u === 'ml' || u === 'l') {
    const density = toNum(ing?.density_g_per_ml, 0)
    if (density <= 0) return { ok: false, grams: 0, reason: 'missing density_g_per_ml' }
    const ml = u === 'ml' ? qty : qty * 1000
    return { ok: true, grams: ml * density, reason: '' }
  }

  if (u === 'pcs') {
    const gpp = toNum(ing?.grams_per_piece, 0)
    if (gpp <= 0) return { ok: false, grams: 0, reason: 'missing grams_per_piece' }
    return { ok: true, grams: qty * gpp, reason: '' }
  }

  return { ok: false, grams: 0, reason: 'unit not supported' }
}

export default function RecipeEditor() {
  const location = useLocation()
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)

  // NEW: Pro lines (with id/position/yield/notes)
  const [proLines, setProLines] = useState<ProLine[]>([])

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  // Kitchen id (for inserts)
  const [kitchenId, setKitchenId] = useState<string | null>(null)

  // Servings preview (Paprika-like scaling preview)
  const [servingsPreview, setServingsPreview] = useState(1)

  // Meta
  const [savingMeta, setSavingMeta] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [autoNLoading, setAutoNLoading] = useState(false)
  const [savingLines, setSavingLines] = useState(false)

  // Form fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')

  // Nutrition per portion
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

  const loadKitchen = async () => {
    // you already use current_kitchen_id() in Ingredients page
    const { data, error } = await supabase.rpc('current_kitchen_id')
    if (!error) {
      const kid = (data as string) ?? null
      setKitchenId(kid)
      return kid
    }
    setKitchenId(null)
    return null
  }

  const loadAll = async (recipeId: string) => {
    const kid = await loadKitchen()

    const { data: r, error: rErr } = await supabase
      .from('recipes')
      .select(
        'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
      )
      .eq('id', recipeId)
      .single()
    if (rErr) throw rErr

    const { data: i, error: iErr } = await supabase
      .from('ingredients')
      .select(
        'id,name,pack_unit,net_unit_cost,is_active,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,density_g_per_ml,grams_per_piece'
      )
      .order('name', { ascending: true })
    if (iErr) throw iErr

    // NEW: load pro lines with id/position/yield/notes
    const { data: l2, error: l2Err } = await supabase
      .from('recipe_lines')
      .select('id,kitchen_id,recipe_id,ingredient_id,position,qty,unit,yield_percent,notes')
      .eq('recipe_id', recipeId)
      .order('position', { ascending: true })
    if (l2Err) throw l2Err

    const rr = r as Recipe
    setRecipe(rr)

    setIngredients((i ?? []) as Ingredient[])

    // default servings preview = recipe portions
    setServingsPreview(Math.max(1, rr.portions ?? 1))

    const linesLoaded = (l2 ?? []) as any[]
    setProLines(
      linesLoaded.map((x, idx) => ({
        id: String(x.id),
        kitchen_id: (x.kitchen_id ?? kid ?? rr.kitchen_id ?? null) as any,
        recipe_id: String(x.recipe_id),
        ingredient_id: x.ingredient_id ?? null,
        position: toNum(x.position, idx + 1),
        qty: toNum(x.qty, 0),
        unit: safeUnit(String(x.unit ?? 'g')),
        yield_percent: toNum(x.yield_percent, 100),
        notes: x.notes ?? null,
      }))
    )

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

  const activeIngredients = useMemo(() => ingredients.filter((i) => i.is_active !== false), [ingredients])

  // Cost from PRO lines (same conversion logic as before) + yield_percent + servingsPreview
  const totalCostPreview = useMemo(() => {
    let sum = 0
    for (const l of proLines) {
      if (!l.ingredient_id) continue
      const ing = ingById.get(l.ingredient_id)
      if (!ing) continue

      const net = toNum(ing.net_unit_cost, 0)
      if (net <= 0) continue

      const qty = toNum(l.qty, 0) * Math.max(1, servingsPreview)

      const u = safeUnit(l.unit)
      const packUnit = safeUnit(ing.pack_unit ?? 'g')

      let conv = qty
      if (u === 'g' && packUnit === 'kg') conv = qty / 1000
      else if (u === 'kg' && packUnit === 'g') conv = qty * 1000
      else if (u === 'ml' && packUnit === 'l') conv = qty / 1000
      else if (u === 'l' && packUnit === 'ml') conv = qty * 1000

      let cost = conv * net

      const y = Math.min(100, Math.max(0, toNum(l.yield_percent, 100)))
      if (y > 0 && y < 100) cost = cost * (100 / y)

      sum += cost
    }
    return sum
  }, [proLines, ingById, servingsPreview])

  const portionsN = Math.max(1, toNum(portions, 1))
  const cpp = totalCostPreview / portionsN

  // Pricing metrics
  const sell = Math.max(0, toNum(sellingPrice, 0))
  const fcPct = sell > 0 ? (cpp / sell) * 100 : null
  const margin = sell - cpp
  const marginPct = sell > 0 ? (margin / sell) * 100 : null

  const target = Math.min(99, Math.max(1, toNum(targetFC, 30)))
  const suggestedPrice = target > 0 ? cpp / (target / 100) : 0

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

  // Save PRO lines: upsert by id, preserve position
  const saveProLines = async () => {
    if (!id) return
    setSavingLines(true)
    try {
      const kid = kitchenId ?? recipe?.kitchen_id ?? null

      const payload = proLines
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((l, idx) => ({
          id: l.id,
          kitchen_id: (l.kitchen_id ?? kid) as any,
          recipe_id: id,
          ingredient_id: l.ingredient_id,
          position: idx + 1,
          qty: toNum(l.qty, 0),
          unit: safeUnit(l.unit),
          yield_percent: Math.min(100, Math.max(0, toNum(l.yield_percent, 100))),
          notes: (l.notes ?? '').trim() || null,
        }))

      const { error } = await supabase.from('recipe_lines').upsert(payload, { onConflict: 'id' })
      if (error) throw error

      showToast('Lines saved ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Save lines failed')
    } finally {
      setSavingLines(false)
    }
  }

  // Delete line by ID (professional)
  const deleteProLine = async (lineId: string) => {
    if (!id) return
    try {
      const { error } = await supabase.from('recipe_lines').delete().eq('id', lineId).eq('recipe_id', id)
      if (error) throw error
      showToast('Line deleted ✅')
    } catch (e: any) {
      showToast(e?.message ?? 'Delete failed')
    }
  }

  // Step builder
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

  // Auto Nutrition uses PRO lines
  const autoNutrition = async () => {
    setAutoNLoading(true)
    try {
      let totalKcal = 0
      let totalP = 0
      let totalC = 0
      let totalF = 0

      let skipped = 0
      let missingNut = 0
      let missingConv = 0

      for (const l of proLines) {
        if (!l.ingredient_id) continue
        const ing = ingById.get(l.ingredient_id)
        if (!ing) continue

        const qty = toNum(l.qty, 0)
        const gramsRes = unitToGrams(qty, l.unit, ing)
        if (!gramsRes.ok) {
          if (gramsRes.reason.includes('missing')) missingConv += 1
          else skipped += 1
          continue
        }

        const k100 = ing.kcal_per_100g
        const p100 = ing.protein_per_100g
        const c100 = ing.carbs_per_100g
        const f100 = ing.fat_per_100g

        if (k100 == null && p100 == null && c100 == null && f100 == null) {
          missingNut += 1
          continue
        }

        const factor = gramsRes.grams / 100
        totalKcal += factor * toNum(k100, 0)
        totalP += factor * toNum(p100, 0)
        totalC += factor * toNum(c100, 0)
        totalF += factor * toNum(f100, 0)
      }

      const kcalPP = totalKcal / portionsN
      const pPP = totalP / portionsN
      const cPP = totalC / portionsN
      const fPP = totalF / portionsN

      setCalories(String(Math.max(0, Math.round(kcalPP))))
      setProtein(String(Math.max(0, Math.round(pPP * 10) / 10)))
      setCarbs(String(Math.max(0, Math.round(cPP * 10) / 10)))
      setFat(String(Math.max(0, Math.round(fPP * 10) / 10)))

      const parts = ['Auto nutrition calculated ✅']
      if (missingNut) parts.push(`${missingNut} ingredient(s) missing nutrition`)
      if (missingConv) parts.push(`${missingConv} line(s) missing density/grams-per-piece`)
      if (skipped) parts.push(`${skipped} line(s) skipped (unit not supported)`)
      showToast(parts.join(' · '))
    } catch (e: any) {
      showToast(e?.message ?? 'Auto nutrition failed')
    } finally {
      setAutoNLoading(false)
    }
  }

  const applySuggested = () => {
    if (!Number.isFinite(suggestedPrice) || suggestedPrice <= 0) return
    setSellingPrice(String(Math.round(suggestedPrice * 100) / 100))
    showToast('Suggested price applied ✅ (remember Save)')
  }

  const uploadPhoto = async (file: File) => {
    if (!id) return
    setUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `recipes/${id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage.from('recipe-photos').upload(key, {
        upsert: true,
        contentType: file.type,
      } as any)

      if (upErr) {
        const { error: upErr2 } = await supabase.storage.from('recipe-photos').upload(key, file, {
          upsert: true,
          contentType: file.type,
        })
        if (upErr2) throw upErr2
      }

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

  const ingredientPickList: IngredientPick[] = activeIngredients.map((i) => ({
    id: i.id,
    name: i.name,
    pack_unit: i.pack_unit,
    net_unit_cost: i.net_unit_cost,
  }))

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
              <div className="gc-label">RECIPE EDITOR (PRO LINES + AUTO NUTRITION + PRICING)</div>

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
                  <div className="gc-label">PORTIONS (SAVED)</div>
                  <input
                    className="gc-input mt-2 w-full"
                    type="number"
                    min={1}
                    step="1"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                  />
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

              <div className="mt-4">
                <ServingsSlider value={servingsPreview} onChange={setServingsPreview} min={1} max={200} />
                <div className="mt-1 text-xs text-neutral-500">
                  This slider changes <span className="font-semibold">preview</span> quantities & cost (Paprika-style). It does not change saved portions.
                </div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="gc-label">COST (PREVIEW)</div>
            <div className="mt-1 text-2xl font-extrabold">{fmtMoney(totalCostPreview, currency)}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Cost/portion (based on saved portions): <span className="font-semibold">{fmtMoney(cpp, currency)}</span>
            </div>
            <div className="mt-2 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Pro Ingredient Lines */}
      <RecipeLinesPro
        currency={currency}
        servingsPreview={servingsPreview}
        kitchenId={kitchenId ?? recipe.kitchen_id ?? null}
        recipeId={recipe.id}
        ingredients={ingredientPickList}
        lines={proLines}
        setLines={setProLines}
        onSave={saveProLines}
        onDelete={deleteProLine}
      />

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

        {/* Nutrition */}
        <div className="gc-card p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="gc-label">NUTRITION (PER PORTION)</div>
              <div className="mt-1 text-xs text-neutral-500">Uses PRO lines. Supports g/kg + ml/l + pcs (needs density / grams-per-piece).</div>
            </div>
            <button className="gc-btn gc-btn-primary" type="button" onClick={autoNutrition} disabled={autoNLoading}>
              {autoNLoading ? 'Calculating…' : 'Auto-calc'}
            </button>
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
              <button className="gc-btn gc-btn-ghost" type="button" onClick={saveProLines} disabled={savingLines}>
                {savingLines ? 'Saving lines…' : 'Save lines'}
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

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
