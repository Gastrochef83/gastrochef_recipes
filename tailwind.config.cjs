export type Recipe = {
  id: string
  name: string
  category?: string | null
  portions?: number | null
  is_subrecipe?: boolean
  is_archived?: boolean
  photo_url?: string | null
  description?: string | null
  menu_price?: number | null
  total_cost?: number | null
  food_cost_percentage?: number | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export type RecipeIngredient = {
  id: string
  name: string
  quantity: number
  unit: string
  cost_per_unit: number
  yield_percent: number
  note?: string | null

  // Compatibility fields (if your DB uses different names)
  recipe_id?: string
  ingredient_name?: string
  net_qty?: number
  unit_cost?: number
}

export type CostPoint = {
  id: string
  recipe_id: string
  created_at: string
  total_cost: number
}
