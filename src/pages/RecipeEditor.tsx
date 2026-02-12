import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type Recipe = {
  id: string
  name: string
  category: string | null
  portions: number
  photo_url?: string | null
  description?: string | null

  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null

  selling_price?: number | null
  currency?: string | null
}

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
}

type Ingredient = {
  id: string
  name: string
  pack_unit: string | null
  net_unit_cost: number | null
  is_active: boolean
}

function toNum(x: any, f = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : f
}

export default function RecipeEditor() {
  const location = useLocation()
  const [sp] = useSearchParams()
  const id = sp.get('id')!

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [toast, setToast] = useState('')

  const loadAll = async () => {
    const { data: r } = await supabase.from('recipes').select('*').eq('id', id).single()
    const { data: l } = await supabase.from('recipe_lines').select('*').eq('recipe_id', id)
    const { data: i } = await supabase.from('ingredients').select('*').order('name')
    const { data: sr } = await supabase.from('recipes').select('id,name,portions')

    setRecipe(r)
    setLines(l ?? [])
    setIngredients(i ?? [])
    setRecipes(sr ?? [])
  }

  useEffect(() => {
    loadAll()
  }, [id])

  const ingById = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients])
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

  // ---------- Sub Recipe Cost Cache ----------
  const [subCostCache, setSubCostCache] = useState<Record<string, number>>({})

  const loadSubCost = async (rid: string): Promise<number> => {
    if (subCostCache[rid] != null) return subCostCache[rid]

    const { data } = await supabase.from('recipe_lines').select('*').eq('recipe_id', rid)

    let sum = 0
    for (const l of data ?? []) {
      if (l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        sum += toNum(l.qty) * toNum(ing?.net_unit_cost)
      }
    }

    setSubCostCache(p => ({ ...p, [rid]: sum }))
    return sum
  }

  // ---------- Total Cost ----------
  const [totalCost, setTotalCost] = useState(0)

  useEffect(() => {
    ;(async () => {
      let sum = 0

      for (const l of lines) {
        if (l.ingredient_id) {
          const ing = ingById.get(l.ingredient_id)
          sum += toNum(l.qty) * toNum(ing?.net_unit_cost)
        }

        if (l.sub_recipe_id) {
          const subCost = await loadSubCost(l.sub_recipe_id)
          sum += toNum(l.qty) * subCost
        }
      }

      setTotalCost(sum)
    })()
  }, [lines, ingredients])

  const toggleExpand = (id: string) =>
    setExpanded(p => ({ ...p, [id]: !p[id] }))

  if (!recipe) return <div className="gc-card p-6">Loading…</div>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="gc-card p-6">
        <div className="gc-label">RECIPE EDITOR — SUB RECIPES PRO</div>
        <div className="text-2xl font-bold mt-2">{recipe.name}</div>
        <div className="text-sm mt-2">Total Cost: {totalCost.toFixed(2)}</div>
      </div>

      {/* Lines */}
      <div className="gc-card p-6 space-y-3">

        {lines.map(l => {

          // ---------- Ingredient line ----------
          if (l.ingredient_id) {
            const ing = ingById.get(l.ingredient_id)
            return (
              <div key={l.id} className="flex justify-between border p-3 rounded-xl">
                <div>
                  <div className="font-semibold">{ing?.name}</div>
                  <div className="text-xs">{l.qty} {l.unit}</div>
                </div>
              </div>
            )
          }

          // ---------- Sub recipe line ----------
          if (l.sub_recipe_id) {
            const sr = recipeById.get(l.sub_recipe_id)
            const cost = subCostCache[l.sub_recipe_id] ?? 0

            return (
              <div key={l.id} className="border p-3 rounded-xl bg-amber-50">

                <div className="flex justify-between">
                  <div>
                    <div className="font-bold">Sub-Recipe: {sr?.name}</div>
                    <div className="text-xs">
                      qty × {l.qty} | unit cost: {cost.toFixed(2)}
                    </div>
                  </div>

                  <button
                    className="gc-btn gc-btn-ghost"
                    onClick={() => toggleExpand(l.id)}
                  >
                    Expand
                  </button>
                </div>

                {expanded[l.id] && (
                  <SubBreakdown recipeId={l.sub_recipe_id} />
                )}

              </div>
            )
          }

          return null
        })}

      </div>

      <NavLink className="gc-btn gc-btn-ghost" to="/recipes">
        ← Back
      </NavLink>

      <Toast open={!!toast} message={toast} onClose={() => setToast('')} />
    </div>
  )
}


// ---------- Sub Breakdown ----------
function SubBreakdown({ recipeId }: { recipeId: string }) {
  const [lines, setLines] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])

  useEffect(() => {
    supabase.from('recipe_lines').select('*').eq('recipe_id', recipeId)
      .then(r => setLines(r.data ?? []))

    supabase.from('ingredients').select('*')
      .then(r => setIngredients(r.data ?? []))
  }, [recipeId])

  const ingById = new Map(ingredients.map(i => [i.id, i]))

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {lines.map(l => (
        <div key={l.id} className="text-sm flex justify-between">
          <span>{ingById.get(l.ingredient_id)?.name}</span>
          <span>{l.qty} {l.unit}</span>
        </div>
      ))}
    </div>
  )
}
