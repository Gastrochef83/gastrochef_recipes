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
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

type Line = {
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
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

function moneyUSD(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function unitFamily(u: string) {
  const x = safeUnit(u)
  if (x === 'g' || x === 'kg') return 'mass'
  if (x === 'ml' || x === 'l') return 'volume'
  if (x === 'pcs') return 'count'
  return 'other'
}

function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const from = safeUnit(fromUnit)
  const to = safeUnit(toUnit)
  if (from === to) return qty
  if (unitFamily(from) !== unitFamily(to)) return qty
  if (from === 'g' && to === 'kg') return qty / 1000
  if (from === 'kg' && to === 'g') return qty * 1000
  if (from === 'ml' && to === 'l') return qty / 1000
  if (from === 'l' && to === 'ml') return qty * 1000
  return qty
}

function extFromType(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
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

  // Add-line UI
  const [addOpen, setAddOpen] = useState(false)
  const [addIngredientId, setAddIngredientId] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [addUnit, setAddUnit] = useState('g')
  const [savingLine, setSavingLine] = useState(false)

  // Editor fields
  const [savingMeta, setSavingMeta] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const [uploading, setUploading] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const loadAll = async (recipeId: string) => {
    const { data: r, error: rErr } = await supabase
      .from('recipes')
      .select(
        'id,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,calories,protein_g,carbs_g,fat_g'
      )
      .eq('id', recipeId)
      .single()
    if (rErr) throw rErr

    const { data: l, error: lErr } = await supabase
      .from('recipe_lines')
      .select('recipe_id,ingredient_id,sub_recipe_id,qty,unit')
      .eq('recipe_id', recipeId)
    if (lErr) throw lErr

    const { data: i, error: iErr } = await supabase
      .from('ingredients')
      .select('id,name,pack_unit,net_unit_cost,is_active')
      .order('name', { ascending: true })
    if (iErr) throw iErr

    const rr = r as Recipe
    setRecipe(rr)
    setLines((l ?? []) as Line[])
    setIngredients((i ?? []) as Ingredient[])

    // hydrate form
    setName(rr.name ?? '')
    setCategory(rr.category ?? '')
    setPortions(String(rr.portions ?? 1))
    setDescription(rr.description ?? '')
    setMethod(rr.method ?? '')
    setCalories(rr.calories == null ? '' : String(rr.calories))
    setProtein(rr.protein_g == null ? '' : String(rr.protein_g))
    setCarbs(rr.carbs_g == null ? '' : String(rr.carbs_g))
    setFat(rr.fat_g == null ? '' : String(rr.fat_g))
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

  const activeIngredients = useMemo(() => {
    return ingredients.filter((i) => i.is_active !== false)
  }, [ingredients])

  const totalCost = useMemo(() => {
    let sum = 0
    for (const l of lines) {
      const qty = toNum(l.qty, 0)
      if (l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        const packUnit = safeUnit(ing?.pack_unit ?? 'g')
        const net = toNum(ing?.net_unit_cost, 0)
        const convQty = convertQty(qty, l.unit, packUnit)
        sum += convQty * net
      }
    }
    return sum
  }, [lines, ingById])

  const saveMeta = async () => {
    if (!id) return
    setSavingMeta(true)
    try {
      const payload = {
        name: name.trim() || 'Untitled',
        category: category.trim() || null,
        portions: Math.max(1, toNum(portions, 1)),
        description: description.trim() || null,
        method: method.trim() || null,
        calories: calories.trim() === '' ? null : Math.max(0, Math.floor(toNum(calories, 0))),
        protein_g: protein.trim() === '' ? null : Math.max(0, toNum(protein, 0)),
        carbs_g: carbs.trim() === '' ? null : Math.max(0, toNum(carbs, 0)),
        fat_g: fat.trim() === '' ? null : Math.max(0, toNum(fat, 0)),
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

  const addLine = async () => {
    if (!id) return
    if (!addIngredientId) return showToast('Pick an ingredient first')
    const qty = Math.max(0, toNum(addQty, 0))
    if (qty <= 0) return showToast('Qty must be > 0')

    setSavingLine(true)
    try {
      const payload = {
        recipe_id: id,
        ingredient_id: addIngredientId,
        sub_recipe_id: null,
        qty,
        unit: safeUnit(addUnit),
      }

      const { error } = await supabase.from('recipe_lines').insert(payload)
      if (error) throw error

      showToast('Line added ✅')
      setAddOpen(false)
      setAddIngredientId('')
      setAddQty('1')
      setAddUnit('g')

      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Add failed')
    } finally {
      setSavingLine(false)
    }
  }

  const deleteLine = async (idx: number) => {
    if (!id) return
    const line = lines[idx]
    if (!line) return
    try {
      const { error } = await supabase
        .from('recipe_lines')
        .delete()
        .eq('recipe_id', id)
        .eq('qty', line.qty)
        .eq('unit', line.unit)
        .is('sub_recipe_id', null)
        .eq('ingredient_id', line.ingredient_id)

      if (error) throw error
      showToast('Line deleted ✅')
      await loadAll(id)
    } catch (e: any) {
      showToast(e?.message ?? 'Delete failed')
    }
  }

  const uploadPhoto = async (file: File) => {
    if (!id) return
    setUploading(true)
    try {
      const ext = extFromType(file.type)
      const key = `recipes/${id}/${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('recipe-photos')
        .upload(key, file, { upsert: true, contentType: file.type })

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

  const portionsN = Math.max(1, toNum(recipe.portions, 1))
  const cpp = totalCost / portionsN

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
              {recipe.photo_url ? (
                <img src={recipe.photo_url} alt={recipe.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">No Photo</div>
              )}
            </div>

            <div className="min-w-[min(520px,92vw)]">
              <div className="gc-label">RECIPE</div>

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

                <div className="flex items-end gap-2">
                  <label className="gc-btn gc-btn-ghost cursor-pointer">
                    {uploading ? 'Uploading…' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadPhoto(f)
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

          {/* Cost preview */}
          <div className="text-right">
            <div className="gc-label">COST</div>
            <div className="mt-1 text-2xl font-extrabold">{moneyUSD(totalCost)}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Cost/portion: <span className="font-semibold">{moneyUSD(cpp)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description + Method + Nutrition */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="gc-card p-6">
          <div className="gc-label">DESCRIPTION</div>
          <textarea
            className="gc-input mt-3 w-full min-h-[140px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short premium description for menu / customers..."
          />
        </div>

        <div className="gc-card p-6">
          <div className="gc-label">NUTRITION</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="gc-label">CALORIES (kcal)</div>
              <input
                className="gc-input mt-2 w-full"
                type="number"
                min={0}
                step="1"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
            </div>

            <div>
              <div className="gc-label">PROTEIN (g)</div>
              <input
                className="gc-input mt-2 w-full"
                type="number"
                min={0}
                step="0.1"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </div>

            <div>
              <div className="gc-label">CARBS (g)</div>
              <input
                className="gc-input mt-2 w-full"
                type="number"
                min={0}
                step="0.1"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </div>

            <div>
              <div className="gc-label">FAT (g)</div>
              <input
                className="gc-input mt-2 w-full"
                type="number"
                min={0}
                step="0.1"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 text-xs text-neutral-500">
            Tip: these values can be per-portion or per-recipe (your choice). We can standardize later.
          </div>
        </div>

        <div className="gc-card p-6 lg:col-span-2">
          <div className="gc-label">METHOD</div>
          <textarea
            className="gc-input mt-3 w-full min-h-[220px]"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder={`Step-by-step method (professional):
1) Prep...
2) Cook...
3) Plate...`}
          />
        </div>
      </div>

      {/* Ingredients lines */}
      <div className="gc-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="gc-label">INGREDIENTS</div>
            <div className="mt-1 text-sm text-neutral-600">Costing lines (ingredients).</div>
          </div>

          <button className="gc-btn gc-btn-primary" type="button" onClick={() => setAddOpen(true)}>
            + Add Ingredient
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-600">No lines yet. Add your first ingredient.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
              >
                <div className="text-sm">
                  <div className="font-semibold">
                    {l.ingredient_id ? (ingById.get(l.ingredient_id)?.name ?? 'Ingredient') : 'Sub-recipe line'}
                  </div>
                  <div className="text-xs text-neutral-500">
                    qty: {l.qty} {l.unit}
                  </div>
                </div>

                <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deleteLine(idx)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add line modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(780px,92vw)] -translate-x-1/2 -translate-y-1/2">
            <div className="gc-card p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="gc-label">ADD INGREDIENT</div>
                  <div className="mt-1 text-xl font-extrabold">Line Item</div>
                </div>
                <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setAddOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="gc-label">INGREDIENT</div>
                  <select
                    className="gc-input mt-2 w-full"
                    value={addIngredientId}
                    onChange={(e) => setAddIngredientId(e.target.value)}
                  >
                    <option value="">Select ingredient…</option>
                    {activeIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name ?? i.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="gc-label">QTY</div>
                  <input
                    className="gc-input mt-2 w-full"
                    type="number"
                    min={0}
                    step="0.01"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                </div>

                <div>
                  <div className="gc-label">UNIT</div>
                  <input
                    className="gc-input mt-2 w-full"
                    value={addUnit}
                    onChange={(e) => setAddUnit(e.target.value)}
                    placeholder="g / kg / ml / l / pcs"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2">
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setAddOpen(false)}>
                    Cancel
                  </button>
                  <button className="gc-btn gc-btn-primary" type="button" onClick={addLine} disabled={savingLine}>
                    {savingLine ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
