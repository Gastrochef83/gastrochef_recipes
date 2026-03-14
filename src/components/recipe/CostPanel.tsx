import React, { useMemo } from 'react'
import type { RecipeIngredient } from '../../types'

export default function CostPanel({
  totalCost,
  costPerPortion,
  ingredients,
  portions
}: {
  totalCost: number
  costPerPortion: number
  ingredients: RecipeIngredient[]
  portions: number
}) {
  const rows = useMemo(() => {
    return ingredients.map((i) => ({
      name: i.name,
      cost: (i.quantity * i.cost_per_unit) * ((i.yield_percent || 100) / 100)
    }))
  }, [ingredients])

  return (
    <div className="gc-panel">
      <h3>Cost Analysis</h3>
      <div className="gc-panel__grid">
        <div className="gc-panel__card">
          <div className="gc-panel__label">Total Cost</div>
          <div className="gc-panel__value">${totalCost.toFixed(2)}</div>
        </div>
        <div className="gc-panel__card">
          <div className="gc-panel__label">Cost / Portion</div>
          <div className="gc-panel__value">${costPerPortion.toFixed(2)}</div>
        </div>
        <div className="gc-panel__card">
          <div className="gc-panel__label">Portions</div>
          <div className="gc-panel__value">{portions}</div>
        </div>
      </div>

      <div className="gc-table">
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th className="right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r.name}</td>
                <td className="right">${r.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
