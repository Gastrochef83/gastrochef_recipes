// src/pages/PublicSharePortal.tsx
import { useMemo } from 'react'
import { useParams, NavLink } from 'react-router-dom'
import { parsePublicShareToken, type PublicSharePayload } from '../lib/publicShare'

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}
function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}
function fmtQty(n: number) {
  const v = Number.isFinite(n) ? n : 0
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(3)
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
function fmtMacro(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

export default function PublicSharePortal() {
  const { token } = useParams<{ token: string }>()

  const parsed = useMemo(() => {
    if (!token) return { payload: null as PublicSharePayload | null, error: 'Missing token.' }
    try {
      const p = parsePublicShareToken(token)
      return { payload: p, error: null as string | null }
    } catch (e: any) {
      return { payload: null, error: e?.message || 'Invalid token.' }
    }
  }, [token])

  const payload = parsed.payload
  const err = parsed.error

  const currency = payload?.recipe?.currency || 'USD'

  const ingById = useMemo(() => {
    const m = new Map<string, { name?: string | null; net_unit_cost?: number | null; pack_unit?: string | null }>()
    for (const i of payload?.ingredients || []) m.set(i.id, i)
    return m
  }, [payload])

  const subById = useMemo(() => {
    const m = new Map<string, { id: string; name?: string | null }>()
    for (const r of payload?.subrecipes || []) m.set(r.id, r)
    return m
  }, [payload])

  const computed = useMemo(() => {
    const lines = payload?.lines || []
    const map = new Map<
      number,
      { title: string; net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; kind: string; notes?: string | null }
    >()

    for (const l of lines) {
      if (l.line_type === 'group') continue

      const net = Math.max(0, toNum(l.qty, 0))
      const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const grossAuto = y > 0 ? net / (y / 100) : net
      const gross = l.gross_qty_override != null && l.gross_qty_override >= 0 ? l.gross_qty_override : grossAuto

      let unitCost = 0
      let title = 'Line'
      let kind = 'Ingredient'

      if (l.line_type === 'ingredient' && l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        title = ing?.name || 'Ingredient'
        unitCost = toNum(ing?.net_unit_cost, 0)
        kind = 'Ingredient'
      }
      if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
        const sr = subById.get(l.sub_recipe_id)
        title = sr?.name || 'Subrecipe'
        unitCost = 0
        kind = 'Subrecipe'
      }

      const lineCost = net * unitCost
      map.set(l.position, { title, net, gross, yieldPct: y, unitCost, lineCost, kind, notes: l.notes ?? null })
    }

    return map
  }, [payload, ingById, subById])

  const totals = useMemo(() => {
    const lines = payload?.lines || []
    let totalCost = 0
    for (const l of lines) {
      const c = computed.get(l.position)
      if (!c) continue
      totalCost += c.lineCost
    }
    const portions = clamp(toNum(payload?.recipe?.portions, 1), 1, 1_000_000)
    const perPortion = portions > 0 ? totalCost / portions : totalCost
    const selling = payload?.recipe?.selling_price ?? null
    const foodCostPct = selling != null && selling > 0 ? (perPortion / selling) * 100 : null

    return { totalCost, portions, perPortion, selling, foodCostPct }
  }, [payload, computed])

  if (err) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-2xl">
          <div className="gc-card p-6">
            <div className="gc-label">PUBLIC SHARE</div>
            <div className="mt-2 text-xl font-extrabold">This link is not valid</div>
            <div className="mt-2 text-sm text-neutral-600">{err}</div>
            <div className="mt-5 flex gap-2 flex-wrap">
              <NavLink to="/login" className="gc-btn gc-btn-primary">Open GastroChef</NavLink>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!payload) return null

  const recipe = payload.recipe
  const lines = [...payload.lines].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="gc-share-top">
        <div className="gc-share-top-inner">
          <div className="flex items-center gap-3">
            <img src="/gastrochef-logo.png" alt="GastroChef" className="h-9 w-9 rounded-xl" />
            <div>
              <div className="text-xs font-semibold tracking-widest text-neutral-500">GASTROCHEF • PUBLIC SHARE</div>
              <div className="text-lg font-extrabold leading-tight">{recipe.name || 'Recipe'}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => window.print()}>Print</button>
            <NavLink to="/login" className="gc-btn gc-btn-primary">Open App</NavLink>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-6">
        <div className="gc-card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="gc-label">RECIPE</div>
              <div className="mt-2 text-2xl font-extrabold">{recipe.name || 'Recipe'}</div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {recipe.category ? <span className="gc-pill">{recipe.category}</span> : null}
                <span className="gc-pill">Portions: {totals.portions}</span>
                {recipe.yield_qty != null ? (
                  <span className="gc-pill">Yield: {fmtQty(toNum(recipe.yield_qty, 0))} {safeUnit(recipe.yield_unit || 'g')}</span>
                ) : null}
              </div>
              {recipe.description ? <div className="mt-3 text-sm text-neutral-700 whitespace-pre-wrap">{recipe.description}</div> : null}
            </div>

            <div className="gc-card-soft p-4 min-w-[260px]">
              <div className="gc-label">COST SNAPSHOT</div>
              <div className="mt-2 text-sm text-neutral-700">Total cost</div>
              <div className="text-xl font-extrabold">{fmtMoney(totals.totalCost, currency)}</div>
              <div className="mt-2 text-sm text-neutral-700">Per portion</div>
              <div className="text-lg font-bold">{fmtMoney(totals.perPortion, currency)}</div>
              {totals.selling != null ? (
                <div className="mt-2 text-xs text-neutral-600">
                  Selling: <span className="font-semibold">{fmtMoney(totals.selling, currency)}</span>
                  {totals.foodCostPct != null ? (
                    <>
                      {' '}• Food cost: <span className="font-semibold">{totals.foodCostPct.toFixed(1)}%</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">Selling price not included</div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="gc-label">INGREDIENTS</div>
              <div className="mt-3 gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Net</th>
                      <th className="text-right">Yield</th>
                      <th className="text-right">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      if (l.line_type === 'group') {
                        return (
                          <tr key={`g_${l.position}`}>
                            <td colSpan={4} className="text-xs font-extrabold tracking-widest text-neutral-500 bg-neutral-50">
                              {l.group_title || 'GROUP'}
                            </td>
                          </tr>
                        )
                      }
                      const c = computed.get(l.position)
                      if (!c) return null
                      return (
                        <tr key={`${l.line_type}_${l.position}`}>
                          <td>
                            <div className="font-semibold">{c.title}</div>
                            {c.notes ? <div className="text-xs text-neutral-500 mt-0.5">{c.notes}</div> : null}
                          </td>
                          <td className="text-right">{fmtQty(c.net)} {safeUnit(l.unit)}</td>
                          <td className="text-right">{fmtQty(c.yieldPct)}%</td>
                          <td className="text-right">{fmtQty(c.gross)} {safeUnit(l.unit)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="gc-label">METHOD</div>
              <div className="mt-3 gc-card-soft p-4">
                {Array.isArray(recipe.method_steps) && recipe.method_steps.length ? (
                  <ol className="list-decimal pl-5 space-y-2 text-sm text-neutral-700">
                    {recipe.method_steps.map((s, idx) => (
                      <li key={idx} className="whitespace-pre-wrap">{s}</li>
                    ))}
                  </ol>
                ) : recipe.method ? (
                  <div className="text-sm text-neutral-700 whitespace-pre-wrap">{recipe.method}</div>
                ) : (
                  <div className="text-sm text-neutral-500">No method provided.</div>
                )}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="gc-card-soft p-4">
                  <div className="gc-label">NUTRITION</div>
                  <div className="mt-2 text-sm text-neutral-700">
                    Calories: <span className="font-semibold">{fmtMacro(recipe.calories)}</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-700">
                    Protein: <span className="font-semibold">{fmtMacro(recipe.protein_g)} g</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-700">
                    Carbs: <span className="font-semibold">{fmtMacro(recipe.carbs_g)} g</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-700">
                    Fat: <span className="font-semibold">{fmtMacro(recipe.fat_g)} g</span>
                  </div>
                </div>

                <div className="gc-card-soft p-4">
                  <div className="gc-label">ABOUT THIS SHARE</div>
                  <div className="mt-2 text-xs text-neutral-600">
                    This link contains a read-only snapshot of the recipe data. No database access is required.
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    Generated: <span className="font-semibold">{new Date(payload.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-neutral-500">
            Shared with <span className="font-semibold">GastroChef</span> • Read-only
          </div>
        </div>
      </div>
    </div>
  )
}
