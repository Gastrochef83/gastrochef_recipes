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

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function fmtQty(n: number) {
  const v = Number.isFinite(n) ? n : 0
  // human-friendly but still precise for kitchen work
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(3)
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

  const sorted = React.useMemo(() => {
    // keep existing ordering semantics (position asc)
    return [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [lines])

  const update = (id: string, patch: Partial<ProLine>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const remove = (id: string) => {
    const next = lines.filter((l) => l.id !== id)
    // keep positions stable-ish: reindex from 1
    const re = next
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((l, idx) => ({ ...l, position: idx + 1 }))
    setLines(re)
  }

  const totalCost = React.useMemo(() => {
    let sum = 0
    for (const l of sorted) {
      const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
      const unitCost = toNum(ing?.net_unit_cost, 0)
      const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const netQty = Math.max(0, toNum(l.qty, 0))
      const grossQty = netQty / (y / 100)
      const lineCost = grossQty * unitCost
      sum += Number.isFinite(lineCost) ? lineCost : 0
    }
    return sum
  }, [sorted, ingById])

  if (!sorted.length) {
    return <div className="text-sm text-neutral-600">No ingredients yet.</div>
  }

  return (
    <div className="gc-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="gc-label">INGREDIENTS</div>
          <div className="mt-1 text-sm text-neutral-600">
            Net = recipe target amount • Gross = amount to buy/prepare (Net ÷ Yield)
          </div>
        </div>

        <div className="text-xs text-neutral-500">
          Total cost contribution:&nbsp;
          <span className="font-semibold">{totalCost.toFixed(2)}</span> {props.currency?.toUpperCase() || 'USD'}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-semibold text-neutral-500">
            <tr>
              <th className="py-2 pr-4">Ingredient</th>
              <th className="py-2 pr-4">Net Qty</th>
              <th className="py-2 pr-4">Gross Qty</th>
              <th className="py-2 pr-4">Yield</th>
              <th className="py-2 pr-4">Cost Contribution</th>
              <th className="py-2 pr-0 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="align-top">
            {sorted.map((l) => {
              const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
              const unit = safeUnit(l.unit)
              const netQty = Math.max(0, toNum(l.qty, 0))
              const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
              const grossQty = netQty / (y / 100)

              const unitCost = toNum(ing?.net_unit_cost, 0)
              const lineCost = grossQty * unitCost
              const pct = totalCost > 0 ? (lineCost / totalCost) * 100 : 0

              return (
                <tr key={l.id} className="border-t">
                  <td className="py-3 pr-4">
                    <div className="font-semibold">{ing?.name ?? 'Ingredient'}</div>
                    <div className="text-xs text-neutral-500">
                      #{l.position} • Unit: {unit}
                      {ing?.pack_unit ? ` • Pack unit: ${safeUnit(ing.pack_unit)}` : ''}
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <div className="gc-label">NET QTY</div>
                        <input
                          className="gc-input w-full"
                          value={String(toNum(l.qty, 0))}
                          onChange={(e) => update(l.id, { qty: Math.max(0, toNum(e.target.value, 0)) })}
                          inputMode="decimal"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <div className="gc-label">UNIT</div>
                        <input
                          className="gc-input w-full"
                          value={l.unit ?? 'g'}
                          onChange={(e) => update(l.id, { unit: e.target.value })}
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <div className="gc-label">YIELD %</div>
                        <input
                          className="gc-input w-full"
                          value={String(toNum(l.yield_percent, 100))}
                          onChange={(e) => update(l.id, { yield_percent: clamp(toNum(e.target.value, 100), 0.0001, 100) })}
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    {l.notes != null && l.notes !== '' && <div className="mt-2 text-xs text-neutral-500">Notes: {l.notes}</div>}
                  </td>

                  <td className="py-3 pr-4">
                    <div className="font-semibold">{fmtQty(netQty)} {unit}</div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="font-semibold">{fmtQty(grossQty)} {unit}</div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="font-semibold">{fmtQty(y)}%</div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="font-semibold">{fmtQty(pct)}%</div>
                    <div className="text-xs text-neutral-500">
                      {Number.isFinite(lineCost) ? lineCost.toFixed(2) : '0.00'} {props.currency?.toUpperCase() || 'USD'}
                    </div>
                  </td>

                  <td className="py-3 pr-0 text-right whitespace-nowrap">
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => remove(l.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-neutral-500">
        Gross Qty = Net Qty ÷ (Yield% / 100). Example: 50g net at 97% yield → 51.546g gross.
      </div>
    </div>
  )
}
