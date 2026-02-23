import React from 'react'
import type { RecipeIngredient } from '../../types'

export default function NutritionPanel({
  recipeId,
  ingredients,
  portions
}: {
  recipeId: string
  ingredients: RecipeIngredient[]
  portions: number
}) {
  // Placeholder: wire to your nutrition logic/table later.
  return (
    <div style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>
      Nutrition is not wired yet for recipe <strong style={{ color: 'var(--text-primary)' }}>{recipeId}</strong>.
      <div style={{ marginTop: 10 }}>
        Ingredients: {ingredients.length} • Portions: {portions}
      </div>
    </div>
  )
}
