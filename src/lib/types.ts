export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface Restaurant {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  prep_time?: number;
  cook_time?: number;
  total_time?: number;
  servings: number;
  yield_amount?: number;
  yield_unit?: string;
  sale_price?: number;
  status: 'draft' | 'published' | 'archived';
  tags?: string[];
  image_url?: string;
  created_by: string;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category?: string;
  unit: string;
  cost_per_unit: number;
  supplier_id?: string;
  min_stock_level?: number;
  allergens?: string[];
  nutritional_info?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  created_by: string;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  yield_percentage?: number;
  waste_percentage?: number;
  notes?: string;
  sort_order?: number;
  ingredient: Ingredient;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  step_number: number;
  description: string;
  timer_duration?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface IngredientCostHistory {
  id: string;
  ingredient_id: string;
  cost_per_unit: number;
  effective_date: string;
  note?: string;
  created_by: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_by: string;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
}

export interface RecipeMetrics {
  total_cost: number;
  food_cost_percentage: number;
  profit_margin: number;
  cost_per_serving: number;
  total_calories: number;
}