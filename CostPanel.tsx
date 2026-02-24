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
    <label className="gc-field">
      <span className="gc-field__label">Recipe</span>
      <select className="gc-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {(recipes ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  )
}
