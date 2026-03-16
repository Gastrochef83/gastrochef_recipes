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
  void recipeId
  void ingredients
  return (
    <div className="gc-panel">
      <h3>Nutrition</h3>
      <p className="gc-muted">Nutrition calculation is optional. (Hook your DB fields when ready.)</p>
      <div className="gc-panel__grid">
        <div className="gc-panel__card">
          <div className="gc-panel__label">Portions</div>
          <div className="gc-panel__value">{portions}</div>
        </div>
      </div>
    </div>
  )
}
