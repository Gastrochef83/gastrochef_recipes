// src/lib/backupJson.ts
import { supabase } from './supabase'

type BackupV1 = {
  version: 'gc_backup_v1'
  exportedAt: string
  kitchenName?: string
  ingredients: Array<any>
  recipes: Array<any>
}

function safeName(s: any) {
  return String(s ?? '').trim()
}

function uniqName(existing: Set<string>, base: string) {
  const clean = base.trim() || 'Recipe'
  if (!existing.has(clean.toLowerCase())) return clean
  let n = 2
  while (existing.has(`${clean} (${n})`.toLowerCase())) n += 1
  return `${clean} (${n})`
}

export async function exportKitchenBackup(kitchenId: string, kitchenName?: string): Promise<BackupV1> {
  // Ingredients
  const { data: ing, error: ie } = await supabase
    .from('ingredients')
    .select('id,name,pack_unit,pack_size,pack_price,net_unit_cost,is_active')
    .eq('kitchen_id', kitchenId)
    .order('name', { ascending: true })
  if (ie) throw ie

  // Recipes
  const { data: rec, error: re } = await supabase
    .from('recipes')
    .select(
      'id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
    )
    .eq('kitchen_id', kitchenId)
    .order('is_archived', { ascending: true })
    .order('name', { ascending: true })
  if (re) throw re

  const ingById = new Map<string, any>()
  ;(ing ?? []).forEach((x: any) => ingById.set(String(x.id), x))

  const recById = new Map<string, any>()
  ;(rec ?? []).forEach((x: any) => recById.set(String(x.id), x))

  const recipeIds = (rec ?? []).map((r: any) => String(r.id))
  let lines: any[] = []
  if (recipeIds.length) {
    const { data: l, error: le } = await supabase
      .from('recipe_lines')
      .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,yield_percent,notes,gross_qty_override,position,line_type,group_title')
      .in('recipe_id', recipeIds)
      .order('position', { ascending: true })
    if (le) throw le
    lines = (l ?? []) as any[]
  }

  const linesByRecipe: Record<string, any[]> = {}
  for (const l of lines) {
    const rid = String(l.recipe_id)
    if (!linesByRecipe[rid]) linesByRecipe[rid] = []
    linesByRecipe[rid].push(l)
  }

  const recipesOut = (rec ?? []).map((r: any) => {
    const rid = String(r.id)
    const lns = (linesByRecipe[rid] ?? []).map((l: any) => {
      const ingName = l.ingredient_id ? safeName(ingById.get(String(l.ingredient_id))?.name) : ''
      const subName = l.sub_recipe_id ? safeName(recById.get(String(l.sub_recipe_id))?.name) : ''
      return {
        line_type: l.line_type,
        position: l.position,
        group_title: l.group_title ?? null,
        ingredient_name: ingName || null,
        sub_recipe_name: subName || null,
        qty: l.qty,
        unit: l.unit,
        yield_percent: l.yield_percent,
        notes: l.notes ?? null,
        gross_qty_override: l.gross_qty_override ?? null
      }
    })

    return {
      name: r.name,
      category: r.category ?? null,
      portions: r.portions,
      yield_qty: r.yield_qty ?? null,
      yield_unit: r.yield_unit ?? null,
      is_subrecipe: !!r.is_subrecipe,
      is_archived: !!r.is_archived,
      photo_url: r.photo_url ?? null,
      description: r.description ?? null,
      method: r.method ?? null,
      calories: r.calories ?? null,
      protein_g: r.protein_g ?? null,
      carbs_g: r.carbs_g ?? null,
      fat_g: r.fat_g ?? null,
      selling_price: r.selling_price ?? null,
      currency: r.currency ?? null,
      target_food_cost_pct: r.target_food_cost_pct ?? null,
      lines: lns
    }
  })

  return {
    version: 'gc_backup_v1',
    exportedAt: new Date().toISOString(),
    kitchenName,
    ingredients: (ing ?? []).map((i: any) => ({
      name: i.name,
      pack_unit: i.pack_unit ?? null,
      pack_size: i.pack_size ?? null,
      pack_price: i.pack_price ?? null,
      net_unit_cost: i.net_unit_cost ?? null,
      is_active: i.is_active !== false
    })),
    recipes: recipesOut
  }
}

