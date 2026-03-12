import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/*
V4 ULTRA COMPACT KITCHEN PRINT CARD
-----------------------------------
Goal:
Maximum information density for real kitchen usage.
Designed for:
• Kitchen wall print
• Prep station reference
• Fast reading by chefs
• Long ingredient lists (100+ items)
*/

type Recipe = {
  id: string
  code?: string | null
  code_category?: string | null
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  description: string | null
  method: string | null
  method_steps: string[] | null
  created_at: string | null
  yield_qty: number | null
  yield_unit: string | null
  currency: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price: number | null
  target_food_cost_pct: number | null
}

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number
  qty: number
  unit: string
  yield_percent: number
  gross_qty_override: number | null
  line_type: 'ingredient' | 'subrecipe' | 'group'
  group_title: string | null
}

type Ingredient = {
  id: string
  code?: string | null
  name: string | null
  net_unit_cost: number | null
}

type SubRecipe = {
  id: string
  code?: string | null
  name: string | null
}

function num(x: unknown, d = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : d
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function q(n: number) {
  if (Math.abs(n) >= 100) return n.toFixed(1)
  if (Math.abs(n) >= 10) return n.toFixed(2)
  return n.toFixed(3)
}

function money(n: number, c: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (c || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return n.toFixed(2)
  }
}

export default function RecipePrintCard() {
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [subs, setSubs] = useState<SubRecipe[]>([])

  const mounted = useRef(true)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!id) return

    ;(async () => {
      const { data: r } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single()

      const { data: l } = await supabase
        .from('recipe_lines')
        .select('*')
        .eq('recipe_id', id)
        .order('position')

      const ingredientIds = (l || [])
        .filter((x: any) => x.ingredient_id)
        .map((x: any) => x.ingredient_id)

      const { data: ing } = ingredientIds.length
        ? await supabase
            .from('ingredients')
            .select('id,code,name,net_unit_cost')
            .in('id', ingredientIds)
        : { data: [] }

      const { data: sr } = await supabase
        .from('recipes')
        .select('id,code,name')
        .eq('is_subrecipe', true)

      if (!mounted.current) return

      setRecipe(r)
      setLines(l || [])
      setIngredients(ing || [])
      setSubs(sr || [])
    })()
  }, [id])

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>()
    ingredients.forEach((i) => m.set(i.id, i))
    return m
  }, [ingredients])

  const subMap = useMemo(() => {
    const m = new Map<string, SubRecipe>()
    subs.forEach((s) => m.set(s.id, s))
    return m
  }, [subs])

  const rows = useMemo(() => {
    return lines.map((l) => {
      if (l.line_type === 'group') {
        return { group: true, title: l.group_title }
      }

      const net = num(l.qty)
      const y = clamp(num(l.yield_percent, 100), 0.0001, 100)

      const gross = l.gross_qty_override ?? net / (y / 100)

      let name = 'Item'
      let code
      let cost = 0
      let sub = false

      if (l.ingredient_id) {
        const i = ingMap.get(l.ingredient_id)
        name = i?.name || 'Ingredient'
        code = i?.code
        cost = num(i?.net_unit_cost)
      }

      if (l.sub_recipe_id) {
        const s = subMap.get(l.sub_recipe_id)
        name = s?.name || 'Sub Recipe'
        code = s?.code
        sub = true
      }

      const lineCost = net * cost

      return {
        group: false,
        code,
        name,
        sub,
        net,
        gross,
        yield: y,
        unit: l.unit,
        unitCost: cost,
        lineCost,
      }
    })
  }, [lines, ingMap, subMap])

  const totalCost = rows.reduce((s: number, r: any) => s + (r.lineCost || 0), 0)

  const portions = clamp(num(recipe?.portions, 1), 1, 9999)

  const portionCost = totalCost / portions

  if (!recipe) return null

  return (
    <>
      <style>{`
      @page{size:A4;margin:7mm}
      body{font-family:Inter,system-ui;background:white}
      table{border-collapse:collapse;width:100%}
      th{font-size:10px;text-transform:uppercase;letter-spacing:.06em}
      td{font-size:11px}
      `}</style>

      <div className="max-w-6xl mx-auto">

        {/* HEADER COMPACT */}

        <div className="flex justify-between items-center border-b pb-3 mb-4">
          <div>
            <div className="text-xs tracking-widest text-gray-500">GASTROCHEF</div>
            <div className="text-2xl font-semibold">{recipe.name}</div>
            <div className="text-xs text-gray-500">
              {recipe.code} • {recipe.category}
            </div>
          </div>

          <div className="text-right text-xs">
            <div>Portions: {portions}</div>
            <div>Yield: {recipe.yield_qty} {recipe.yield_unit}</div>
            <div>Printed: {new Date().toLocaleDateString()}</div>
          </div>
        </div>

        {/* COST BAR */}

        <div className="grid grid-cols-4 gap-2 text-xs mb-4">
          <Metric label="Total Cost" value={money(totalCost, recipe.currency || 'USD')} />
          <Metric label="Portion Cost" value={money(portionCost, recipe.currency || 'USD')} />
          <Metric label="Selling" value={money(num(recipe.selling_price), recipe.currency || 'USD')} />
          <Metric
            label="Food Cost"
            value={
              recipe.selling_price
                ? ((portionCost / recipe.selling_price) * 100).toFixed(1) + '%'
                : '—'
            }
          />
        </div>

        {/* INGREDIENT TABLE ULTRA COMPACT */}

        <table>
          <thead>
            <tr className="border-b">
              <th className="text-left">Code</th>
              <th className="text-left">Item</th>
              <th className="text-right">Net</th>
              <th>U</th>
              <th className="text-right">Gross</th>
              <th>U</th>
              <th className="text-right">Yield</th>
              <th className="text-right">Unit Cost</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r: any, i) => {
              if (r.group) {
                return (
                  <tr key={i} className="bg-gray-800 text-white">
                    <td colSpan={9} className="px-2 py-1 text-xs">
                      {r.title}
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={i} className="border-b">
                  <td className="text-gray-500">{r.code}</td>
                  <td className="font-medium">
                    {r.sub ? '↳ ' : ''}
                    {r.name}
                  </td>
                  <td className="text-right">{q(r.net)}</td>
                  <td>{r.unit}</td>
                  <td className="text-right">{q(r.gross)}</td>
                  <td>{r.unit}</td>
                  <td className="text-right">{r.yield.toFixed(1)}%</td>
                  <td className="text-right">{money(r.unitCost, recipe.currency || 'USD')}</td>
                  <td className="text-right font-semibold">
                    {money(r.lineCost, recipe.currency || 'USD')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* METHOD COMPACT */}

        {recipe.method && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">
              Method
            </div>
            <div className="text-sm leading-6 whitespace-pre-wrap">
              {recipe.method}
            </div>
          </div>
        )}

        {/* NUTRITION */}

        {(recipe.calories || recipe.protein_g) && (
          <div className="grid grid-cols-4 gap-2 text-xs mt-6">
            <Metric label="Calories" value={String(recipe.calories)} />
            <Metric label="Protein" value={String(recipe.protein_g) + ' g'} />
            <Metric label="Carbs" value={String(recipe.carbs_g) + ' g'} />
            <Metric label="Fat" value={String(recipe.fat_g) + ' g'} />
          </div>
        )}
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded px-2 py-1">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}
