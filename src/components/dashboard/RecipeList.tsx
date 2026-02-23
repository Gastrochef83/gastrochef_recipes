import React from 'react'
import { NavLink } from 'react-router-dom'

export default function RecipeList({ recipes }: { recipes: any[] }) {
  return (
    <div className="rl">
      {recipes?.map(r => (
        <NavLink key={r.id} to={`/recipe/${r.id}`} className="rl__item">
          <div className="rl__name">{r.name}</div>
          <div className="rl__meta">{r.category || '—'} • {r.portions || 0} portions</div>
        </NavLink>
      ))}

      {!recipes?.length ? <div className="rl__empty">No recipes yet.</div> : null}

      <style>{`
        .rl{ display:flex; flex-direction: column; gap: 10px; }
        .rl__item{ text-decoration:none; padding: 12px; border-radius: 12px; border:1px solid var(--border); background: var(--surface-secondary); color: var(--text-primary); }
        .rl__item:hover{ background: var(--surface-tertiary); }
        .rl__name{ font-weight: 800; }
        .rl__meta{ margin-top: 3px; color: var(--text-tertiary); font-weight: 700; font-size: .9rem; }
        .rl__empty{ padding: 12px; color: var(--text-secondary); }
      `}</style>
    </div>
  )
}
