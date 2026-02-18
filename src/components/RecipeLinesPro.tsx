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

  return (
    <div className="space-y-2">
      {lines.map((l) => {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null

        return (
          <div key={l.id} className="gc-card p-4">
            <div className="grid gap-2 md:grid-cols-12 items-center">
              <div className="md:col-span-5">
                <div className="text-sm font-bold">{ing?.name ?? 'Ingredient'}</div>
                <div className="text-xs text-neutral-500">{ing?.pack_unit ? `Pack unit: ${ing.pack_unit}` : ''}</div>
              </div>

              <div className="md:col-span-2">
                <input
                  className="gc-input w-full text-right"
                  value={String(toNum(l.qty, 0))}
                  inputMode="decimal"
                  onChange={(e) => update(l.id, { qty: Math.max(0, toNum(e.target.value, 0)) })}
                />
              </div>

              <div className="md:col-span-2">
                {/* ✅ unit visibility fix */}
                <select className="gc-input w-full gc-unit-select" value={safeUnit(l.unit)} onChange={(e) => update(l.id, { unit: safeUnit(e.target.value) })}>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <input
                  className="gc-input w-full"
                  value={l.notes ?? ''}
                  placeholder="Note…"
                  onChange={(e) => update(l.id, { notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
