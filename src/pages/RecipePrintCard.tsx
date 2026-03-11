import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
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
  method_steps: string[] | null
  method_step_photos: string[] | null
  created_at: string | null
  yield_qty: number | null
  yield_unit: string | null
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
}

function toNum(x: unknown, fallback = 0) {
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
      maximumFractionDigits: 2,
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

function cleanText(s: string | null | undefined) {
  return String(s ?? '').trim()
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString()
}

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(1)}%`
}

function toneForVariance(v: number | null) {
  if (v == null || !Number.isFinite(v)) return 'text-stone-900'
  if (v <= 0) return 'text-emerald-700'
  if (v <= 2) return 'text-amber-700'
  return 'text-red-700'
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
            'id,code,code_category,kitchen_id,name,category,portions,description,method,method_steps,method_step_photos,created_at,yield_qty,yield_unit,currency,photo_url,calories,protein_g,carbs_g,fat_g,selling_price,target_food_cost_pct'
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
          .eq('kitchen_id', (r as Recipe).kitchen_id)
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

  const computedRows = useMemo(() => {
    const rows = lines.map((l) => {
      if (l.line_type === 'group') {
        return {
          id: l.id,
          isGroup: true as const,
          groupTitle: l.group_title || 'Group',
        }
      }

      const net = Math.max(0, toNum(l.qty, 0))
      const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const grossAuto = y > 0 ? net / (y / 100) : net
      const gross =
        l.gross_qty_override != null && l.gross_qty_override >= 0
          ? l.gross_qty_override
          : grossAuto

      let unitCost = 0
      let title = 'Line'
      let code: string | undefined
      let isSubrecipe = false

      if (l.line_type === 'ingredient' && l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        title = ing?.name || 'Ingredient'
        code = ing?.code || undefined
        unitCost = toNum(ing?.net_unit_cost, 0)
      }

      if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
        const sr = subById.get(l.sub_recipe_id)
        title = sr?.name || 'Subrecipe'
        code = sr?.code || undefined
        unitCost = 0
        isSubrecipe = true
      }

      const lineCost = net * unitCost

      return {
        id: l.id,
        isGroup: false as const,
        lineType: l.line_type,
        isSubrecipe,
        code,
        title,
        net,
        gross,
        yieldPct: y,
        unit: safeUnit(l.unit),
        unitCost,
        lineCost,
      }
    })

    const totalNet = rows.reduce((sum, r) => sum + (!r.isGroup ? r.net : 0), 0)
    const totalLineCost = rows.reduce((sum, r) => sum + (!r.isGroup ? r.lineCost : 0), 0)

    return rows.map((r) => {
      if (r.isGroup) return r
      const sharePct = totalNet > 0 ? (r.net / totalNet) * 100 : 0
      const costSharePct = totalLineCost > 0 ? (r.lineCost / totalLineCost) * 100 : 0
      return {
        ...r,
        sharePct,
        costSharePct,
      }
    })
  }, [lines, ingById, subById])

  const totalCost = useMemo(() => {
    return computedRows.reduce((sum, r) => sum + (!r.isGroup ? r.lineCost : 0), 0)
  }, [computedRows])

  const portions = clamp(toNum(recipe?.portions, 1), 1, 1_000_000)
  const perPortion = portions > 0 ? totalCost / portions : totalCost
  const selling = recipe?.selling_price ?? null
  const targetPct = recipe?.target_food_cost_pct ?? null
  const foodCostPct =
    selling != null && selling > 0 ? (perPortion / selling) * 100 : null

  const varianceVsTarget =
    foodCostPct != null && targetPct != null ? foodCostPct - targetPct : null

  const methodText = cleanText(recipe?.method)

  const steps: string[] = useMemo(() => {
    const arr = Array.isArray(recipe?.method_steps) ? recipe.method_steps : null
    if (arr && arr.length) {
      return arr.map((s) => cleanText(s)).filter(Boolean)
    }

    return methodText
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }, [recipe?.method_steps, methodText])

  const stepPhotos = Array.isArray(recipe?.method_step_photos)
    ? recipe.method_step_photos.filter(Boolean)
    : []

  const yieldLabel = useMemo(() => {
    const qRaw = recipe?.yield_qty
    const uRaw = recipe?.yield_unit
    const q = Number(qRaw)
    const u = String(uRaw ?? '').trim()

    if (Number.isFinite(q) && qRaw != null) {
      const v = fmtQty(q)
      return u ? `${v} ${u}` : `${v}`
    }

    return '—'
  }, [recipe?.yield_qty, recipe?.yield_unit])

  const showNutrition =
    recipe?.calories != null ||
    recipe?.protein_g != null ||
    recipe?.carbs_g != null ||
    recipe?.fat_g != null

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
          } catch {
            // ignore
          }
        }, 450)
      })
    })

    return () => {
      cancelled = true
    }
  }, [autoPrint, loading, err, recipe])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f0e8] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[34px] border border-stone-200 bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-[#f4f0e8] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[34px] border border-red-200 bg-white p-10 shadow-sm">
          {err || 'Missing recipe.'}
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @page {
          size: A4;
          margin: 9mm;
        }

        html, body {
          background: #f4f0e8;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .recipe-table thead {
          display: table-header-group;
        }

        .recipe-table tr,
        .recipe-table td,
        .recipe-table th,
        .avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @media print {
          html, body {
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-stage {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            background: #ffffff !important;
          }

          .print-paper {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="print-stage min-h-screen bg-[#f4f0e8] px-4 py-5 md:px-8 md:py-8">
        <div className="no-print mx-auto mb-4 flex max-w-6xl justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Print Now
          </button>
        </div>

        <article className="print-paper mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-[#ddd5c7] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.08)]">
          <div className="h-[8px] bg-[linear-gradient(90deg,#3d4737_0%,#6b7d5f_28%,#bda37a_64%,#eadfcb_100%)]" />

          <header className="relative overflow-hidden border-b border-stone-200 bg-[radial-gradient(circle_at_top_right,rgba(189,163,122,0.16),transparent_28%),linear-gradient(135deg,#fdfcf9_0%,#f4eee3_55%,#f7f2ea_100%)] px-8 py-8 md:px-10 md:py-10">
            <div className="absolute right-[-30px] top-[-20px] h-44 w-44 rounded-full bg-[#6f8163]/10 blur-3xl" />
            <div className="absolute left-6 top-6 h-24 w-24 rounded-full bg-[#baa07a]/15 blur-2xl" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-[linear-gradient(90deg,transparent,rgba(189,163,122,0.8),transparent)]" />

            <div className="relative grid gap-8 lg:grid-cols-[1.18fr_0.82fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-stone-500">
                  <span>GastroChef</span>
                  <span className="text-[#b59666]">·</span>
                  <span>Michelin Executive Card</span>
                </div>

                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-stone-900 md:text-[3.35rem] md:leading-[1.03]">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Tag tone="dark">{recipe.code || 'NO CODE'}</Tag>
                  <Tag>{recipe.category || 'Uncategorized'}</Tag>
                  <Tag>{yieldLabel}</Tag>
                  <Tag>{portions} portions</Tag>
                  <Tag tone="gold">{recipe.code_category || 'Executive'}</Tag>
                </div>

                {recipe.description ? (
                  <p className="mt-6 max-w-3xl text-[15px] leading-7 text-stone-600">
                    {recipe.description}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <InfoRow label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                <InfoRow label="Created" value={formatDateOnly(recipe.created_at)} />
                <InfoRow label="Printed" value={printedAtHuman} />
                <InfoRow label="Yield" value={yieldLabel} />
              </div>
            </div>
          </header>

          <section className="border-b border-stone-200 px-8 py-6 md:px-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <ExecutiveStatCard
                label="Total Cost"
                value={fmtMoney(totalCost, currency)}
                note="Full recipe cost"
              />
              <ExecutiveStatCard
                label="Per Portion"
                value={fmtMoney(perPortion, currency)}
                note="Unit serving cost"
              />
              <ExecutiveStatCard
                label="Selling Price"
                value={selling != null ? fmtMoney(selling, currency) : '—'}
                note="Menu selling price"
              />
              <ExecutiveStatCard
                label="Food Cost"
                value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}
                note={targetPct != null ? `Target ${targetPct.toFixed(1)}%` : 'No target'}
              />
              <ExecutiveStatCard
                label="Variance"
                value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'}
                note="Vs target"
                valueClassName={toneForVariance(varianceVsTarget)}
              />
            </div>
          </section>

          <section className="border-b border-stone-200 px-8 py-7 md:px-10">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <ExecutivePanel eyebrow="Chef Summary" title="Operational Snapshot">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Recipe Code" value={recipe.code || '—'} />
                  <MiniMetric label="Category" value={recipe.category || '—'} />
                  <MiniMetric label="Portions" value={String(portions)} />
                  <MiniMetric label="Yield" value={yieldLabel} />
                </div>
              </ExecutivePanel>

              <ExecutivePanel eyebrow="Commercial" title="Menu Positioning">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Currency" value={currency.toUpperCase()} />
                  <MiniMetric label="Target FC" value={pct(targetPct)} />
                  <MiniMetric label="Actual FC" value={pct(foodCostPct)} />
                </div>
              </ExecutivePanel>
            </div>
          </section>

          <section className="border-b border-stone-200 px-8 py-7 md:px-10">
            <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <ExecutivePanel eyebrow="Management View" title="Financial Summary">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Recipe Cost" value={fmtMoney(totalCost, currency)} />
                  <MiniMetric label="Portion Cost" value={fmtMoney(perPortion, currency)} />
                  <MiniMetric label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} />
                  <MiniMetric
                    label="Gross Margin"
                    value={selling != null ? fmtMoney(selling - perPortion, currency) : '—'}
                  />
                </div>
              </ExecutivePanel>

              <ExecutivePanel eyebrow="Kitchen Identity" title="Card Metadata">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Recipe ID" value={shortId(recipe.id)} />
                  <MiniMetric label="Code Category" value={recipe.code_category || '—'} />
                  <MiniMetric label="Created" value={formatDateOnly(recipe.created_at)} />
                  <MiniMetric label="Printed" value={printedAt.toLocaleDateString()} />
                </div>
              </ExecutivePanel>
            </div>
          </section>

          {recipe.photo_url ? (
            <section className="avoid-break border-b border-stone-200 px-8 py-8 md:px-10">
              <SectionHead
                overline="Presentation"
                title="Hero Dish Reference"
                subtitle="Premium visual reference designed for executive review, service quality, and plating consistency."
              />

              <div className="overflow-hidden rounded-[30px] border border-[#ded5c8] bg-stone-50 shadow-[0_12px_34px_rgba(0,0,0,0.05)]">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  className="max-h-[470px] w-full object-cover"
                />
              </div>
            </section>
          ) : null}

          <section className="border-b border-stone-200 px-8 py-8 md:px-10">
            <SectionHead
              overline="Costing"
              title="Executive Ingredient Breakdown"
              subtitle="Luxury print layout with stronger costing readability for chefs, owners, and menu engineers."
            />

            <div className="overflow-hidden rounded-[30px] border border-[#ddd5c7]">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full border-collapse text-sm">
                  <thead className="bg-[linear-gradient(180deg,#faf7f1_0%,#f4eee3_100%)] text-stone-700">
                    <tr>
                      <Th className="w-[8%]">Code</Th>
                      <Th className="w-[24%]">Item</Th>
                      <Th className="w-[10%] text-right">Net Qty</Th>
                      <Th className="w-[7%]">Unit</Th>
                      <Th className="w-[10%] text-right">Gross Qty</Th>
                      <Th className="w-[7%]">Unit</Th>
                      <Th className="w-[8%] text-right">Yield</Th>
                      <Th className="w-[8%] text-right">Qty %</Th>
                      <Th className="w-[8%] text-right">Cost %</Th>
                      <Th className="w-[8%] text-right">Unit Cost</Th>
                      <Th className="w-[12%] text-right">Line Cost</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {computedRows.map((row, index) => {
                      if (row.isGroup) {
                        return (
                          <tr key={row.id} className="bg-[linear-gradient(90deg,#4b5843_0%,#68785d_100%)] text-white">
                            <td colSpan={11} className="px-4 py-3 text-sm font-semibold tracking-[0.16em] uppercase">
                              {row.groupTitle}
                            </td>
                          </tr>
                        )
                      }

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-[#fbf8f2]'
                      const subrecipeClass = row.isSubrecipe
                        ? 'bg-[#eef3ea] text-stone-800'
                        : zebra

                      return (
                        <tr key={row.id} className={`${subrecipeClass} align-top text-stone-700`}>
                          <Td className="font-medium text-stone-500">{row.code || '—'}</Td>
                          <Td className="font-semibold text-stone-900">
                            <div className="flex items-center gap-2">
                              {row.isSubrecipe ? (
                                <span className="inline-flex rounded-full border border-[#d2dccb] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7455]">
                                  Sub Recipe
                                </span>
                              ) : null}
                              <span>{row.title}</span>
                            </div>
                          </Td>
                          <Td className="text-right tabular-nums">{fmtQty(row.net)}</Td>
                          <Td>{row.unit}</Td>
                          <Td className="text-right tabular-nums">{fmtQty(row.gross)}</Td>
                          <Td>{row.unit}</Td>
                          <Td className="text-right tabular-nums">{row.yieldPct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{row.sharePct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{row.costSharePct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(row.unitCost, currency)}</Td>
                          <Td className="text-right font-semibold tabular-nums text-stone-900">
                            {fmtMoney(row.lineCost, currency)}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-[linear-gradient(180deg,#faf7f1_0%,#f2eadc_100%)]">
                      <td
                        colSpan={9}
                        className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-stone-500"
                      >
                        Total Recipe Cost
                      </td>
                      <td
                        colSpan={2}
                        className="px-4 py-4 text-right text-lg font-semibold text-stone-900"
                      >
                        {fmtMoney(totalCost, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>

          {(steps.length || methodText) ? (
            <section className="border-b border-stone-200 px-8 py-8 md:px-10">
              <SectionHead
                overline="Method"
                title="Michelin Preparation Flow"
                subtitle="Luxury step hierarchy for precise kitchen execution, onboarding, and chef-level readability."
              />

              {steps.length ? (
                <div className="grid gap-4">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]

                    return (
                      <div
                        key={`${i}-${s.slice(0, 24)}`}
                        className="avoid-break overflow-hidden rounded-[26px] border border-[#ddd5c7] bg-white shadow-[0_8px_22px_rgba(0,0,0,0.03)]"
                      >
                        <div className="grid md:grid-cols-[92px_1fr]">
                          <div className="flex items-start justify-center border-b border-stone-200 bg-[linear-gradient(180deg,#faf6ee_0%,#f2eadc_100%)] px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#dbcdb5] bg-white text-sm font-semibold text-stone-900 shadow-sm">
                              {i + 1}
                            </div>
                          </div>

                          <div className="p-5 md:p-6">
                            {img ? (
                              <div className="mb-4 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                                <img
                                  src={img}
                                  alt={`Step ${i + 1}`}
                                  className="max-h-[300px] w-full object-cover"
                                />
                              </div>
                            ) : null}

                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                              {s}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="avoid-break rounded-[26px] border border-stone-200 bg-[#faf7f1] p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                    {methodText}
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="avoid-break border-b border-stone-200 px-8 py-8 md:px-10">
              <SectionHead
                overline="Nutrition"
                title="Executive Macro Overview"
                subtitle="Premium nutrition block for professional exports, wellness menus, and premium client presentation."
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NutritionCard label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCard label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCard label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCard label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="flex flex-col gap-3 bg-[linear-gradient(180deg,#faf7f1_0%,#f3ebde_100%)] px-8 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <div className="font-semibold uppercase tracking-[0.2em] text-stone-700">GastroChef Executive</div>
              <div className="mt-1">Michelin-inspired recipe, costing, and kitchen execution print system.</div>
            </div>
            <div className="text-right">
              Printed {printedAtHuman} · Recipe ID {shortId(recipe.id)}
            </div>
          </footer>
        </article>
      </div>
    </>
  )
}

function SectionHead({
  overline,
  title,
  subtitle,
}: {
  overline: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-stone-500">
        {overline}
      </div>
      <h2 className="text-[1.9rem] font-semibold tracking-[-0.03em] text-stone-900">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-stone-600">{subtitle}</p> : null}
    </div>
  )
}

function Tag({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'dark' | 'gold'
}) {
  const classes =
    tone === 'dark'
      ? 'rounded-full border border-stone-900 bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-white'
      : tone === 'gold'
        ? 'rounded-full border border-[#d8c6a6] bg-[#f6efe2] px-3.5 py-1.5 text-xs font-medium text-[#866945]'
        : 'rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700'

  return <div className={classes}>{children}</div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e0d8cb] bg-white/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="text-sm font-medium text-stone-900">{value}</div>
    </div>
  )
}

function ExecutiveStatCard({
  label,
  value,
  note,
  valueClassName = 'text-stone-900',
}: {
  label: string
  value: string
  note?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-[26px] border border-[#e0d8cb] bg-[linear-gradient(180deg,#ffffff_0%,#faf6ee_100%)] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.035)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
        {label}
      </div>
      <div className={`mt-3 text-2xl font-semibold tracking-[-0.03em] ${valueClassName}`}>
        {value}
      </div>
      {note ? <div className="mt-2 text-xs text-stone-500">{note}</div> : null}
    </div>
  )
}

function NutritionCard({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-[26px] border border-[#e0d8cb] bg-[linear-gradient(180deg,#fbf8f2_0%,#f1e8d9_100%)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-stone-900">
        {value}
        <span className="ml-1 text-sm font-medium text-stone-500">{unit}</span>
      </div>
    </div>
  )
}

function ExecutivePanel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[28px] border border-[#e0d8cb] bg-white p-5 shadow-[0_6px_18px_rgba(0,0,0,0.02)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {eyebrow}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-stone-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e4ddd1] bg-[#fbf8f2] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function Th({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <th
      className={`border-b border-[#e0d8cb] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <td className={`border-b border-[#eee7dc] px-4 py-3 ${className}`}>{children}</td>
}
