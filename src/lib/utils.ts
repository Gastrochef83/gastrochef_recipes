import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format currency according to restaurant settings
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format numbers with commas and decimals
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

// Calculate recipe cost from recipe lines and ingredient costs
export function calculateRecipeCost(recipeLines: any[], ingredientCosts: Record<string, number>): number {
  return recipeLines.reduce((total, line) => {
    const costPerUnit = ingredientCosts[line.ingredient_id] || 0;
    return total + (line.quantity * costPerUnit);
  }, 0);
}

// Calculate cost per portion
export function calculateCostPerPortion(totalCost: number, servings: number): number {
  if (servings <= 0) return 0;
  return totalCost / servings;
}

// Calculate nutritional values from recipe lines and ingredient nutrition
export function calculateNutrition(recipeLines: any[], ingredientNutrition: Record<string, any>): any {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sodium: 0,
    sugar: 0,
    fiber: 0,
  };

  recipeLines.forEach(line => {
    const nutrition = ingredientNutrition[line.ingredient_id];
    if (nutrition) {
      // Assuming nutrition values are per base unit
      const multiplier = line.quantity;
      totals.calories += (nutrition.calories || 0) * multiplier;
      totals.protein += (nutrition.protein || 0) * multiplier;
      totals.carbs += (nutrition.carbs || 0) * multiplier;
      totals.fat += (nutrition.fat || 0) * multiplier;
      totals.sodium += (nutrition.sodium || 0) * multiplier;
      totals.sugar += (nutrition.sugar || 0) * multiplier;
      totals.fiber += (nutrition.fiber || 0) * multiplier;
    }
  });

  return totals;
}

// Debounce function for search inputs
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Generate a random ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Convert units (simplified version)
export function convertUnits(value: number, fromUnit: string, toUnit: string): number {
  // Basic conversion map - extend as needed
  const conversionMap: Record<string, Record<string, number>> = {
    g: {
      kg: 0.001,
      mg: 1000,
      lb: 0.00220462,
      oz: 0.035274,
    },
    kg: {
      g: 1000,
      mg: 1000000,
      lb: 2.20462,
      oz: 35.274,
    },
    ml: {
      l: 0.001,
      oz: 0.033814,
      tbsp: 0.067628,
      tsp: 0.202884,
    },
    l: {
      ml: 1000,
      oz: 33.814,
      tbsp: 67.628,
      tsp: 202.884,
    },
  };

  if (fromUnit === toUnit) return value;
  
  if (conversionMap[fromUnit] && conversionMap[fromUnit][toUnit]) {
    return value * conversionMap[fromUnit][toUnit];
  }

  // If no direct conversion, try reverse
  if (conversionMap[toUnit] && conversionMap[toUnit][fromUnit]) {
    return value / conversionMap[toUnit][fromUnit];
  }

  // No conversion found, return original value
  return value;
}