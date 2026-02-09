import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Ingredient = {
  id: string
  name: string
  pack_unit: string
  net_unit_cost: number
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
}

type RecipeLine = {
  id: string
  recipe_id: string
  ingredient_id: string
  qty: number
  unit: string
}

function toNum(s: string, fallback = 0) {
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function safeUnit(u: string) {
  const x = (u ?? '').trim().toLowerCase()
  if (!x) return 'g'
  return x
}

// ✅ Parse ?id=... from HashRouter URL:
// Example: https://site/#/recipe-editor?id=UUID
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

  // Add line form
  const [pickIngredientId, setPickIngredientId] = useState<string>('')
  const [qty, setQty] = useState('0')
  const [unit, setUnit] = useState('g')

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
        'id,kitchen_id,name,category,portions,description,method,photo_urls,calories,protein_g,carbs_g,fat_g'
      )
      .eq('id', id)
      .single()
    if (error) throw error
    setRecipe(data as Recipe)
  }

  const loadIngredients = async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id,name,pack_unit,net_unit_cost')
      .order('name', { ascending: true })
    if (error) throw error
    setIngredients((data ?? []) as Ingredient[])
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
          setErr('Missing recipe id. Open this page as: #/recipe-editor?id=RECIPE_UUID')
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
      const net = ing?.net_unit_cost ?? 0
      const lineCost = (l.qty ?? 0) * net
      return { line: l, ing, net, lineCost }
    })
  }, [lines, ingredientById])

  const totals = useMemo(() => {
    const totalCost = rows.reduce((acc, r) => acc + r.lineCost, 0)
    const portions = recipe?.portions ?? 1
    const costPerPortion = portions > 0 ? totalCost / portions : totalCost
    return { totalCost, costPerPortion }
  }, [rows, recipe])

  const onAddLine = async () => {
    if (!recipeId) return alert('Missing recipe id')
    if (!pickIngredientId) return alert('Pick an ingredient')
    const q = toNum(qty, 0)
    if (q <= 0) return alert('Qty must be > 0')

    const payload = {
      recipe_id: recipeId,
      ingredient_id: pickIngredientId,
      qty: q,
      unit: safeUnit(unit),
    }

    const { error } = await supabase.from('recipe_lines').insert(payload)
    if (error) return alert(error.message)

    setPickIngredientId('')
    setQty('0')
    setUnit('g')
    await loadLines(recipeId)
  }

  const onUpdateLine = async (id: string, patch: Partial<RecipeLine>) => {
    const { error } = await supabase.from('recipe_lines').update(patch).eq('id', id)
    if (error) return alert(error.message)
    if (recipeId) await loadLines(recipeId)
  }

  const onDeleteLine = async (id: string) => {
    if (!confirm('Delete this line?')) return
    const { error } = await supabase.from('recipe_lines').delete().eq('id', id)
    if (error) return alert(error.message)
    if (recipeId) await loadLines(recipeId)
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPE EDITOR</div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">{recipe?.name ?? '—'}</div>
            <div className="mt-2 text-sm text-neutral-600">Ingredients + quantities + live costing preview.</div>
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
          <div className="gc-card p-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="gc-label">INGREDIENT</div>
                <select
                  className="gc-input mt-2 w-full"
                  value={pickIngredientId}
                  onChange={(e) => setPickIngredientId(e.target.value)}
                >
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
                <input className="gc-input mt-2" value={qty} onChange={(e) => setQty(e.target.value)} type="number" step="0.01" />
              </div>

              <div className="w-36">
                <div className="gc-label">UNIT</div>
                <input className="gc-input mt-2" value={unit} onChange={(e) => setUnit(e.target.value)} />
                <div className="mt-1 text-xs text-neutral-500">g / kg / ml / L / pcs</div>
              </div>

              <div>
                <button className="gc-btn gc-btn-primary" onClick={onAddLine} type="button">
                  + Add line
                </button>
              </div>
            </div>
          </div>

          <div className="gc-card p-6">
            <div className="gc-label">INGREDIENT LINES</div>

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
                      <th className="py-2 pr-0 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {rows.map(({ line, ing, net, lineCost }) => (
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

                        <td className="py-3 pr-0 text-right">
                          <button className="gc-btn gc-btn-ghost" onClick={() => onDeleteLine(line.id)} type="button">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}

                    <tr className="border-t">
                      <td className="py-3 pr-4 font-semibold" colSpan={4}>
                        Total
                      </td>
                      <td className="py-3 pr-4 text-sm font-extrabold">{money(totals.totalCost)}</td>
                      <td />
                    </tr>
                    <tr className="border-t">
                      <td className="py-3 pr-4 font-semibold" colSpan={4}>
                        Cost / portion ({recipe.portions})
                      </td>
                      <td className="py-3 pr-4 text-sm font-extrabold">{money(totals.costPerPortion)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
