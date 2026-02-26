
// src/lib/demoSeed.ts
import { supabase } from './supabase'

type SeedResult = { createdIngredients: number; createdRecipes: number; createdLines: number; skipped: boolean }

type DemoIngredient = { name: string; pack_unit: string; net_unit_cost: number }
type DemoLine = { name: string; qty: number; unit: string; cost_per_unit?: number; yield_percent?: number; note?: string | null }
type DemoRecipe = { name: string; category: string; portions: number; description: string; lines: DemoLine[] }

const DEMO_INGREDIENTS: DemoIngredient[] = [
  { name: 'Chicken Breast', pack_unit: 'kg', net_unit_cost: 7.5 },
  { name: 'Basmati Rice', pack_unit: 'kg', net_unit_cost: 2.2 },
  { name: 'Olive Oil', pack_unit: 'l', net_unit_cost: 6.0 },
  { name: 'Garlic', pack_unit: 'kg', net_unit_cost: 3.5 },
  { name: 'Lemon', pack_unit: 'kg', net_unit_cost: 2.8 },
  { name: 'Salt', pack_unit: 'kg', net_unit_cost: 0.6 },
  { name: 'Black Pepper', pack_unit: 'kg', net_unit_cost: 8.0 },
  { name: 'Greek Yogurt', pack_unit: 'kg', net_unit_cost: 3.2 },
  { name: 'Cucumber', pack_unit: 'kg', net_unit_cost: 1.4 },
  { name: 'Tomato', pack_unit: 'kg', net_unit_cost: 1.6 }
]

const DEMO_RECIPES: DemoRecipe[] = [
  {
    name: 'Demo — Chicken Rice Bowl',
    category: 'Demo',
    portions: 4,
    description: 'A simple, high-selling bowl with clean costs and fast prep.',
    lines: [
      { name: 'Chicken Breast', qty: 0.6, unit: 'kg', note: 'Trim & cube' },
      { name: 'Basmati Rice', qty: 0.4, unit: 'kg', note: 'Rinse well' },
      { name: 'Olive Oil', qty: 0.03, unit: 'l', note: 'For sear' },
      { name: 'Garlic', qty: 0.02, unit: 'kg' },
      { name: 'Salt', qty: 0.006, unit: 'kg' },
      { name: 'Black Pepper', qty: 0.002, unit: 'kg' }
    ]
  },
  {
    name: 'Demo — Tzatziki Sauce',
    category: 'Demo',
    portions: 6,
    description: 'A classic sauce to showcase sub-recipes later.',
    lines: [
      { name: 'Greek Yogurt', qty: 0.6, unit: 'kg' },
      { name: 'Cucumber', qty: 0.25, unit: 'kg', note: 'Grated & squeezed' },
      { name: 'Garlic', qty: 0.01, unit: 'kg' },
      { name: 'Lemon', qty: 0.03, unit: 'kg', note: 'Juice' },
      { name: 'Olive Oil', qty: 0.02, unit: 'l' },
      { name: 'Salt', qty: 0.004, unit: 'kg' },
      { name: 'Black Pepper', qty: 0.001, unit: 'kg' }
    ]
  },
  {
    name: 'Demo — Simple Salad',
    category: 'Demo',
    portions: 3,
    description: 'A quick salad to verify list, editor, and print flows.',
    lines: [
      { name: 'Cucumber', qty: 0.25, unit: 'kg' },
      { name: 'Tomato', qty: 0.25, unit: 'kg' },
      { name: 'Olive Oil', qty: 0.015, unit: 'l' },
      { name: 'Lemon', qty: 0.02, unit: 'kg' },
      { name: 'Salt', qty: 0.003, unit: 'kg' },
      { name: 'Black Pepper', qty: 0.001, unit: 'kg' }
    ]
  }
]

function lsKey(kitchenId: string) {
  return `gc_demo_seeded_v1:${kitchenId}`
}