export async function importKitchenBackup(kitchenId: string, backup: any): Promise<{ createdIngredients: number; createdRecipes: number; createdLines: number }>{
  if (!backup || backup.version !== 'gc_backup_v1') {
    throw new Error('Unsupported backup file (expected gc_backup_v1).')
  }

  const ingredientsIn: any[] = Array.isArray(backup.ingredients) ? backup.ingredients : []
  const recipesIn: any[] = Array.isArray(backup.recipes) ? backup.recipes : []

  // 1) Ensure ingredients exist (match by name)
  const { data: existingIng, error: eIng } = await supabase
    .from('ingredients')
    .select('id,name')
    .eq('kitchen_id', kitchenId)
  if (eIng) throw eIng

  const nameToIngId = new Map<string, string>()
  ;(existingIng ?? []).forEach((r: any) => {
    const n = safeName(r.name).toLowerCase()
    if (n) nameToIngId.set(n, String(r.id))
  })

  const ingToInsert = ingredientsIn
    .map((i) => ({
      kitchen_id: kitchenId,
      name: safeName(i.name),
      pack_unit: i.pack_unit ?? null,
      pack_size: i.pack_size ?? null,
      pack_price: i.pack_price ?? null,
      net_unit_cost: i.net_unit_cost ?? null,
      is_active: i.is_active !== false
    }))
    .filter((i) => i.name && !nameToIngId.has(i.name.toLowerCase()))

  let createdIngredients = 0
  if (ingToInsert.length) {
    const { data, error } = await supabase.from('ingredients').insert(ingToInsert as any).select('id,name')
    if (error) throw error
    createdIngredients = (data ?? []).length
    ;(data ?? []).forEach((r: any) => {
      const n = safeName(r.name).toLowerCase()
      if (n) nameToIngId.set(n, String(r.id))
    })
  }

  // 2) Create recipes (avoid overwriting by using unique names)
  const { data: existingRec, error: eRec } = await supabase
    .from('recipes')
    .select('id,name')
    .eq('kitchen_id', kitchenId)
  if (eRec) throw eRec

  const usedNames = new Set<string>()
  ;(existingRec ?? []).forEach((r: any) => usedNames.add(safeName(r.name).toLowerCase()))

  const createdRecipeIdByName = new Map<string, string>()
  let createdRecipes = 0
  let createdLines = 0

  // First pass: create all recipes
  const recipeNameMap: Array<{ inputName: string; createdName: string; createdId: string; isSub: boolean }> = []

  for (const r of recipesIn) {
    const inputName = safeName(r.name) || 'Imported Recipe'
    const createdName = uniqName(usedNames, inputName)
    usedNames.add(createdName.toLowerCase())

    const payload: any = {
      kitchen_id: kitchenId,
      name: createdName,
      category: r.category ?? null,
      portions: Number.isFinite(Number(r.portions)) ? Number(r.portions) : 1,
      yield_qty: r.yield_qty ?? null,
      yield_unit: r.yield_unit ?? null,
      is_subrecipe: !!r.is_subrecipe,
      is_archived: !!r.is_archived,
      photo_url: r.photo_url ?? null,
      description: r.description ?? null,
      method: r.method ?? null,
      calories: r.calories ?? null,
      protein_g: r.protein_g ?? null,
      carbs_g: r.carbs_g ?? null,
      fat_g: r.fat_g ?? null,
      selling_price: r.selling_price ?? null,
      currency: r.currency ?? null,
      target_food_cost_pct: r.target_food_cost_pct ?? null
    }

    const { data, error } = await supabase.from('recipes').insert(payload).select('id').single()
    if (error) throw error
    const createdId = String((data as any)?.id)

    createdRecipes += 1
    createdRecipeIdByName.set(createdName.toLowerCase(), createdId)
    recipeNameMap.push({ inputName, createdName, createdId, isSub: !!r.is_subrecipe })
  }

  // Helper: resolve sub-recipe by name from imported file (best effort)
  const resolveSubRecipeId = (subName: any) => {
    const s = safeName(subName).toLowerCase()
    if (!s) return null
    // Try exact created names first
    for (const m of recipeNameMap) {
      if (m.createdName.toLowerCase() === s) return m.createdId
    }
    // Try matching input names
    for (const m of recipeNameMap) {
      if (m.inputName.toLowerCase() === s) return m.createdId
    }
    return null
  }

  // Second pass: create lines for each recipe
  for (let i = 0; i < recipesIn.length; i += 1) {
    const r = recipesIn[i]
    const createdId = recipeNameMap[i]?.createdId
    if (!createdId) continue

    const linesIn: any[] = Array.isArray(r.lines) ? r.lines : []
    const payload = linesIn
      .map((l, idx) => {
        const lt = String(l.line_type || 'ingredient')
        if (lt === 'group') {
          return {
            recipe_id: createdId,
            ingredient_id: null,
            sub_recipe_id: null,
            qty: 0,
            unit: 'g',
            yield_percent: 100,
            notes: null,
            gross_qty_override: null,
            position: Number.isFinite(Number(l.position)) ? Number(l.position) : idx + 1,
            line_type: 'group',
            group_title: l.group_title ?? 'Group'
          }
        }

        if (lt === 'subrecipe') {
          const subId = resolveSubRecipeId(l.sub_recipe_name)
          return {
            recipe_id: createdId,
            ingredient_id: null,
            sub_recipe_id: subId,
            qty: Number(l.qty ?? 0) || 0,
            unit: safeName(l.unit) || 'g',
            yield_percent: Number(l.yield_percent ?? 100) || 100,
            notes: l.notes ?? null,
            gross_qty_override: l.gross_qty_override ?? null,
            position: Number.isFinite(Number(l.position)) ? Number(l.position) : idx + 1,
            line_type: 'subrecipe',
            group_title: l.group_title ?? null
          }
        }

        // ingredient
        const ingId = l.ingredient_name ? nameToIngId.get(safeName(l.ingredient_name).toLowerCase()) : null
        return {
          recipe_id: createdId,
          ingredient_id: ingId ?? null,
          sub_recipe_id: null,
          qty: Number(l.qty ?? 0) || 0,
          unit: safeName(l.unit) || 'g',
          yield_percent: Number(l.yield_percent ?? 100) || 100,
          notes: l.notes ?? null,
          gross_qty_override: l.gross_qty_override ?? null,
          position: Number.isFinite(Number(l.position)) ? Number(l.position) : idx + 1,
          line_type: 'ingredient',
          group_title: l.group_title ?? null
        }
      })
      .filter((x) => x.line_type !== 'ingredient' || x.ingredient_id) // only keep ingredient lines if resolved

    if (payload.length) {
      const { error } = await supabase.from('recipe_lines').insert(payload as any)
      if (error) throw error
      createdLines += payload.length
    }
  }

  return { createdIngredients, createdRecipes, createdLines }
}
