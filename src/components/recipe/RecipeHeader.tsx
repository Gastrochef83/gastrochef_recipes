import React from 'react'
import Button from '../ui/Button'
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
    <div className="rh">
      <div>
        <div className="rh__label">Recipe</div>
        <div className="rh__name">{name}</div>
      </div>

      <div className="rh__right">
        <div className="rh__metric">
          <div className="rh__metricLabel">Total</div>
          <div className="rh__metricValue">${totalCost.toFixed(2)}</div>
        </div>
        <div className="rh__metric">
          <div className="rh__metricLabel">Per Portion</div>
          <div className="rh__metricValue">${costPerPortion.toFixed(2)}</div>
        </div>
        <div className="rh__portion">
          <div className="rh__metricLabel">Portions</div>
          <div style={{ width: 140 }}>
            <Input
              type="number"
              min={1}
              value={portions}
              onChange={e => onPortionChange(parseInt(e.target.value || '1', 10))}
            />
          </div>
        </div>
        <Button variant="ghost" onClick={() => window.history.back()}>Back</Button>
      </div>

      <style>{`
        .rh{
          display:flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .rh__label{ color: var(--text-tertiary); font-weight: 800; text-transform: uppercase; letter-spacing: .05em; font-size: .75rem; }
        .rh__name{ font-size: 2rem; font-weight: 900; color: var(--text-primary); margin-top: 6px; }
        .rh__right{ display:flex; gap: 14px; align-items:flex-end; flex-wrap: wrap; }
        .rh__metric{ padding: 10px 12px; border:1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-sm); min-width: 140px; }
        .rh__metricLabel{ color: var(--text-tertiary); font-weight: 800; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
        .rh__metricValue{ margin-top: 4px; color: var(--text-primary); font-weight: 900; font-size: 1.25rem; }
        .rh__portion{ display:flex; flex-direction: column; gap: 6px; }
      `}</style>
    </div>
  )
}
