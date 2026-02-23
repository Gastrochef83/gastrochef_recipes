import React, { useMemo, useState } from 'react'
import type { Recipe, RecipeIngredient } from '../../types'
import Button from '../ui/Button'

export default function CookMode({ recipe, ingredients }: { recipe: Recipe; ingredients: RecipeIngredient[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const steps = useMemo(() => {
    return ingredients.map((i) => ({
      id: i.id,
      text: `${i.name} — ${i.quantity} ${i.unit}`
    }))
  }, [ingredients])

  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="gc-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Cook Mode</h3>
          <div className="gc-muted">{recipe.name}</div>
        </div>
        <div className="gc-muted">{doneCount}/{steps.length} done</div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {steps.map((s) => (
          <label key={s.id} className="gc-card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={!!checked[s.id]}
              onChange={(e) => setChecked((p) => ({ ...p, [s.id]: e.target.checked }))}
            />
            <span style={{ textDecoration: checked[s.id] ? 'line-through' : 'none' }}>{s.text}</span>
          </label>
        ))}
        {!steps.length ? <div className="gc-muted">No ingredients yet.</div> : null}
      </div>

      <div className="gc-row">
        <Button variant="secondary" onClick={() => setChecked({})}>
          Reset
        </Button>
      </div>
    </div>
  )
}
