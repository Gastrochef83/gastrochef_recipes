import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  code?: string | null
  code_category?: string | null
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  description: string | null
  method: string | null
  method_legacy?: string | null
  method_steps: string[] | null
  method_step_photos: string[] | null
  created_at: string | null
  yield_qty: number | null
  yield_unit: string | null
  yield_percent?: number | null
  yield_pct?: number | null
  currency: string | null
  photo_url: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price: number | null
  target_food_cost_pct: number | null
}

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number
  qty: number
  unit: string
  yield_percent: number
  gross_qty_override: number | null
  line_type: 'ingredient' | 'subrecipe' | 'group'
  group_title: string | null
}

type Ingredient = {
  id: string
  code?: string | null
  name: string | null
  pack_unit: string | null
  net_unit_cost: number | null
}

type SubRecipe = {
  id: string
  code?: string | null
  name: string | null
  kitchen_id?: string | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function safeUnit(u: string | null | undefined) {
  return String(u ?? '').trim().toLowerCase() || 'g'
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
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
    }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

function fmtMacro(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

function shortId(id: string | null | undefined) {
  const s = String(id ?? '')
  if (!s) return '—'
  return s.replace(/[^a-fA-F0-9]/g, '').slice(0, 8).toUpperCase() || '—'
}

export default function RecipePrintCard() {
  const [sp] = useSearchParams()
  const id = sp.get('id')
  const autoPrint = sp.get('autoprint') === '1'

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setErr('Missing recipe id.')
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        setErr(null)

        const { data: r, error: rErr } = await supabase
          .from('recipes')
          .select(
            'id,code,code_category,kitchen_id,name,category,portions,description,method,method_legacy,method_steps,method_step_photos,created_at,yield_qty,yield_unit,currency,photo_url,calories,protein_g,carbs_g,fat_g,selling_price,target_food_cost_pct,yield_percent,yield_pct'
          )
          .eq('id', id)
          .single()

        if (rErr) throw rErr

        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select(
            'id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,gross_qty_override,line_type,group_title'
          )
          .eq('recipe_id', id)
          .order('position', { ascending: true })

        if (lErr) throw lErr

        const ingredientIds = Array.from(
          new Set(
            (l || [])
              .filter((x: any) => x?.line_type === 'ingredient' && x?.ingredient_id)
              .map((x: any) => x.ingredient_id)
          )
        )

        const { data: ing, error: iErr } = ingredientIds.length
          ? await supabase
              .from('ingredients')
              .select('id,code,name,pack_unit,net_unit_cost')
              .in('id', ingredientIds)
          : { data: [], error: null as any }

        if (iErr) throw iErr

        const { data: sr, error: sErr } = await supabase
          .from('recipes')
          .select('id,code,name,kitchen_id')
          .eq('kitchen_id', (r as any).kitchen_id)
          .eq('is_subrecipe', true)

        if (sErr) throw sErr

        if (!mounted.current) return

        setRecipe((r || null) as Recipe | null)
        setLines(((l || []) as Line[]) || [])
        setIngredients(((ing || []) as Ingredient[]) || [])
        setSubRecipes(((sr || []) as SubRecipe[]) || [])
      } catch (e: any) {
        if (!mounted.current) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    })()
  }, [id])

  const currency = recipe?.currency || 'USD'

  const printedAtRef = useRef<Date | null>(null)
  if (!printedAtRef.current) printedAtRef.current = new Date()
  const printedAt = printedAtRef.current
  const printedAtHuman = printedAt.toLocaleString()

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const subById = useMemo(() => {
    const m = new Map<string, SubRecipe>()
    for (const r of subRecipes) m.set(r.id, r)
    return m
  }, [subRecipes])

  const computed = useMemo(() => {
    const map = new Map<
      string,
      {
        code?: string
        title: string
        net: number
        gross: number
        yieldPct: number
        unitCost: number
        lineCost: number
        kind: string
      }
    >()

    for (const l of lines) {
      if (l.line_type === 'group') continue

      const net = Math.max(0, toNum(l.qty, 0))
      const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const grossAuto = y > 0 ? net / (y / 100) : net
      const gross =
        l.gross_qty_override != null && l.gross_qty_override >= 0
          ? l.gross_qty_override
          : grossAuto

      let unitCost = 0
      let title = 'Line'
      let kind = 'Ingredient'
      let code: string | undefined

      if (l.line_type === 'ingredient' && l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        title = ing?.name || 'Ingredient'
        code = ing?.code || undefined
        unitCost = toNum(ing?.net_unit_cost, 0)
        kind = 'Ingredient'
      }

      if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
        const sr = subById.get(l.sub_recipe_id)
        title = sr?.name || 'Subrecipe'
        code = sr?.code || undefined
        unitCost = 0
        kind = 'Subrecipe'
      }

      const lineCost = net * unitCost

      map.set(l.id, {
        code,
        title,
        net,
        gross,
        yieldPct: y,
        unitCost,
        lineCost,
        kind,
      })
    }

    return map
  }, [lines, ingById, subById])

  const totalCost = useMemo(() => {
    let t = 0
    for (const l of lines) {
      const c = computed.get(l.id)
      if (!c) continue
      t += c.lineCost
    }
    return t
  }, [lines, computed])

  const portions = clamp(toNum(recipe?.portions, 1), 1, 1_000_000)
  const perPortion = portions > 0 ? totalCost / portions : totalCost
  const selling = recipe?.selling_price ?? null
  const targetPct = recipe?.target_food_cost_pct ?? null
  const foodCostPct =
    selling != null && selling > 0 ? (perPortion / selling) * 100 : null

  const methodLegacy = String(
    recipe?.method_legacy ?? recipe?.method ?? ''
  ).trim()

  const steps: string[] = (() => {
    const arr = Array.isArray(recipe?.method_steps)
      ? (recipe?.method_steps as any[])
      : null

    if (arr && arr.length) {
      return arr.map((s) => String(s ?? '').trim()).filter(Boolean)
    }

    return methodLegacy
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  })()

  const yieldLabel = (() => {
    const qRaw = recipe?.yield_qty
    const uRaw = recipe?.yield_unit
    const q = Number(qRaw)
    const u = String(uRaw ?? '').trim()

    if (Number.isFinite(q) && qRaw != null) {
      const v = fmtQty(q)
      return u ? `${v} ${u}` : `${v}`
    }

    const pRaw = recipe?.yield_percent ?? recipe?.yield_pct
    const p = Number(pRaw)

    if (Number.isFinite(p) && pRaw != null) {
      return `${Math.round(p * 1000) / 1000}%`
    }

    return '—'
  })()

  const showNutrition =
    recipe?.calories != null ||
    recipe?.protein_g != null ||
    recipe?.carbs_g != null ||
    recipe?.fat_g != null

  const stepPhotos = Array.isArray(recipe?.method_step_photos)
    ? recipe!.method_step_photos!.filter(Boolean)
    : []

  useEffect(() => {
    if (!autoPrint) return
    if (loading || err || !recipe) return

    let cancelled = false

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (cancelled) return
          try {
            window.print()
          } catch {}
        }, 450)
      })
    })

    return () => {
      cancelled = true
    }
  }, [autoPrint, loading, err, recipe])

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>
  }

  if (err || !recipe) {
    return <div style={{ padding: 24 }}>{err || 'Missing recipe.'}</div>
  }

  return (
    <div
      style={{
        background: '#f6f7f9',
        minHeight: '100vh',
        padding: 24,
        color: '#111827',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        @media print {
          body {
            background: #fff !important;
          }
          .gc-print-shell {
            padding: 0 !important;
          }
          .gc-no-print {
            display: none !important;
          }
          .gc-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
          }
        }
      `}</style>

      <div className="gc-print-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div
          className="gc-no-print"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 16,
          }}
        >
          <button
            onClick={() => window.print()}
            style={{
              border: 'none',
              background: '#111827',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Print
          </button>
        </div>

        <div
          className="gc-card"
          style={{
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              padding: 20,
              background:
                'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
              color: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
                  Gastro Chef
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>Recipe Card</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 6 }}>
                  {recipe.name || 'Untitled Recipe'}
                </div>
              </div>

              <div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.95 }}>
                <div>Date {recipe.created_at ? String(recipe.created_at).slice(0, 10) : '—'}</div>
                <div>Kitchen Ref {shortId(recipe.kitchen_id)}</div>
                <div>Printed {printedAtHuman}</div>
                <div>Code {recipe.code || '—'}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <InfoCard label="Category" value={recipe.category || '—'} />
              <InfoCard label="Portions" value={String(recipe.portions || 1)} />
              <InfoCard label="Yield" value={yieldLabel} />
              <InfoCard label="Code" value={recipe.code || '—'} />
            </div>

            {recipe.description ? (
              <Section title="Description">
                <p style={{ margin: 0, lineHeight: 1.7 }}>{recipe.description}</p>
              </Section>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <MetricCard label="Total Cost" value={fmtMoney(totalCost, currency)} />
              <MetricCard label="Cost / Portion" value={fmtMoney(perPortion, currency)} />
              <MetricCard
                label="Selling"
                value={selling != null ? fmtMoney(selling, currency) : '—'}
              />
              <MetricCard
                label="Food Cost"
                value={
                  foodCostPct != null
                    ? `${foodCostPct.toFixed(1)}%${
                        targetPct != null ? ` (target ${targetPct.toFixed(1)}%)` : ''
                      }`
                    : '—'
                }
              />
            </div>

            {showNutrition ? (
              <Section title="Nutrition">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                  }}
                >
                  <InfoCard label="Calories" value={fmtMacro(recipe.calories)} />
                  <InfoCard label="Protein (g)" value={fmtMacro(recipe.protein_g)} />
                  <InfoCard label="Carbs (g)" value={fmtMacro(recipe.carbs_g)} />
                  <InfoCard label="Fat (g)" value={fmtMacro(recipe.fat_g)} />
                </div>
              </Section>
            ) : null}

            {recipe.photo_url ? (
              <Section title="Recipe Photo">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 520,
                    borderRadius: 14,
                    border: '1px solid #e5e7eb',
                  }}
                />
              </Section>
            ) : null}

            <Section title="Ingredients">
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <Th>Code</Th>
                      <Th>Item</Th>
                      <Th>Net</Th>
                      <Th>Gross</Th>
                      <Th>Yield</Th>
                      <Th>Unit Cost</Th>
                      <Th>Line Cost</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id}>
                            <td
                              colSpan={7}
                              style={{
                                padding: '10px 12px',
                                fontWeight: 800,
                                background: '#fafafa',
                                borderTop: '1px solid #e5e7eb',
                                borderBottom: '1px solid #e5e7eb',
                              }}
                            >
                              {l.group_title || 'Group'}
                            </td>
                          </tr>
                        )
                      }

                      const c = computed.get(l.id)
                      if (!c) return null

                      return (
                        <tr key={l.id}>
                          <Td>{c.code || '—'}</Td>
                          <Td>{c.title}</Td>
                          <Td>{fmtQty(c.net)} {safeUnit(l.unit)}</Td>
                          <Td>{fmtQty(c.gross)} {safeUnit(l.unit)}</Td>
                          <Td>{c.yieldPct.toFixed(1)}%</Td>
                          <Td>{fmtMoney(c.unitCost, currency)}</Td>
                          <Td>{fmtMoney(c.lineCost, currency)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            {(steps.length || methodLegacy) ? (
              <Section title="Method">
                {steps.length ? (
                  <div style={{ display: 'grid', gap: 16 }}>
                    {steps.map((s, i) => {
                      const img = stepPhotos?.[i]

                      return (
                        <div
                          key={i}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 14,
                            padding: 14,
                            background: '#fff',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              marginBottom: 10,
                              color: '#111827',
                            }}
                          >
                            Step {i + 1}
                          </div>

                          {img ? (
                            <img
                              src={img}
                              alt={`Step ${i + 1}`}
                              style={{
                                display: 'block',
                                width: '100%',
                                maxWidth: 420,
                                borderRadius: 12,
                                border: '1px solid #e5e7eb',
                                marginBottom: 10,
                              }}
                            />
                          ) : null}

                          <div style={{ lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{s}</div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {methodLegacy}
                  </div>
                )}
              </Section>
            ) : null}

            <div
              style={{
                marginTop: 20,
                paddingTop: 14,
                borderTop: '1px solid #e5e7eb',
                fontSize: 12,
                color: '#6b7280',
                textAlign: 'center',
              }}
            >
              Generated by GastroChef • Printed {printedAtHuman}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2
        style={{
          margin: '0 0 12px 0',
          fontSize: 18,
          fontWeight: 800,
          color: '#111827',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: 14,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #dbeafe',
        background: '#f8fbff',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        borderBottom: '1px solid #d1d5db',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #e5e7eb',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  )
}
