import * as React from 'react'

export type ProLine = {
  id: string
  kitchen_id: string | null
  recipe_id: string
  ingredient_id: string | null
  position: number
  qty: number
  unit: string
  yield_percent: number
  notes: string | null
}

export type IngredientPick = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

export default function RecipeLinesPro(props: {
  lines: ProLine[]
  setLines: (next: ProLine[]) => void
  ingredients: IngredientPick[]
  currency: string
}) {
  const { lines, setLines, ingredients } = props

  const ingById = React.useMemo(() => {
    const m = new Map<string, IngredientPick>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const update = (id: string, patch: Partial<ProLine>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  if (!lines.length) {
    return <div className="text-sm text-neutral-600">No lines yet.</div>
  }

  return (
    <div className="space-y-3">
      {lines.map((l) => {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        const unit = safeUnit(l.unit)

        return (
          <div key={l.id} className="gc-card p-4">
            <div className="flex flex-col gap-3">
              {/* Title */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold">{ing?.name ?? 'Ingredient'}</div>
                  <div className="text-xs text-neutral-500">
                    {ing?.pack_unit ? `Pack unit: ${safeUnit(ing.pack_unit)}` : 'Pack unit: —'}
                  </div>
                </div>

                <div className="text-xs text-neutral-500">#{l.position}</div>
              </div>

              {/* Controls */}
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <div className="gc-label">QTY</div>
                  <input
                    className="gc-input w-full"
                    value={String(toNum(l.qty, 0))}
                    onChange={(e) => update(l.id, { qty: Math.max(0, toNum(e.target.value, 0)) })}
                    inputMode="decimal"
                  />
                </div>

                <div className="sm:col-span-4">
                  <div className="gc-label">UNIT</div>
                  <select
                    className="gc-input w-full"
                    value={unit}
                    onChange={(e) => update(l.id, { unit: safeUnit(e.target.value) })}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <div className="gc-label">NOTES</div>
                  <input
                    className="gc-input w-full"
                    value={l.notes ?? ''}
                    onChange={(e) => update(l.id, { notes: e.target.value })}
                    placeholder="Optional…"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
