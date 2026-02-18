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

// ✅ Safe ID generator (works even if crypto.randomUUID is unavailable)
function newId() {
  const c: any = (globalThis as any).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function calcLineCost(l: ProLine, ing: IngredientPick | undefined, servingsPreview: number) {
  if (!ing) return 0
  const net = toNum(ing.net_unit_cost, 0)
  if (net <= 0) return 0

  const qty = toNum(l.qty, 0) * Math.max(1, servingsPreview)
  const u = safeUnit(l.unit)
  const packUnit = safeUnit(ing.pack_unit ?? 'g')

  let conv = qty
  if (u === 'g' && packUnit === 'kg') conv = qty / 1000
  else if (u === 'kg' && packUnit === 'g') conv = qty * 1000
  else if (u === 'ml' && packUnit === 'l') conv = qty / 1000
  else if (u === 'l' && packUnit === 'ml') conv = qty * 1000

  let cost = conv * net

  const y = Math.min(100, Math.max(0, toNum(l.yield_percent, 100)))
  if (y > 0 && y < 100) cost = cost * (100 / y)

  return cost
}

const UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'g', label: 'g — grams' },
  { value: 'kg', label: 'kg — kilograms' },
  { value: 'ml', label: 'ml — milliliters' },
  { value: 'l', label: 'l — liters' },
  { value: 'pcs', label: 'pcs — pieces' },
]

export default function RecipeLinesPro({
  currency,
  servingsPreview,
  kitchenId,
  recipeId,
  ingredients,
  lines,
  setLines,
  onSave,
  onDelete,
}: {
  currency: string
  servingsPreview: number
  kitchenId: string | null
  recipeId: string
  ingredients: IngredientPick[]
  lines: ProLine[]
  setLines: (next: ProLine[]) => void
  onSave: () => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const ingById = React.useMemo(() => {
    const m = new Map<string, IngredientPick>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const addLine = () => {
    const first = ingredients[0]
    if (!first) return

    const next: ProLine[] = [
      ...lines,
      {
        id: newId(),
        kitchen_id: kitchenId,
        recipe_id: recipeId,
        ingredient_id: first.id,
        position: (lines.at(-1)?.position ?? 0) + 1,
        qty: 1,
        unit: 'g',
        yield_percent: 100,
        notes: null,
      },
    ]
    setLines(next)
  }

  const update = (id: string, patch: Partial<ProLine>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const removeLocal = (id: string) => {
    const next = lines.filter((l) => l.id !== id).map((l, i) => ({ ...l, position: i + 1 }))
    setLines(next)
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = lines.findIndex((l) => l.id === id)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= lines.length) return
    const copy = [...lines]
    ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
    setLines(copy.map((l, i) => ({ ...l, position: i + 1 })))
  }

  const total = React.useMemo(() => {
    return lines.reduce((sum, l) => sum + calcLineCost(l, l.ingredient_id ? ingById.get(l.ingredient_id) : undefined, servingsPreview), 0)
  }, [lines, ingById, servingsPreview])

  return (
    <div className="gc-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="gc-label">INGREDIENT LINES (PRO)</div>
          <div className="mt-1 text-sm text-neutral-600">Paprika-style builder + Yield% + Notes + Reorder.</div>
        </div>

        <div className="flex gap-2">
          <button className="gc-btn gc-btn-ghost" type="button" onClick={addLine}>
            + Add line
          </button>
          <button className="gc-btn gc-btn-primary" type="button" onClick={onSave}>
            Save lines
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="mt-4 text-sm text-neutral-600">No lines yet.</div>
      ) : (
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-left text-xs font-semibold text-neutral-500">
              <tr>
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Ingredient</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Yield %</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2 pr-4">Cost (preview)</th>
                <th className="py-2 pr-0 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="align-top">
              {lines
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((l) => {
                  const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : undefined
                  const cost = calcLineCost(l, ing, servingsPreview)

                  return (
                    <tr key={l.id} className="border-t">
                      <td className="py-3 pr-4 font-semibold">{l.position}</td>

                      <td className="py-3 pr-4">
                        <select
                          className="gc-input w-[320px]"
                          value={l.ingredient_id ?? ''}
                          onChange={(e) => update(l.id, { ingredient_id: e.target.value || null })}
                        >
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name ?? i.id}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 pr-4">
                        <input
                          className="gc-input w-28"
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.qty}
                          onChange={(e) => update(l.id, { qty: toNum(e.target.value, 0) })}
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <select
                          className="gc-input w-28 font-semibold text-neutral-900"
                          value={l.unit}
                          onChange={(e) => update(l.id, { unit: safeUnit(e.target.value) })}
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 pr-4">
                        <input
                          className="gc-input w-28"
                          type="number"
                          min={0}
                          max={100}
                          step="1"
                          value={l.yield_percent}
                          onChange={(e) => update(l.id, { yield_percent: toNum(e.target.value, 100) })}
                        />
                      </td>

                      <td className="py-3 pr-4">
                        <input
                          className="gc-input w-[260px]"
                          value={l.notes ?? ''}
                          onChange={(e) => update(l.id, { notes: e.target.value })}
                          placeholder="e.g. chopped, peeled..."
                        />
                      </td>

                      <td className="py-3 pr-4 font-extrabold">{fmtMoney(cost, currency)}</td>

                      <td className="py-3 pr-0 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => move(l.id, -1)}>
                            ↑
                          </button>
                          <button className="gc-btn gc-btn-ghost" type="button" onClick={() => move(l.id, 1)}>
                            ↓
                          </button>
                          <button
                            className="gc-btn gc-btn-ghost"
                            type="button"
                            onClick={async () => {
                              await onDelete(l.id)
                              removeLocal(l.id)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>

          <div className="mt-4 text-sm text-neutral-700">
            Total (preview): <span className="font-extrabold">{fmtMoney(total, currency)}</span>
            <div className="mt-1 text-xs text-neutral-500">Preview uses Servings slider (does not change saved recipe portions).</div>
          </div>
        </div>
      )}
    </div>
  )
}
