import React from 'react'
import { NavLink } from 'react-router-dom'

export default function RecipeList({ recipes }: { recipes: any[] }) {
  return (
    <div className="gc-list">
      {(recipes ?? []).map((r) => (
        <NavLink key={r.id} to={`/recipe/${r.id}`} className="gc-list__item">
          <div className="gc-list__title">{r.name}</div>
          <div className="gc-list__meta">{r.category ?? '—'}</div>
        </NavLink>
      ))}
      {!recipes?.length ? <div className="gc-muted">No recipes yet.</div> : null}
    </div>
  )
}
