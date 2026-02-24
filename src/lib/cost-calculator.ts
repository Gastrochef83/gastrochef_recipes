/**
 * Cost Calculator Service
 * Handles all cost calculations for ingredients and recipes
 */

export interface IngredientCosts {
  grossUnitCost: number;
  netUnitCost: number;
}

export interface RecipeLineCost {
  lineId: string;
  ingredientId?: string;
  subRecipeId?: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
  yieldOverride?: number;
}

export interface RecipeCostBreakdown {
  totalRecipeCost: number;
  costPerPortion: number;
  foodCostPercentage: number;
  lines: RecipeLineCost[];
  subRecipes: RecipeCostBreakdown[];
}

export class CostCalculator {
  /**
   * Calculate ingredient costs based on pack size and price
   */
  static calculateIngredientCosts(
    packPrice: number,
    packSize: number,
    yieldPercent: number
  ): IngredientCosts {
    const grossUnitCost = packPrice / packSize;
    const netUnitCost = grossUnitCost / (yieldPercent / 100);

    return {
      grossUnitCost,
      netUnitCost
    };
  }

  /**
   * Calculate recipe line cost
   */
  static calculateRecipeLineCost(
    quantity: number,
    unitCost: number
  ): number {
    return quantity * unitCost;
  }

  /**
   * Calculate complete recipe cost breakdown
   */
  static calculateRecipeCost(
    lines: Array<{
      id: string;
      ingredientId?: string;
      subRecipeId?: string;
      quantity: number;
      unitOfMeasure: string;
      overrideYield?: number;
      ingredient?: {
        packPrice: number;
        packSize: number;
        yieldPercent: number;
      };
      subRecipe?: {
        lines: Array<{
          id: string;
          ingredientId?: string;
          subRecipeId?: string;
          quantity: number;
          unitOfMeasure: string;
          overrideYield?: number;
          ingredient?: {
            packPrice: number;
            packSize: number;
            yieldPercent: number;
          };
        }>;
        totalServings: number;
      };
    }>,
    totalServings: number
  ): RecipeCostBreakdown {
    const linesWithCosts: RecipeLineCost[] = [];
    const subRecipesBreakdowns: RecipeCostBreakdown[] = [];

    let totalRecipeCost = 0;

    for (const line of lines) {
      if (line.ingredientId && line.ingredient) {
        // Calculate cost for ingredient line
        const { netUnitCost } = CostCalculator.calculateIngredientCosts(
          line.ingredient.packPrice,
          line.ingredient.packSize,
          line.overrideYield || line.ingredient.yieldPercent
        );

        const lineCost = CostCalculator.calculateRecipeLineCost(
          line.quantity,
          netUnitCost
        );

        linesWithCosts.push({
          lineId: line.id,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unitCost: netUnitCost,
          lineCost,
          yieldOverride: line.overrideYield
        });

        totalRecipeCost += lineCost;
      } else if (line.subRecipeId && line.subRecipe) {
        // Calculate cost for sub-recipe line
        const subRecipeBreakdown = CostCalculator.calculateRecipeCost(
          line.subRecipe.lines,
          line.subRecipe.totalServings
        );

        // Adjust cost based on quantity needed for parent recipe
        const adjustedTotalCost = subRecipeBreakdown.totalRecipeCost * line.quantity;
        
        linesWithCosts.push({
          lineId: line.id,
          subRecipeId: line.subRecipeId,
          quantity: line.quantity,
          unitCost: subRecipeBreakdown.costPerPortion,
          lineCost: adjustedTotalCost
        });

        subRecipesBreakdowns.push(subRecipeBreakdown);
        totalRecipeCost += adjustedTotalCost;
      }
    }

    const costPerPortion = totalRecipeCost / totalServings;
    
    // Food cost percentage would typically be calculated against selling price
    // For now we'll return a placeholder - this would need to be calculated based on menu prices
    const foodCostPercentage = 0; // Placeholder - would need selling price to calculate

    return {
      totalRecipeCost,
      costPerPortion,
      foodCostPercentage,
      lines: linesWithCosts,
      subRecipes: subRecipesBreakdowns
    };
  }
}