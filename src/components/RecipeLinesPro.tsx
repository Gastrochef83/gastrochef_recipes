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

function fmtMoney(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

/**
 * ✅ OMEGA V8.5 GPU MODE:
 * - React.memo prevents rerender storms when RecipeEditor header updates
 * - Keeps your logic 100% identical (no business logic changes)
 */
const RecipeLinesProInner = function RecipeLinesPro(props: {
  lines: ProLine[]
  setLines: (next: ProLine[]) => void
  ingredients: IngredientPick[]
  currency: string
}) {
  const { lines, setLines, ingredients, currency } = props

  const ingById = React.useMemo(() => {
    const m = new Map<string, IngredientPick>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const update = (id: string, patch: Partial<ProLine>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const remove = (id: string) => {
    setLines(lines.filter((l) => l.id !== id))
  }

  if (!lines.length) {
    return <div className="text-sm text-neutral-600">No lines yet.</div>
  }

  return (
    <div className="space-y-3" style={{ transform: 'translateZ(0)', willChange: 'transform' }}>
      {lines.map((l) => {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        const unitCost = toNum(ing?.net_unit_cost, 0)
        const cost = unitCost * toNum(l.qty, 0)

        return (
          <div key={l.id} className="gc-card p-4" style={{ transform: 'translateZ(0)' }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
              <div className="sm:col-span-4">
                <div className="gc-label">INGREDIENT</div>
                <div className="text-sm font-semibold">{ing?.name || '—'}</div>
                <div className="text-xs text-neutral-500">{ing?.pack_unit || ''}</div>
              </div>

              <div className="sm:col-span-2">
                <div className="gc-label">QTY</div>
                <input
                  className="gc-input w-full"
                  type="number"
                  value={l.qty}
                  onChange={(e) => update(l.id, { qty: toNum(e.target.value, 0) })}
                />
              </div>

              <div className="sm:col-span-2">
                <div className="gc-label">UNIT</div>
                <select
                  className="gc-input w-full"
                  value={safeUnit(l.unit)}
                  onChange={(e) => update(l.id, { unit: e.target.value })}
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">l</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <div className="gc-label">COST</div>
                <div className="text-sm font-semibold">{fmtMoney(cost, currency)}</div>
              </div>

              <div className="sm:col-span-2 flex justify-end gap-2">
                <button className="gc-btn" type="button" onClick={() => remove(l.id)}>
                  Delete
                </button>
              </div>

              <div className="sm:col-span-12">
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
        )
      })}
    </div>
  )
}

// ✅ This is the key: prevents rerender storms = removes freeze
export default React.memo(RecipeLinesProInner)
