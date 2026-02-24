import { supabase } from '../supabase';
import { Ingredient, IngredientCostHistory } from '../types';

export const ingredientApi = {
  async getAllIngredients(restaurantId: string) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return data as Ingredient[];
  },

  async getIngredientById(id: string, restaurantId: string) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) throw new Error(error.message);
    return data as Ingredient;
  },

  async createIngredient(ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('ingredients')
      .insert([ingredient])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Ingredient;
  },

  async updateIngredient(id: string, updates: Partial<Ingredient>) {
    const { data, error } = await supabase
      .from('ingredients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Ingredient;
  },

  async deleteIngredient(id: string) {
    const { error } = await supabase
      .from('ingredients')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async getIngredientCostHistory(ingredientId: string) {
    const { data, error } = await supabase
      .from('ingredient_cost_history')
      .select('*')
      .eq('ingredient_id', ingredientId)
      .order('effective_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data as IngredientCostHistory[];
  },

  async addIngredientCostHistory(history: Omit<IngredientCostHistory, 'id' | 'created_at'>) {
    const { data, error } = await supabase
      .from('ingredient_cost_history')
      .insert([history])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as IngredientCostHistory;
  }
};