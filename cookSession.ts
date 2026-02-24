import React from 'react'
import Input from '../ui/Input'

export default function RecipeHeader({
  name,
  portions,
  onPortionChange,
  totalCost,
  costPerPortion
}: {
  name: string
  portions: number
  onPortionChange: (n: number) => void
  totalCost: number
  costPerPortion: number
}) {
  return (
    <div className="recipe-header">
      <div className="recipe-header__left">
        <h1 className="recipe-title">{name}</h1>
        <div className="recipe-sub">
          <Input
            type="number"
            label="Portions"
            value={portions}
            min={1}
            onChange={(e) => onPortionChange(parseInt(e.target.value || '1', 10))}
          />
        </div>
      </div>

      <div className="recipe-header__right">
        <div className="gc-metric">
          <div className="gc-metric__label">Total Cost</div>
          <div className="gc-metric__value">${totalCost.toFixed(2)}</div>
        </div>
        <div className="gc-metric">
          <div className="gc-metric__label">Cost / Portion</div>
          <div className="gc-metric__value">${costPerPortion.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}
