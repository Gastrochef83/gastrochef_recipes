export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs'

export type Recipe = {
  id: string
  kitchen_id?: string
  name: string
  category?: string | null
  portions?: number
  is_subrecipe?: boolean
  is_archived?: boolean
  photo_url?: string | null
  description?: string | null

  method?: string | null
  notes?: string | null

  // Pricing / cost metrics (optional — depends on your DB)
  menu_price?: number | null
  total_cost?: number | null
  food_cost_percentage?: number | null
}

export type RecipeIngredient = {
  id: string
  recipe_id?: string
  name: string
  quantity: number
  unit: Unit | string
  cost_per_unit: number
  yield_percent: number
}

export type CostPoint = {
  id?: string
  recipe_id: string
  date: string
  cost: number
}
