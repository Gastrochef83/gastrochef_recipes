import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type Ingredient = {
  id: string
  name?: string
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  description: string | null
  method: string | null
  photo_urls: string[] | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null

  // Upgrade C fields
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
}

type RecipeLine = {
  id: string
  recipe_id: string
  ingredient_id: string
  qty: number
  unit: string
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function safeUnit(u: string) {
  const x = (u ?? '').trim().toLowerCase()
  return x || 'g'
}

// HashRouter query param (/#/recipe-editor?id=UUID)
function getHashQueryParam(key: string) {
  const h = window.location.hash || ''
  const qIndex = h.indexOf('?')
  if (qIndex === -1) return null
  const query = h.slice(qIndex + 1)
  const params = new URLSearchParams(query)
  return params.get(key)
}

export default function RecipeEditor() {
  const recipeId = useMemo(() => getHashQueryParam('id'), [])

  const [kitchenId, setKitchenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [lines, setLines] = useState<RecipeLine[]>([])

  // add line
  const [pickIngredientId, setPickIngredientId] = useState('')
  const [qty, setQty] = useState('0')
  const [unit, setUnit] = useState('g')

  // editor fields
  const [rName, setRName] = useState('')
  const [rCategory, setRCategory] = useState('')
  const [rPortions, setRPortions] = useState('1')
  const [rYieldQty, setRYieldQty] = useState('')
  const [rYieldUnit, setRYieldUnit] = useState('g')
  const [rSub, setRSub] = useState(false)
  const [rArchived, setRArchived] = useState(false)
  const [rDescription, setRDescription] = useState('')
  const [rMethod, setRMethod] = useState('')
  const [saving, setSaving] = useState(false)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const loadKitchen = async () => {
    const { data, error } = await supabase.rpc('current_kitchen_id')
    if (error) throw error
    const kid = (data as string) ?? null
    setKitchenId(kid)
    return kid
  }

  const loadRecipe = async (id: string) => {
    const { data, error } = await supabase
      .from('recipes')
      .select(
        'id,kitchen_id,name,category,portions,description,method,photo_urls,calories,protein_g,carbs_g,fat_g,yield_qty,yield_unit,is_subrecipe,is_archived'
      )
      .eq('id', id)
      .single()
    if (error) throw error
    const r = data as Recipe
    setRecipe(r)

    // seed form fields
    setRName(r.name ?? '')
    setRCategory(r.category ?? '')
    setRPortions(String(r.portions ?? 1))
    setRYieldQty(r.yield_qty == null ? '' : String(r.yield_qty))
    setRYieldUnit((r.yield_unit ?? 'g') || 'g')
    setRSub(!!r.is_subrecipe)
    setRArchived(!!r.is_archived)
    setRDescription(r.description ?? '')
    setRMethod(r.method ?? '')
  }

  const loadIngredients = async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    const list = (data ?? []) as Ingredient[]
    // show only active if the column exists, otherwise keep all
    setIngredients(list.filter((x) => (x.is_active ?? true)))
  }

  const loadLines = async (id: string) => {
    const { data, error } = await supabase
      .from('recipe_lines')
      .select('id,recipe_id,ingredient_id,qty,unit')
      .eq('recipe_id', id)
      .order('id', { ascending: true })
    if (error) throw error
    setLines((data ?? []) as RecipeLine[])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const kid = await loadKitchen()
        if (!kid) {
          setErr('No kitchen linked to this user yet.')
          setLoading(false)
          return
        }
        if (!recipeId) {
          setErr('Missing recipe id. Open as: #/recipe-editor?id=RECIPE_UUID')
          setLoading(false)
          return
        }
        await Promise.all([loadRecipe(recipeId), loadIngredients(), loadLines(recipeId)])
        setLoading(false)
      } catch (e: any) {
        setErr(e?.message ?? 'Unknown error')
        setLoading(false)
      }
    })()
  }, [recipeId])

  const ingredientById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const rows = useMemo(() => {
    return lines.map((l) => {
      const ing = ingredientById.get(l.ingredient_id)
      const net = toNum(ing?.net_unit_cost, 0)
      const lineCost = toNum(l.qty, 0) * net
      return { line: l, ing, net, lineCost }
    })
  }, [lines, ingredientById])

  const totals = useMemo(() => {
    const totalCost = rows.reduce((acc, r) => acc + r.lineCost, 0)
    const portions = Math.max(1, toNum(recipe?.portions, 1))
    const costPerPortion = totalCost / portions
    return { totalCost, costPerPortion }
  }, [rows, recipe])

  const onAddLine = async () => {
    if (!recipeId) return showToast('Missing recipe id')
    if (!pickIngredientId) return showToast('Pick an ingredient')
    const q = toNum(qty, 0)
    if (q <= 0) return showToast('Qty must be > 0')

    const payload = {
      recipe_id: recipeId,
      ingredient_id: pickIngredientId,
      qty: q,
      unit: safeUnit(unit),
    }

    const { error } = await supabase.from('recipe_lines').insert(payload)
    if (error) return showToast(error.message)

    setPickIngredientId('')
    setQty('0')
    setUnit('g')
    await loadLines(recipeId)
    showToast('Line added ✅')
  }

  const onUpdateLine = async (id: string, patch: Partial<RecipeLine>) => {
    const { error } = await supabase.from('recipe_lines').update(patch).eq('id', id)
    if (error) return showToast(error.message)
    if (recipeId) await loadLines(recipeId)
  }

  const onDeleteLine = async (id: string) => {
    const ok = confirm('Delete this line?')
    if (!ok) return
    const { error } = await supabase.from('recipe_lines').delete().eq('id', id)
    if (error) return showToast(error.message)
    if (recipeId) await loadLines(recipeId)
    showToast('Line deleted ✅')
  }

  const saveRecipe = async () => {
    if (!recipeId) return showToast('Missing recipe id')
    const name = rName.trim()
    if (!name) return showToast('Recipe name is required')

    setSaving(true)
    try {
      const payload: any = {
        name,
        category: rCategory.trim() || null,
        portions: Math.max(1, toNum(rPortions, 1)),
        description: rDescription.trim() || null,
        method: rMethod.trim() || null,
        is_subrecipe: !!rSub,
        is_archived: !!rArchived,
        yield_qty: rYieldQty.trim() === '' ? null : toNum(rYieldQty, 0),
        yield_unit: (rYieldUnit || '').trim() || null,
      }

      const { error } = await supabase.from('recipes').update(payload).eq('id', recipeId)
      if (error) throw error

      await loadRecipe(recipeId)
      showToast('Recipe saved ✅')
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPE EDITOR (PRO)</div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">{recipe?.name ?? '—'}</div>
            <div className="mt-2 text-sm text-neutral-600">Details, directions, ingredients, and live cost breakdown.</div>
            <div className="mt-3 text-xs text-neutral-500">
              Kitchen ID: {kitchenId ?? '—'} · Recipe ID: {recipeId ?? '—'}
            </div>
          </div>

          <div className="gc-card p-4">
            <div className="gc-label">COST</div>
            <div className="mt-2 text-2xl font-extrabold">{money(totals.totalCost)}</div>
            <div className="mt-2 text-xs text-neutral-500">
              Cost / portion ({recipe?.portions ?? 1}): <span className="font-semibold">{money(totals.costPerPortion)}</span>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="gc-card p-6">
          <div className="text-sm text-neutral-600">Loading…</div>
        </div>
      )}

      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && recipe && (
        <>
          {/* Recipe details */}
          <div className="gc-card p-6">
            <div className="gc-label">RECIPE DETAILS</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="gc-label">NAME</div>
                <input className="gc-input mt-2 w-full" value={rName} onChange={(e) => setRName(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">CATEGORY</div>
                <input className="gc-input mt-2 w-full" value={rCategory} onChange={(e) => setRCategory(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">PORTIONS</div>
                <input className="gc-input mt-2 w-full" type="number" min={1} step="1" value={rPortions} onChange={(e) => setRPortions(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">YIELD QTY</div>
                <input className="gc-input mt-2 w-full" type="number" step="0.01" value={rYieldQty} onChange={(e) => setRYieldQty(e.target.value)} placeholder="optional" />
              </div>

              <div>
                <div className="gc-label">YIELD UNIT</div>
                <select className="gc-input mt-2 w-full" value={rYieldUnit} onChange={(e) => setRYieldUnit(e.target.value)}>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="L">L</option>
                  <option value="pcs">pcs</option>
                  <option value="portion">portion</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={rSub} onChange={(e) => setRSub(e.target.checked)} />
                  Sub-Recipe
                </label>

                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={rArchived} onChange={(e) => setRArchived(e.target.checked)} />
                  Archived
                </label>

                <div className="ml-auto">
                  <button className="gc-btn gc-btn-primary" type="button" onClick={saveRecipe} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Recipe'}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">DESCRIPTION / NOTES</div>
                <textarea className="gc-input mt-2 w-full" rows={3} value={rDescription} onChange={(e) => setRDescription(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">DIRECTIONS / METHOD</div>
                <textarea className="gc-input mt-2 w-full" rows={8} value={rMethod} onChange={(e) => setRMethod(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Add line */}
          <div className="gc-card p-6">
            <div className="gc-label">ADD INGREDIENT LINE</div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="gc-label">INGREDIENT</div>
                <select className="gc-input mt-2 w-full" value={pickIngredientId} onChange={(e) => setPickIngredientId(e.target.value)}>
                  <option value="">Select ingredient…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-40">
                <div className="gc-label">QTY</div>
                <input className="gc-input mt-2 w-full" value={qty} onChange={(e) => setQty(e.target.value)} type="number" step="0.01" />
              </div>

              <div className="w-44">
                <div className="gc-label">UNIT</div>
                <select className="gc-input mt-2 w-full" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="L">L</option>
                  <option value="pcs">pcs</option>
                  <option value="portion">portion</option>
                </select>
              </div>

              <div>
                <button className="gc-btn gc-btn-primary" onClick={onAddLine} type="button">
                  + Add line
                </button>
              </div>
            </div>
          </div>

          {/* Lines table */}
          <div className="gc-card p-6">
            <div className="gc-label">INGREDIENT LINES (COST BREAKDOWN)</div>

            {rows.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-600">No lines yet. Add your first ingredient line.</div>
            ) : (
              <div className="mt-4 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold text-neutral-500">
                    <tr>
                      <th className="py-2 pr-4">Ingredient</th>
                      <th className="py-2 pr-4">Qty</th>
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Net Unit Cost</th>
                      <th className="py-2 pr-4">Line Cost</th>
                      <th className="py-2 pr-4">% of Total</th>
                      <th className="py-2 pr-0 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="align-top">
                    {rows.map(({ line, ing, net, lineCost }) => {
                      const pct = totals.totalCost > 0 ? (lineCost / totals.totalCost) * 100 : 0
                      return (
                        <tr key={line.id} className="border-t">
                          <td className="py-3 pr-4">
                            <div className="font-semibold">{ing?.name ?? line.ingredient_id}</div>
                          </td>

                          <td className="py-3 pr-4">
                            <input
                              className="gc-input w-28"
                              type="number"
                              step="0.01"
                              value={String(line.qty)}
                              onChange={(e) => onUpdateLine(line.id, { qty: toNum(e.target.value, line.qty) })}
                            />
                          </td>

                          <td className="py-3 pr-4">
                            <input className="gc-input w-28" value={line.unit} onChange={(e) => onUpdateLine(line.id, { unit: safeUnit(e.target.value) })} />
                          </td>

                          <td className="py-3 pr-4">{money(net)}</td>
                          <td className="py-3 pr-4 font-semibold">{money(lineCost)}</td>
                          <td className="py-3 pr-4">{pct.toFixed(1)}%</td>

                          <td className="py-3 pr-0 text-right">
                            <button className="gc-btn gc-btn-ghost" onClick={() => onDeleteLine(line.id)} type="button">
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}

                    <tr className="border-t">
                      <td className="py-3 pr-4 font-semibold" colSpan={4}>
                        Total
                      </td>
                      <td className="py-3 pr-4 text-sm font-extrabold">{money(totals.totalCost)}</td>
                      <td className="py-3 pr-4">{totals.totalCost > 0 ? '100.0%' : '0.0%'}</td>
                      <td />
                    </tr>
                    <tr className="border-t">
                      <td className="py-3 pr-4 font-semibold" colSpan={4}>
                        Cost / portion ({recipe.portions})
                      </td>
                      <td className="py-3 pr-4 text-sm font-extrabold">{money(totals.costPerPortion)}</td>
                      <td />
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
