import React from 'react'

export default function RecipeSelector({
  recipes,
  value,
  onChange
}: {
  recipes: any[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rs">
      <label className="rs__label">Recipe</label>
      <select className="rs__select" value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">All</option>
        {recipes?.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <style>{`
        .rs{ display:flex; align-items:center; gap: 10px; }
        .rs__label{ color: var(--text-tertiary); font-weight: 900; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
        .rs__select{ padding: 10px 12px; border-radius: 12px; border:1px solid var(--border); background: var(--surface-secondary); color: var(--text-primary); font-weight: 800; min-width: 220px; }
      `}</style>
    </div>
  )
}
