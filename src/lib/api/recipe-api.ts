import { supabase } from '../supabase';
import { Recipe, RecipeIngredient, RecipeStep, RecipeMetrics } from '../types';

export const recipeApi = {
  async getAllRecipes(restaurantId: string) {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*, ingredient (*)),
        recipe_steps (*)
      `)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as (Recipe & { 
      recipe_ingredients: RecipeIngredient[]; 
      recipe_steps: RecipeStep[] 
    })[];
  },

  async getRecipeById(id: string, restaurantId: string) {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*, ingredient (*)),
        recipe_steps (*)
      `)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) throw new Error(error.message);
    return data as Recipe & { 
      recipe_ingredients: RecipeIngredient[]; 
      recipe_steps: RecipeStep[] 
    };
  },

  async createRecipe(recipe: Omit<Recipe, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('recipes')
      .insert([recipe])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Recipe;
  },

  async updateRecipe(id: string, updates: Partial<Recipe>) {
    const { data, error } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Recipe;
  },

  async deleteRecipe(id: string) {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async calculateRecipeMetrics(recipe: Recipe & { 
    recipe_ingredients: RecipeIngredient[]; 
    recipe_steps: RecipeStep[] 
  }): Promise<RecipeMetrics> {
    // Calculate total cost from ingredients
    let totalCost = 0;
    recipe.recipe_ingredients.forEach(ri => {
      // Calculate cost considering yield percentage
      const effectiveQuantity = ri.yield_percentage 
        ? (ri.quantity * ri.ingredient.cost_per_unit) / (ri.yield_percentage / 100)
        : ri.quantity * ri.ingredient.cost_per_unit;
        
      // Subtract waste percentage
      const wasteAdjusted = ri.waste_percentage 
        ? effectiveQuantity * (1 + (ri.waste_percentage / 100))
        : effectiveQuantity;
        
      totalCost += wasteAdjusted;
    });

    const costPerServing = totalCost / recipe.servings;
    const foodCostPercentage = recipe.sale_price 
      ? (totalCost / recipe.sale_price) * 100 
      : 0;
    
    const profitMargin = recipe.sale_price 
      ? ((recipe.sale_price - totalCost) / recipe.sale_price) * 100 
      : 0;

    // Calculate total calories
    let totalCalories = 0;
    recipe.recipe_ingredients.forEach(ri => {
      const ingredientCalories = ri.ingredient.nutritional_info?.calories || 0;
      totalCalories += ingredientCalories * ri.quantity;
    });

    return {
      total_cost: parseFloat(totalCost.toFixed(2)),
      food_cost_percentage: parseFloat(foodCostPercentage.toFixed(2)),
      profit_margin: parseFloat(profitMargin.toFixed(2)),
      cost_per_serving: parseFloat(costPerServing.toFixed(2)),
      total_calories: Math.round(totalCalories),
    };
  }
};