/**
 * Seeds a small set of demo ingredients + demo recipes + lines.
 * Safe: no schema changes, no logic changes. Best-effort schema mapping.
 */
export async function seedDemoData(kitchenId: string): Promise<SeedResult> {
  // Soft guard (still allow re-seed if local storage cleared and DB empty)
  try {
    const cached = localStorage.getItem(lsKey(kitchenId))
    if (cached === '1') {
      // confirm DB already has demo
      const { data } = await supabase.from('recipes').select('id').eq('kitchen_id', kitchenId).ilike('name', 'Demo —%')
      if ((data ?? []).length) return { createdIngredients: 0, createdRecipes: 0, createdLines: 0, skipped: true }
    }
  } catch {
    // ignore
  }

  // If demo already exists in DB, skip
  const { data: existing } = await supabase.from('recipes').select('id').eq('kitchen_id', kitchenId).ilike('name', 'Demo —%')
  if ((existing ?? []).length) {
    try { localStorage.setItem(lsKey(kitchenId), '1') } catch {}
    return { createdIngredients: 0, createdRecipes: 0, createdLines: 0, skipped: true }
  }

  // 1) Ingredients
  const { data: ingExisting } = await supabase.from('ingredients').select('id,name').eq('kitchen_id', kitchenId)
  const nameToId = new Map<string, string>()
  ;(ingExisting ?? []).forEach((r: any) => {
    if (r?.name) nameToId.set(String(r.name), String(r.id))
  })

  const toInsert = DEMO_INGREDIENTS.filter((i) => !nameToId.has(i.name)).map((i) => ({
    kitchen_id: kitchenId,
    name: i.name,
    pack_unit: i.pack_unit,
    net_unit_cost: i.net_unit_cost,
    is_active: true
  }))

  let createdIngredients = 0
  if (toInsert.length) {
    const { data, error } = await supabase.from('ingredients').insert(toInsert as any).select('id,name')
    if (error) throw error
    createdIngredients = (data ?? []).length
    ;(data ?? []).forEach((r: any) => {
      if (r?.name) nameToId.set(String(r.name), String(r.id))
    })
  }

  // refresh ids for any already existing demo ingredients
  for (const i of DEMO_INGREDIENTS) {
    if (!nameToId.has(i.name)) {
      const { data } = await supabase.from('ingredients').select('id,name').eq('kitchen_id', kitchenId).eq('name', i.name).maybeSingle()
      if ((data as any)?.id) nameToId.set(i.name, String((data as any).id))
    }
  }

  // 2) Recipes + lines
  let createdRecipes = 0
  let createdLines = 0

  for (const r of DEMO_RECIPES) {
    const payload: any = {
      kitchen_id: kitchenId,
      name: r.name,
      category: r.category,
      portions: r.portions,
      is_subrecipe: false,
      is_archived: false,
      description: r.description,
      photo_url: null
    }

    const { data: recipeRow, error: rErr } = await supabase.from('recipes').insert(payload).select('id').single()
    if (rErr) throw rErr
    const recipeId = String((recipeRow as any)?.id)
    createdRecipes += 1

    const linesPayload = r.lines
      .map((l, idx) => {
        const ingredientId = nameToId.get(l.name) ?? null
        return {
          recipe_id: recipeId,
          ingredient_id: ingredientId,
          sub_recipe_id: null,
          qty: l.qty,
          unit: l.unit,
          notes: l.note ?? null,
          position: idx + 1,
          line_type: 'ingredient',
          group_title: null
        }
      })
      .filter((x) => x.ingredient_id) // only if ingredient exists

    if (linesPayload.length) {
      const { error: lErr } = await supabase.from('recipe_lines').insert(linesPayload as any)
      if (lErr) throw lErr
      createdLines += linesPayload.length
    }
  }

  try { localStorage.setItem(lsKey(kitchenId), '1') } catch {}
  return { createdIngredients, createdRecipes, createdLines, skipped: false }
}
