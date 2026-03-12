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
  const foodCostPct = selling != null && selling > 0 ? (perPortion / selling) * 100 : null
  const varianceVsTarget = foodCostPct != null && targetPct != null ? foodCostPct - targetPct : null

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
      <div className="min-h-screen bg-[#f7f2ea] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[36px] border border-[#eadfce] bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-[#f7f2ea] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[36px] border border-red-200 bg-white p-10 shadow-sm">
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
          background: #f7f2ea;
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
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="print-stage min-h-screen bg-[linear-gradient(180deg,#f8f4ec_0%,#f4ede0_100%)] px-4 py-5 md:px-8 md:py-8">
        <div className="no-print mx-auto mb-4 flex max-w-6xl justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-2xl border border-[#d8be91] bg-white px-5 py-3 text-sm font-medium text-[#7f6334] shadow-sm transition hover:bg-[#fffaf1]"
          >
            Print Now
          </button>
        </div>

        <article className="print-paper mx-auto max-w-6xl overflow-hidden rounded-[38px] border border-[#e7dccb] bg-[linear-gradient(180deg,#fffdfa_0%,#fbf6ee_100%)] text-stone-800 shadow-[0_28px_80px_rgba(120,90,45,0.12)]">
          <div className="h-[9px] bg-[linear-gradient(90deg,#ccb07a_0%,#f2dfb5_22%,#b99052_48%,#f7ead0_72%,#d2b37f_100%)]" />

          <header className="relative overflow-hidden border-b border-[#eee4d6] bg-[radial-gradient(circle_at_top_right,rgba(212,183,120,0.22),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(236,224,196,0.8),transparent_20%),linear-gradient(135deg,#fffdfa_0%,#f9f2e7_54%,#fff9f1_100%)] px-8 py-8 md:px-10 md:py-10">
            <div className="absolute right-[-20px] top-[-10px] h-40 w-40 rounded-full bg-[#f2dfb5]/35 blur-3xl" />
            <div className="absolute left-8 top-8 h-24 w-24 rounded-full bg-[#d8be91]/30 blur-2xl" />
            <div className="absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(189,151,86,0.8),transparent)]" />

            <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9d7a46]">
                  <span>GastroChef</span>
                  <span className="text-[#c49c57]">·</span>
                  <span>Michelin Imperial Gold Masterpiece Edition</span>
                </div>

                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-stone-900 md:text-[3.6rem] md:leading-[1.02]">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <TagLight tone="gold-strong">{recipe.code || 'NO CODE'}</TagLight>
                  <TagLight tone="cream">{recipe.category || 'Uncategorized'}</TagLight>
                  <TagLight tone="cream">{yieldLabel}</TagLight>
                  <TagLight tone="cream">{portions} portions</TagLight>
                  <TagLight tone="gold-soft">{recipe.code_category || 'Signature'}</TagLight>
                </div>

                {recipe.description ? (
                  <p className="mt-6 max-w-3xl text-[15px] leading-7 text-stone-600">
                    {recipe.description}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <InfoRowLight label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                <InfoRowLight label="Created" value={formatDateOnly(recipe.created_at)} />
                <InfoRowLight label="Printed" value={printedAtHuman} />
                <InfoRowLight label="Yield" value={yieldLabel} />
              </div>
            </div>
          </header>

          <section className="border-b border-[#eee4d6] px-8 py-7 md:px-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCardLight label="Total Cost" value={fmtMoney(totalCost, currency)} note="Full recipe cost" />
              <StatCardLight label="Per Portion" value={fmtMoney(perPortion, currency)} note="Unit serving cost" />
              <StatCardLight label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} note="Menu selling price" />
              <StatCardLight label="Food Cost" value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'} note={targetPct != null ? `Target ${targetPct.toFixed(1)}%` : 'No target'} />
              <StatCardLight label="Variance" value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'} note="Vs target" accentClass={varianceVsTarget != null && varianceVsTarget <= 0 ? 'text-emerald-700' : varianceVsTarget != null && varianceVsTarget > 2 ? 'text-red-700' : 'text-[#9b7a46]'} />
            </div>
          </section>

          {recipe.photo_url ? (
            <section className="avoid-break border-b border-[#eee4d6] px-8 py-8 md:px-10">
              <SectionHeadLight
                overline="Presentation"
                title="Imperial Dish Image"
                subtitle="Hero plate image preserved with a brighter editorial luxury style for premium recipe presentation and plating reference."
              />

              <div className="overflow-hidden rounded-[34px] border border-[#eadfce] bg-white shadow-[0_16px_36px_rgba(170,136,77,0.14)]">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  className="max-h-[500px] w-full object-cover"
                />
              </div>
            </section>
          ) : null}

          <section className="border-b border-[#eee4d6] px-8 py-8 md:px-10">
            <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <PanelLight eyebrow="Chef Overview" title="Imperial Snapshot">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetricLight label="Recipe Code" value={recipe.code || '—'} />
                  <MiniMetricLight label="Category" value={recipe.category || '—'} />
                  <MiniMetricLight label="Portions" value={String(portions)} />
                  <MiniMetricLight label="Yield" value={yieldLabel} />
                </div>
              </PanelLight>

              <PanelLight eyebrow="Commercial View" title="Menu Economics">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetricLight label="Currency" value={currency.toUpperCase()} />
                  <MiniMetricLight label="Target FC" value={pct(targetPct)} />
                  <MiniMetricLight label="Actual FC" value={pct(foodCostPct)} />
                </div>
              </PanelLight>
            </div>
          </section>

          <section className="border-b border-[#eee4d6] px-8 py-8 md:px-10">
            <SectionHeadLight
              overline="Costing"
              title="Imperial Gold Ingredient Breakdown"
              subtitle="A bright luxury costing layout with executive clarity, refined hierarchy, and premium editorial rhythm."
            />

            <div className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <PanelLight eyebrow="Executive Summary" title="Costing Intelligence">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetricLight label="Total Cost" value={fmtMoney(totalCost, currency)} />
                  <MiniMetricLight label="Portion Cost" value={fmtMoney(perPortion, currency)} />
                  <MiniMetricLight label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} />
                  <MiniMetricLight label="Variance" value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'} />
                </div>
              </PanelLight>

              <PanelLight eyebrow="Chef Lens" title="Recipe Identity">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetricLight label="Recipe ID" value={shortId(recipe.id)} />
                  <MiniMetricLight label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                  <MiniMetricLight label="Code Category" value={recipe.code_category || '—'} />
                  <MiniMetricLight label="Printed" value={formatDateOnly(printedAt.toISOString())} />
                </div>
              </PanelLight>
            </div>

            <div className="overflow-hidden rounded-[34px] border border-[#eadfce] shadow-[0_12px_28px_rgba(170,136,77,0.12)]">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full border-collapse text-sm">
                  <thead className="bg-[linear-gradient(180deg,#fff8ec_0%,#f7eddc_100%)] text-[#8a6a38]">
                    <tr>
                      <ThLight className="w-[8%]">Code</ThLight>
                      <ThLight className="w-[24%]">Item</ThLight>
                      <ThLight className="w-[10%] text-right">Net Qty</ThLight>
                      <ThLight className="w-[7%]">Unit</ThLight>
                      <ThLight className="w-[10%] text-right">Gross Qty</ThLight>
                      <ThLight className="w-[7%]">Unit</ThLight>
                      <ThLight className="w-[8%] text-right">Yield</ThLight>
                      <ThLight className="w-[8%] text-right">Qty %</ThLight>
                      <ThLight className="w-[8%] text-right">Cost %</ThLight>
                      <ThLight className="w-[8%] text-right">Unit Cost</ThLight>
                      <ThLight className="w-[12%] text-right">Line Cost</ThLight>
                    </tr>
                  </thead>

                  <tbody>
                    {computedRows.map((row, index) => {
                      if (row.isGroup) {
                        return (
                          <tr key={row.id} className="bg-[linear-gradient(90deg,#d9ba83_0%,#f1dfba_45%,#d6b276_100%)] text-[#6a4d20]">
                            <td colSpan={11} className="px-4 py-3 text-sm font-semibold tracking-[0.16em] uppercase">
                              {row.groupTitle}
                            </td>
                          </tr>
                        )
                      }

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-[#fffaf3]'
                      const rowClass = row.isSubrecipe ? 'bg-[#fbf1e3] text-stone-800' : zebra

                      return (
                        <tr key={row.id} className={`${rowClass} align-top text-stone-700`}>
                          <TdLight className="font-medium text-[#b18a4a]">{row.code || '—'}</TdLight>
                          <TdLight className="font-semibold text-stone-900">
                            <div className="flex items-center gap-2">
                              {row.isSubrecipe ? <SubBadgeLight>Sub Recipe</SubBadgeLight> : null}
                              <span>{row.title}</span>
                            </div>
                          </TdLight>
                          <TdLight className="text-right tabular-nums">{fmtQty(row.net)}</TdLight>
                          <TdLight>{row.unit}</TdLight>
                          <TdLight className="text-right tabular-nums">{fmtQty(row.gross)}</TdLight>
                          <TdLight>{row.unit}</TdLight>
                          <TdLight className="text-right tabular-nums">{row.yieldPct.toFixed(1)}%</TdLight>
                          <TdLight className="text-right tabular-nums">{row.sharePct.toFixed(1)}%</TdLight>
                          <TdLight className="text-right tabular-nums">{row.costSharePct.toFixed(1)}%</TdLight>
                          <TdLight className="text-right tabular-nums">{fmtMoney(row.unitCost, currency)}</TdLight>
                          <TdLight className="text-right font-semibold tabular-nums text-[#8c6631]">{fmtMoney(row.lineCost, currency)}</TdLight>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-[linear-gradient(180deg,#fff8ec_0%,#f6ebd9_100%)]">
                      <td colSpan={9} className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-[#b28f58]">
                        Total Recipe Cost
                      </td>
                      <td colSpan={2} className="px-4 py-4 text-right text-lg font-semibold text-[#8c6631]">
                        {fmtMoney(totalCost, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>

          {(steps.length || methodText) ? (
            <section className="border-b border-[#eee4d6] px-8 py-8 md:px-10">
              <SectionHeadLight
                overline="Method"
                title="Imperial Preparation Flow"
                subtitle="Step photos and recipe steps remain fully preserved in a brighter luxury layout for chef training and elegant print presentation."
              />

              {steps.length ? (
                <div className="grid gap-4">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]

                    return (
                      <div key={`${i}-${s.slice(0, 24)}`} className="avoid-break overflow-hidden rounded-[30px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdfa_0%,#fbf6ee_100%)] shadow-[0_10px_24px_rgba(170,136,77,0.10)]">
                        <div className="grid md:grid-cols-[92px_1fr]">
                          <div className="flex items-start justify-center border-b border-[#eee4d6] bg-[linear-gradient(180deg,#fff8ec_0%,#f7ecdc_100%)] px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d9ba83] bg-white text-sm font-semibold text-[#8a6a38] shadow-sm">
                              {i + 1}
                            </div>
                          </div>

                          <div className="p-5 md:p-6">
                            {img ? (
                              <div className="mb-4 overflow-hidden rounded-2xl border border-[#eadfce] bg-white">
                                <img src={img} alt={`Step ${i + 1}`} className="max-h-[320px] w-full object-cover" />
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
                <div className="avoid-break rounded-[30px] border border-[#eadfce] bg-[#fffaf3] p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{methodText}</p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="avoid-break border-b border-[#eee4d6] px-8 py-8 md:px-10">
              <SectionHeadLight
                overline="Nutrition"
                title="Imperial Gold Nutrition Overview"
                subtitle="Bright premium macro presentation suited for fine dining, wellness menus, and polished recipe exports."
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NutritionCardLight label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCardLight label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCardLight label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCardLight label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="flex flex-col gap-3 bg-[linear-gradient(180deg,#fffaf2_0%,#f7ecdc_100%)] px-8 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <div className="font-semibold uppercase tracking-[0.2em] text-[#a17d47]">GastroChef Signature</div>
              <div className="mt-1">Michelin Imperial Gold Masterpiece Edition with hero dish image and step photos preserved.</div>
            </div>
            <div className="text-right">Printed {printedAtHuman} · Recipe ID {shortId(recipe.id)}</div>
          </footer>
        </article>
      </div>
    </>
  )
}

function SectionHeadLight({
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
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.30em] text-[#b18a4a]">{overline}</div>
      <h2 className="text-[2rem] font-semibold tracking-[-0.04em] text-stone-900 md:text-[2.2rem]">{title}</h2>
      {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
    </div>
  )
}

function TagLight({
  children,
  tone = 'cream',
}: {
  children: ReactNode
  tone?: 'cream' | 'gold-soft' | 'gold-strong'
}) {
  const classes =
    tone === 'gold-strong'
      ? 'rounded-full border border-[#d2b37f] bg-[#fff4de] px-3.5 py-1.5 text-xs font-medium text-[#8c6631]'
      : tone === 'gold-soft'
        ? 'rounded-full border border-[#eadfce] bg-[#fbf2e4] px-3.5 py-1.5 text-xs font-medium text-[#ad8447]'
        : 'rounded-full border border-[#eadfce] bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700'

  return <div className={classes}>{children}</div>
}

function InfoRowLight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#eadfce] bg-white/90 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b18a4a]">{label}</div>
      <div className="text-sm font-medium text-stone-800">{value}</div>
    </div>
  )
}

function StatCardLight({
  label,
  value,
  note,
  accentClass = 'text-[#9b7a46]',
}: {
  label: string
  value: string
  note?: string
  accentClass?: string
}) {
  return (
    <div className="rounded-[28px] border border-[#eadfce] bg-[linear-gradient(180deg,#ffffff_0%,#fdf7ee_100%)] p-5 shadow-[0_10px_26px_rgba(170,136,77,0.10)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#b18a4a]">{label}</div>
      <div className={`mt-3 text-[1.95rem] font-semibold tracking-[-0.04em] ${accentClass}`}>{value}</div>
      {note ? <div className="mt-2 text-xs text-stone-500">{note}</div> : null}
    </div>
  )
}

function NutritionCardLight({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-[26px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdfa_0%,#f9f0e2_100%)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b18a4a]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-[#8c6631]">
        {value}
        <span className="ml-1 text-sm font-medium text-stone-500">{unit}</span>
      </div>
    </div>
  )
}

function PanelLight({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[30px] border border-[#eadfce] bg-[linear-gradient(180deg,#ffffff_0%,#fcf6ed_100%)] p-5 shadow-[0_8px_22px_rgba(170,136,77,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b18a4a]">{eyebrow}</div>
      <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-stone-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MiniMetricLight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#eadfce] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-[#b18a4a]">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-stone-800">{value}</div>
    </div>
  )
}

function SubBadgeLight({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#d2b37f] bg-[#fff5e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9b7340]">
      {children}
    </span>
  )
}

function ThLight({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <th className={`border-b border-[#eadfce] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}>
      {children}
    </th>
  )
}

function TdLight({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <td className={`border-b border-[#f2e8da] px-4 py-3 ${className}`}>{children}</td>
}
