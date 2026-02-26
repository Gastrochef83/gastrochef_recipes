
import React from 'react'
import { NavLink } from 'react-router-dom'

export default function RecipeList({ recipes }: { recipes: any[] }) {
  const items = recipes ?? []
  return (
    <div className="gc-recipe-grid">
      {items.map((r) => (
        <NavLink key={r.id} to={`/recipe/${r.id}`} className="gc-recipe-card">
          <div className="gc-recipe-card__top">
            <div className="gc-recipe-card__title">{r.name}</div>
            {r.category ? <span className="gc-pill">{r.category}</span> : null}
          </div>

          <div className="gc-recipe-card__meta">
            <span className="gc-pill">Portions: {r.portions ?? 1}</span>
            {typeof r.total_cost === 'number' ? <span className="gc-pill">Cost: {r.total_cost.toFixed(2)}</span> : null}
            {typeof r.food_cost_percentage === 'number' ? (
              <span className="gc-pill">Food %: {r.food_cost_percentage.toFixed(1)}%</span>
            ) : null}
          </div>

          <div className="gc-recipe-card__cta">
            <span className="gc-link">Open</span>
            <span className="gc-pill">→</span>
          </div>
        </NavLink>
      ))}
    </div>
  )
}
