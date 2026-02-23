// src/components/RecipeLinesPro.tsx
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
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const ingById = React.useMemo(() => {
    const m = new Map<string, IngredientPick>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const sorted = React.useMemo(() => {
    return [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [lines])

  const update = React.useCallback(
    (id: string, patch: Partial<ProLine>) => {
      setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    },
    [lines, setLines]
  )

  const remove = React.useCallback(
    (id: string) => {
      const next = lines.filter((l) => l.id !== id)
      const re = next
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((l, idx) => ({ ...l, position: idx + 1 }))
      setLines(re)
    },
    [lines, setLines]
  )

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
    return <div className="text-sm" style={{ color: 'var(--gc-muted)' }}>No ingredients yet.</div>
  }

  const cur = (props.currency || 'USD').toUpperCase()

  return (
    <div className="gc-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="gc-label">INGREDIENT LINES</div>
          <div className="gc-hint" style={{ marginTop: 6 }}>
            Net = target amount • Gross = amount to buy/prepare (Net ÷ Yield)
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="gc-btn gc-btn-ghost" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
            {showAdvanced ? 'Hide advanced' : 'Advanced'}
          </button>

          <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
            <div className="gc-label">TOTAL</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>
              {totalCost.toFixed(2)} {cur}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
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
            <div key={l.id} className="gc-card-soft" style={{ padding: 12, borderRadius: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 900 }}>{ing?.name ?? 'Ingredient'}</div>
                  <div className="gc-hint" style={{ marginTop: 4 }}>
                    #{l.position} • Unit: {unit}
                    {ing?.pack_unit ? ` • Pack unit: ${safeUnit(ing.pack_unit)}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                    <div className="gc-label">NET</div>
                    <div style={{ fontWeight: 900, marginTop: 4 }}>{fmtQty(netQty)} {unit}</div>
                  </div>

                  <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                    <div className="gc-label">GROSS</div>
                    <div style={{ fontWeight: 900, marginTop: 4 }}>{fmtQty(grossQty)} {unit}</div>
                  </div>

                  <div className="gc-card-soft" style={{ padding: 10, borderRadius: 14 }}>
                    <div className="gc-label">COST</div>
                    <div style={{ fontWeight: 900, marginTop: 4 }}>{Number.isFinite(lineCost) ? lineCost.toFixed(2) : '0.00'} {cur}</div>
                    <div className="gc-hint" style={{ marginTop: 4, fontWeight: 900 }}>{fmtQty(pct)}%</div>
                  </div>

                  <button className="gc-btn gc-btn-danger" type="button" onClick={() => remove(l.id)}>
                    Remove
                  </button>
                </div>
              </div>

              <div className="gc-field-row" style={{ marginTop: 12 }}>
                <div className="gc-col-4">
                  <div className="gc-field">
                    <div className="gc-label">NET QTY</div>
                    <input
                      className="gc-input"
                      value={String(toNum(l.qty, 0))}
                      onChange={(e) => update(l.id, { qty: Math.max(0, toNum(e.target.value, 0)) })}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="gc-col-4">
                  <div className="gc-field">
                    <div className="gc-label">UNIT</div>
                    <input className="gc-input" value={l.unit ?? 'g'} onChange={(e) => update(l.id, { unit: e.target.value })} />
                  </div>
                </div>

                {showAdvanced && (
                  <div className="gc-col-4">
                    <div className="gc-field">
                      <div className="gc-label">YIELD %</div>
                      <input
                        className="gc-input"
                        value={String(toNum(l.yield_percent, 100))}
                        onChange={(e) => update(l.id, { yield_percent: clamp(toNum(e.target.value, 100), 0.0001, 100) })}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                )}

                {showAdvanced && (
                  <div className="gc-col-12">
                    <div className="gc-field">
                      <div className="gc-label">NOTES</div>
                      <input
                        className="gc-input"
                        value={l.notes ?? ''}
                        onChange={(e) => update(l.id, { notes: e.target.value })}
                        placeholder="Optional notes (prep, trimming, etc.)"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="gc-hint" style={{ marginTop: 10 }}>
                Gross Qty = Net Qty ÷ (Yield% / 100). Example: 50g net at 97% yield → 51.546g gross.
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
