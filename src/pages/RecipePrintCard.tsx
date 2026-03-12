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
    const totalCost = rows.reduce((sum, r) => sum + (!r.isGroup ? r.lineCost : 0), 0)

    return rows.map((r) => {
      if (r.isGroup) return r
      const sharePct = totalNet > 0 ? (r.net / totalNet) * 100 : 0
      const costSharePct = totalCost > 0 ? (r.lineCost / totalCost) * 100 : 0
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
      <div className="min-h-screen bg-[#f6f1e8] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[34px] border border-[#e5dccf] bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-[#f6f1e8] p-6 text-stone-700">
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
          margin: 10mm;
        }

        html, body {
          background: #f6f1e8;
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

      <div className="print-stage min-h-screen bg-[#f6f1e8] px-4 py-5 md:px-8 md:py-8">
        <div className="no-print mx-auto mb-4 flex max-w-6xl justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Print Now
          </button>
        </div>

        <article className="print-paper mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-[#e4dacd] bg-white shadow-[0_28px_80px_rgba(0,0,0,0.08)]">
          <div className="h-[8px] bg-[linear-gradient(90deg,#171717_0%,#5c4b35_24%,#b8945d_56%,#ecd9b8_82%,#faf2e7_100%)]" />

          <header className="relative overflow-hidden border-b border-[#ebe1d4] bg-[radial-gradient(circle_at_top_right,rgba(200,171,120,0.16),transparent_24%),linear-gradient(135deg,#fffdf9_0%,#f8f1e5_45%,#fbf6ee_100%)] px-8 py-8 md:px-10 md:py-10">
            <div className="absolute right-[-24px] top-[-16px] h-40 w-40 rounded-full bg-[#c5a972]/15 blur-3xl" />
            <div className="absolute left-8 top-8 h-24 w-24 rounded-full bg-[#7d6847]/10 blur-2xl" />
            <div className="absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(188,156,109,0.85),transparent)]" />

            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-stone-500">
                  <span>GastroChef</span>
                  <span className="text-[#b8945d]">·</span>
                  <span>Three-Star Michelin Recipe Card</span>
                </div>

                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-stone-900 md:text-[3.55rem] md:leading-[1.02]">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Tag tone="dark">{recipe.code || 'NO CODE'}</Tag>
                  <Tag>{recipe.category || 'Uncategorized'}</Tag>
                  <Tag>{yieldLabel}</Tag>
                  <Tag>{portions} portions</Tag>
                  <Tag tone="gold">{recipe.code_category || 'Signature'}</Tag>
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

          <section className="border-b border-[#ebe1d4] px-8 py-7 md:px-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Total Cost" value={fmtMoney(totalCost, currency)} note="Full recipe cost" />
              <StatCard label="Per Portion" value={fmtMoney(perPortion, currency)} note="Unit serving cost" />
              <StatCard label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} note="Menu selling price" />
              <StatCard label="Food Cost" value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'} note={targetPct != null ? `Target ${targetPct.toFixed(1)}%` : 'No target'} />
              <StatCard label="Variance" value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'} note="Vs target" accent={varianceVsTarget != null && varianceVsTarget <= 0 ? 'good' : varianceVsTarget != null && varianceVsTarget > 2 ? 'bad' : 'neutral'} />
            </div>
          </section>

          <section className="border-b border-[#ebe1d4] px-8 py-8 md:px-10">
            <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <Panel eyebrow="Chef Overview" title="Signature Snapshot">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Recipe Code" value={recipe.code || '—'} />
                  <MiniMetric label="Category" value={recipe.category || '—'} />
                  <MiniMetric label="Portions" value={String(portions)} />
                  <MiniMetric label="Yield" value={yieldLabel} />
                </div>
              </Panel>

              <Panel eyebrow="Commercial View" title="Menu Economics">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Currency" value={currency.toUpperCase()} />
                  <MiniMetric label="Target FC" value={pct(targetPct)} />
                  <MiniMetric label="Actual FC" value={pct(foodCostPct)} />
                </div>
              </Panel>
            </div>
          </section>

          {recipe.photo_url ? (
            <section className="avoid-break border-b border-[#ebe1d4] px-8 py-8 md:px-10">
              <SectionHead
                overline="Presentation"
                title="Hero Dish Image"
                subtitle="Elegant visual reference for executive review, plating consistency, and premium recipe presentation."
              />

              <div className="overflow-hidden rounded-[32px] border border-[#e3d8cb] bg-stone-50 shadow-[0_12px_32px_rgba(0,0,0,0.05)]">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  className="max-h-[470px] w-full object-cover"
                />
              </div>
            </section>
          ) : null}

          <section className="border-b border-[#ebe1d4] px-8 py-8 md:px-10">
            <SectionHead
              overline="Costing"
              title="Three-Star Ingredient Breakdown"
              subtitle="More couture, more hierarchy, and a calmer premium rhythm inspired by fine-dining recipe books."
            />

            <div className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Panel eyebrow="Executive Summary" title="Costing Intelligence">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Total Cost" value={fmtMoney(totalCost, currency)} />
                  <MiniMetric label="Portion Cost" value={fmtMoney(perPortion, currency)} />
                  <MiniMetric label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} />
                  <MiniMetric label="Variance" value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'} />
                </div>
              </Panel>

              <Panel eyebrow="Chef Lens" title="Recipe Identity">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Recipe ID" value={shortId(recipe.id)} />
                  <MiniMetric label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                  <MiniMetric label="Code Category" value={recipe.code_category || '—'} />
                  <MiniMetric label="Printed" value={formatDateOnly(printedAt.toISOString())} />
                </div>
              </Panel>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-[#e4dacd] shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full border-collapse text-sm">
                  <thead className="bg-[linear-gradient(180deg,#fbf8f2_0%,#f2e7d4_100%)] text-stone-700">
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
                          <tr key={row.id} className="bg-[linear-gradient(90deg,#1f1f1f_0%,#6f5d42_100%)] text-white">
                            <td colSpan={11} className="px-4 py-3 text-sm font-semibold tracking-[0.16em] uppercase">
                              {row.groupTitle}
                            </td>
                          </tr>
                        )
                      }

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-[#fcfaf6]'
                      const rowClass = row.isSubrecipe ? 'bg-[#f5efe4] text-stone-800' : zebra

                      return (
                        <tr key={row.id} className={`${rowClass} align-top text-stone-700`}>
                          <Td className="font-medium text-stone-500">{row.code || '—'}</Td>
                          <Td className="font-semibold text-stone-900">
                            <div className="flex items-center gap-2">
                              {row.isSubrecipe ? <SubBadge>Sub Recipe</SubBadge> : null}
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
                          <Td className="text-right font-semibold tabular-nums text-stone-900">{fmtMoney(row.lineCost, currency)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-[linear-gradient(180deg,#faf6f0_0%,#f1e6d6_100%)]">
                      <td colSpan={9} className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Total Recipe Cost
                      </td>
                      <td colSpan={2} className="px-4 py-4 text-right text-lg font-semibold text-stone-900">
                        {fmtMoney(totalCost, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>

          {(steps.length || methodText) ? (
            <section className="border-b border-[#ebe1d4] px-8 py-8 md:px-10">
              <SectionHead
                overline="Method"
                title="Three-Star Preparation Flow"
                subtitle="A softer, more editorial step experience with premium spacing and refined visual cadence."
              />

              {steps.length ? (
                <div className="grid gap-4">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]

                    return (
                      <div key={`${i}-${s.slice(0, 24)}`} className="avoid-break overflow-hidden rounded-[28px] border border-[#e4dacd] bg-white shadow-[0_8px_22px_rgba(0,0,0,0.03)]">
                        <div className="grid md:grid-cols-[92px_1fr]">
                          <div className="flex items-start justify-center border-b border-[#ebe1d4] bg-[linear-gradient(180deg,#faf6ee_0%,#f2e8d8_100%)] px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#dbc8a8] bg-white text-sm font-semibold text-stone-900 shadow-sm">
                              {i + 1}
                            </div>
                          </div>

                          <div className="p-5 md:p-6">
                            {img ? (
                              <div className="mb-4 overflow-hidden rounded-2xl border border-[#e4dacd] bg-stone-50">
                                <img src={img} alt={`Step ${i + 1}`} className="max-h-[300px] w-full object-cover" />
                              </div>
                            ) : null}

                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{s}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="avoid-break rounded-[28px] border border-[#e4dacd] bg-[#fbf7f0] p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{methodText}</p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="avoid-break border-b border-[#ebe1d4] px-8 py-8 md:px-10">
              <SectionHead
                overline="Nutrition"
                title="Nutrition Overview"
                subtitle="Minimal and elegant macro presentation for premium hospitality workflows."
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NutritionCard label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCard label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCard label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCard label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="flex flex-col gap-3 bg-[linear-gradient(180deg,#faf6f0_0%,#f3ebde_100%)] px-8 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <div className="font-semibold uppercase tracking-[0.2em] text-stone-700">GastroChef Signature</div>
              <div className="mt-1">Three-star Michelin inspired premium recipe, costing, and kitchen presentation card.</div>
            </div>
            <div className="text-right">Printed {printedAtHuman} · Recipe ID {shortId(recipe.id)}</div>
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
    <div className="mb-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.30em] text-[#8c7550]">{overline}</div>
      <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-stone-900 md:text-[2.2rem]">{title}</h2>
      {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
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
        ? 'rounded-full border border-[#d9c39b] bg-[#f7efe1] px-3.5 py-1.5 text-xs font-medium text-[#8a6a38]'
        : 'rounded-full border border-[#e7ddd0] bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700'

  return <div className={classes}>{children}</div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e7ddd0] bg-white/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{label}</div>
      <div className="text-sm font-medium text-stone-900">{value}</div>
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
  accent = 'neutral',
}: {
  label: string
  value: string
  note?: string
  accent?: 'neutral' | 'good' | 'bad'
}) {
  const accentClass =
    accent === 'good' ? 'text-emerald-700' : accent === 'bad' ? 'text-red-700' : 'text-stone-900'

  return (
    <div className="rounded-[28px] border border-[#e7ddd0] bg-[linear-gradient(180deg,#ffffff_0%,#fbf6ee_100%)] p-5 shadow-[0_10px_26px_rgba(0,0,0,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#8b7450]">{label}</div>
      <div className={`mt-3 text-[1.95rem] font-semibold tracking-[-0.04em] ${accentClass}`}>{value}</div>
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
    <div className="rounded-[26px] border border-[#e7ddd0] bg-[linear-gradient(180deg,#fbf8f2_0%,#f2eadc_100%)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-stone-900">
        {value}
        <span className="ml-1 text-sm font-medium text-stone-500">{unit}</span>
      </div>
    </div>
  )
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[30px] border border-[#e7ddd0] bg-[linear-gradient(180deg,#ffffff_0%,#fcf8f1_100%)] p-5 shadow-[0_8px_22px_rgba(0,0,0,0.03)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8b7450]">{eyebrow}</div>
      <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-stone-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#ebe1d4] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-stone-500">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function SubBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#dcc9a8] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a38]">
      {children}
    </span>
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
    <th className={`border-b border-[#e7ddd0] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}>
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
  return <td className={`border-b border-[#f0e8dc] px-4 py-3 ${className}`}>{children}</td>
}
