// Global types for GastroChef v5

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CHEF = 'chef',
  COOK = 'cook'
}

export interface Restaurant {
  id: string;
  name: string;
  owner_id: string;
  settings: RestaurantSettings;
  created_at: string;
  updated_at: string;
}

export interface RestaurantSettings {
  currency: string;
  default_portion_size: number;
  tax_rate: number;
  profit_margin: number;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  instructions: string;
  prep_time: number;
  cook_time: number;
  total_time: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine_type?: string;
  dietary_tags?: string[];
  status: 'draft' | 'published' | 'archived';
  image_url?: string;
  video_url?: string;
  created_by: string;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
  // Computed fields
  total_cost?: number;
  cost_per_portion?: number;
  total_weight?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface RecipeLine {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  notes?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  supplier?: string;
  base_unit: string;
  density?: number; // g/ml for conversion
  allergens: string[];
  nutritional_info?: NutritionalInfo;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

export interface NutritionalInfo {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  sodium: number; // mg
  sugar: number; // grams
  fiber: number; // grams
}

export interface IngredientCostHistory {
  id: string;
  ingredient_id: string;
  cost_per_unit: number;
  effective_date: string;
  source: string; // 'manual', 'api', 'upload'
  created_by: string;
  created_at: string;
}

export interface NutritionProfile {
  id: string;
  recipe_id: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_sodium: number;
  total_sugar: number;
  total_fiber: number;
  calculated_at: string;
}

export interface RecipeAnalytics {
  id: string;
  recipe_id: string;
  views: number;
  saves: number;
  ratings_avg: number;
  ratings_count: number;
  last_accessed: string;
  created_at: string;
  updated_at: string;
}

export interface CookSession {
  id: string;
  recipe_id: string;
  started_at: string;
  ended_at?: string;
  notes?: string;
  user_id: string;
  status: 'active' | 'completed' | 'abandoned';
}

export interface DashboardKPI {
  total_recipes: number;
  total_ingredients: number;
  avg_recipe_cost: number;
  total_cost_this_month: number;
  recipes_published: number;
  top_ingredients: Array<{id: string, name: string, count: number}>;
}

export interface CostHistoryPoint {
  date: string;
  cost: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
}

export interface AppState {
  theme: 'light' | 'dark' | 'system';
  locale: string;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}