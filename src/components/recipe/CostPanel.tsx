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
  const top = useMemo(() => {
    return [...ingredients]
      .map(i => ({
        ...i,
        lineCost: i.quantity * i.cost_per_unit * (i.yield_percent / 100)
      }))
      .sort((a, b) => b.lineCost - a.lineCost)
      .slice(0, 8)
  }, [ingredients])

  return (
    <div>
      <div className="cp__grid">
        <div className="cp__card">
          <div className="cp__label">Total Cost</div>
          <div className="cp__value">${totalCost.toFixed(2)}</div>
        </div>
        <div className="cp__card">
          <div className="cp__label">Cost / Portion</div>
          <div className="cp__value">${costPerPortion.toFixed(2)}</div>
        </div>
        <div className="cp__card">
          <div className="cp__label">Portions</div>
          <div className="cp__value">{portions}</div>
        </div>
      </div>

      <div className="cp__list">
        <div className="cp__listTitle">Top Cost Drivers</div>
        {top.map(i => (
          <div key={i.id} className="cp__row">
            <div className="cp__name">{i.name || '—'}</div>
            <div className="cp__num">${(i.quantity * i.cost_per_unit * (i.yield_percent / 100)).toFixed(2)}</div>
          </div>
        ))}
        {!top.length ? <div className="cp__empty">Add ingredients to see cost drivers.</div> : null}
      </div>

      <style>{`
        .cp__grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .cp__card{ background: var(--surface-secondary); border:1px solid var(--border); border-radius: 14px; padding: 14px; }
        .cp__label{ color: var(--text-tertiary); font-weight: 800; text-transform: uppercase; letter-spacing: .05em; font-size: .75rem; }
        .cp__value{ margin-top: 8px; font-size: 1.6rem; font-weight: 900; color: var(--text-primary); }
        .cp__list{ margin-top: 16px; background: var(--surface-secondary); border:1px solid var(--border); border-radius: 14px; padding: 14px; }
        .cp__listTitle{ font-weight: 900; color: var(--text-primary); margin-bottom: 10px; }
        .cp__row{ display:flex; justify-content: space-between; padding: 10px 8px; border-top: 1px solid var(--border); }
        .cp__row:first-of-type{ border-top: none; }
        .cp__name{ font-weight: 800; color: var(--text-primary); }
        .cp__num{ font-weight: 900; color: var(--success); }
        .cp__empty{ color: var(--text-secondary); font-weight: 700; }
        @media (max-width: 900px){ .cp__grid{ grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
