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
  note?: string | null
  notes?: string | null
  prep_note?: string | null
  instruction?: string | null
  remark?: string | null
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
          .select('*')
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
        title = sr?.name || 'Sub Recipe'
        code = sr?.code || undefined
        unitCost = 0
        isSubrecipe = true
      }

      const lineCost = net * unitCost

      return {
        id: l.id,
        isGroup: false as const,
        isSubrecipe,
        code,
        title,
        net,
        gross,
        yieldPct: y,
        unit: safeUnit(l.unit),
        unitCost,
        lineCost,
        note: cleanText(
          (l as any).note ??
            (l as any).notes ??
            (l as any).prep_note ??
            (l as any).instruction ??
            (l as any).remark
        ),
      }
    })

    const totalNet = rows.reduce((sum, r) => sum + (!r.isGroup ? r.net : 0), 0)
    const totalCostLocal = rows.reduce((sum, r) => sum + (!r.isGroup ? r.lineCost : 0), 0)

    return rows.map((r) => {
      if (r.isGroup) return r
      const sharePct = totalNet > 0 ? (r.net / totalNet) * 100 : 0
      const costSharePct = totalCostLocal > 0 ? (r.lineCost / totalCostLocal) * 100 : 0
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
    if (arr && arr.length) return arr.map((s) => cleanText(s)).filter(Boolean)

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
      <div className="min-h-screen bg-[#f7f6f2] p-6 text-stone-700">
        <div className="mx-auto max-w-6xl rounded-[36px] border border-[#dfe5df] bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] p-6 text-stone-700">
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
          size: A4 portrait;
          margin: 10mm;
        }

        html,
        body {
          background: #f7f6f2;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }

        .avoid-break,
        .print-section,
        .print-panel,
        .method-step,
        .nutrition-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .recipe-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .recipe-table thead {
          display: table-header-group;
        }

        .recipe-table tfoot {
          display: table-row-group;
        }

        .recipe-table tr,
        .recipe-table td,
        .recipe-table th {
          break-inside: avoid;
          page-break-inside: avoid;
          vertical-align: top;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-stage {
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            background: #ffffff !important;
          }

          .print-paper {
            width: 100% !important;
            max-width: none !important;
            overflow: visible !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          .print-paper .overflow-x-auto,
          .print-paper .overflow-hidden {
            overflow: visible !important;
          }

          .ingredient-table-shell {
            overflow: visible !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          .hero-grid {
            display: block !important;
          }

          .hero-photo,
          .hero-photo img {
            min-height: 220px !important;
            max-height: 260px !important;
          }

          .recipe-table {
            font-size: 10px !important;
          }

          .recipe-table th,
          .recipe-table td {
            padding: 7px 8px !important;
          }

          .recipe-table th {
            font-size: 9px !important;
            line-height: 1.25 !important;
          }

          .print-section {
            break-inside: auto;
            page-break-inside: auto;
          }

          .method-step,
          .nutrition-card,
          .print-panel,
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="print-stage min-h-screen bg-[#f7f6f2] px-4 py-5 text-[#2b2b2b] md:px-8 md:py-8">
        <div className="no-print mx-auto mb-4 flex max-w-6xl items-center justify-end gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-2xl border border-[#dfe5df] bg-white px-5 py-3 text-sm font-medium text-[#556b2f] shadow-sm transition hover:bg-[#f7f6f2]"
            title="Open browser print and choose Save as PDF"
          >
            Save as PDF
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-2xl border border-[#dfe5df] bg-white px-5 py-3 text-sm font-medium text-[#2f6f5e] shadow-sm transition hover:bg-[#f7f6f2]"
          >
            Print Now
          </button>
        </div>

        <article className="print-paper mx-auto max-w-6xl rounded-[38px] border border-[#dfe5df] bg-white shadow-[0_22px_60px_rgba(0,0,0,0.08)]">
          <div className="h-[8px] bg-[linear-gradient(90deg,#556b2f_0%,#2f6f5e_48%,#dfe5df_100%)]" />

          <header className="print-section border-b border-[#dfe5df] bg-[linear-gradient(135deg,#ffffff_0%,#f7f6f2_100%)]">
            <div className="hero-grid grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="p-8 md:p-10">
                <div className="text-xs font-semibold uppercase tracking-[0.34em] text-[#556b2f]">
                  GastroChef Ultimate Recipe Card
                </div>

                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-[#2b2b2b] md:text-[3.4rem] md:leading-[1.02]">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                {recipe.description ? (
                  <p className="mt-4 max-w-3xl text-[15px] leading-7 text-stone-600">
                    {recipe.description}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2.5">
                  <Tag>{recipe.code || 'NO CODE'}</Tag>
                  <Tag>{recipe.category || 'Uncategorized'}</Tag>
                  <Tag>{yieldLabel}</Tag>
                  <Tag>{portions} portions</Tag>
                  <Tag tone="secondary">{recipe.code_category || 'General'}</Tag>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Recipe Cost" value={fmtMoney(totalCost, currency)} />
                  <MetricCard label="Per Portion" value={fmtMoney(perPortion, currency)} />
                  <MetricCard label="Selling Price" value={selling != null ? fmtMoney(selling, currency) : '—'} />
                  <MetricCard label="Food Cost" value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'} />
                </div>
              </div>

              {recipe.photo_url ? (
                <div className="hero-photo min-h-[280px] border-l border-[#dfe5df] bg-[#f7f6f2]">
                  <img
                    src={recipe.photo_url}
                    alt={recipe.name || 'Recipe'}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="hero-photo flex min-h-[280px] items-center justify-center border-l border-[#dfe5df] bg-[linear-gradient(135deg,#f7f6f2_0%,#eef3ef_100%)] p-10 text-center text-sm text-stone-500">
                  Add a recipe photo to show the hero dish here.
                </div>
              )}
            </div>
          </header>

          <section className="print-section border-b border-[#dfe5df] px-8 py-8 md:px-10">
            <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <Panel title="Recipe Identity" accent="olive">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Recipe ID" value={shortId(recipe.id)} />
                  <MiniMetric label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                  <MiniMetric label="Created" value={formatDateOnly(recipe.created_at)} />
                  <MiniMetric label="Printed" value={printedAtHuman} />
                </div>
              </Panel>

              <Panel title="Commercial Overview" accent="teal">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMetric label="Currency" value={currency.toUpperCase()} />
                  <MiniMetric label="Target FC" value={pct(targetPct)} />
                  <MiniMetric label="Variance" value={varianceVsTarget != null ? `${varianceVsTarget >= 0 ? '+' : ''}${varianceVsTarget.toFixed(1)}%` : '—'} />
                </div>
              </Panel>
            </div>
          </section>

          <section className="print-section ingredients-section border-b border-[#dfe5df] px-8 py-8 md:px-10">
            <SectionTitle>Ingredient Costing & Sub-Recipes</SectionTitle>

            <div className="ingredient-table-shell rounded-[28px] border border-[#dfe5df]">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full text-sm">
                  <thead className="bg-[linear-gradient(180deg,#f7f6f2_0%,#eef3ef_100%)] text-[#556b2f]">
                    <tr>
                      <Th className="w-[8%]">Code</Th>
                      <Th className="w-[22%]">Item</Th>
                      <Th className="w-[12%]">Note</Th>
                      <Th className="w-[9%] text-right">Net Qty</Th>
                      <Th className="w-[6%]">Unit</Th>
                      <Th className="w-[9%] text-right">Gross Qty</Th>
                      <Th className="w-[6%]">Unit</Th>
                      <Th className="w-[7%] text-right">Yield</Th>
                      <Th className="w-[7%] text-right">Qty %</Th>
                      <Th className="w-[7%] text-right">Cost %</Th>
                      <Th className="w-[9%] text-right">Unit Cost</Th>
                      <Th className="w-[10%] text-right">Line Cost</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {computedRows.map((row, index) => {
                      if (row.isGroup) {
                        return (
                          <tr key={row.id} className="bg-[linear-gradient(90deg,#556b2f_0%,#2f6f5e_100%)] text-white">
                            <td colSpan={12} className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em]">
                              {row.groupTitle}
                            </td>
                          </tr>
                        )
                      }

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-[#fbfcfb]'
                      const rowClass = row.isSubrecipe ? 'bg-[#eef3ef] text-stone-800' : zebra

                      return (
                        <tr key={row.id} className={`${rowClass} align-top text-stone-700`}>
                          <Td className="font-medium text-[#2f6f5e]">{row.code || '—'}</Td>
                          <Td className="font-semibold text-stone-900">
                            <div className="flex items-center gap-2">
                              {row.isSubrecipe ? <SubBadge>Sub Recipe</SubBadge> : null}
                              <span>{row.title}</span>
                            </div>
                          </Td>
                          <Td className="max-w-[180px] text-stone-600">{row.note || '—'}</Td>
                          <Td className="text-right tabular-nums">{fmtQty(row.net)}</Td>
                          <Td>{row.unit}</Td>
                          <Td className="text-right tabular-nums">{fmtQty(row.gross)}</Td>
                          <Td>{row.unit}</Td>
                          <Td className="text-right tabular-nums">{row.yieldPct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{row.sharePct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{row.costSharePct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(row.unitCost, currency)}</Td>
                          <Td className="text-right font-semibold tabular-nums text-[#556b2f]">{fmtMoney(row.lineCost, currency)}</Td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-[linear-gradient(180deg,#f7f6f2_0%,#eef3ef_100%)]">
                      <td colSpan={10} className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Total Recipe Cost
                      </td>
                      <td colSpan={2} className="px-4 py-4 text-right text-lg font-semibold text-[#556b2f]">
                        {fmtMoney(totalCost, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>

          {(steps.length || methodText) ? (
            <section className="print-section border-b border-[#dfe5df] px-8 py-8 md:px-10">
              <SectionTitle>Preparation Method & Step Photos</SectionTitle>

              {steps.length ? (
                <div className="grid gap-5">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]
                    return (
                      <div
                        key={`${i}-${s.slice(0, 24)}`}
                        className="method-step avoid-break overflow-hidden rounded-[26px] border border-[#dfe5df] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfb_100%)] shadow-[0_8px_20px_rgba(0,0,0,0.03)]"
                      >
                        <div className="grid md:grid-cols-[88px_220px_1fr]">
                          <div className="flex items-start justify-center border-b border-[#dfe5df] bg-[linear-gradient(180deg,#f7f6f2_0%,#eef3ef_100%)] px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f6f5e] text-sm font-semibold text-white shadow-sm">
                              {i + 1}
                            </div>
                          </div>

                          <div className="border-b border-[#dfe5df] p-5 md:border-b-0 md:border-r md:p-6">
                            {img ? (
                              <div className="overflow-hidden rounded-2xl border border-[#dfe5df] bg-white">
                                <img
                                  src={img}
                                  alt={`Step ${i + 1}`}
                                  className="aspect-square w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-[#dfe5df] bg-[#f7f6f2] px-4 text-center text-sm text-stone-400">
                                No step photo
                              </div>
                            )}
                          </div>

                          <div className="p-5 md:p-6">
                            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#556b2f]">
                              Step {i + 1}
                            </div>
                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{s}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="avoid-break rounded-[26px] border border-[#dfe5df] bg-[#fbfcfb] p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{methodText}</p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="print-section avoid-break border-b border-[#dfe5df] px-8 py-8 md:px-10">
              <SectionTitle>Nutrition Overview</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NutritionCard label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCard label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCard label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCard label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="print-section flex flex-col gap-3 bg-[linear-gradient(180deg,#f7f6f2_0%,#eef3ef_100%)] px-8 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <div className="font-semibold uppercase tracking-[0.2em] text-[#556b2f]">GastroChef World-Class Kitchen System</div>
              <div className="mt-1">Live recipe data from your system, with dish image, step photos, costing, and kitchen-ready preparation flow.</div>
            </div>
            <div className="text-right">Printed {printedAtHuman} · Recipe ID {shortId(recipe.id)}</div>
          </footer>
        </article>
      </div>
    </>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-6 text-[1.85rem] font-semibold tracking-[-0.03em] text-[#556b2f]">{children}</h2>
}

function Tag({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'secondary' }) {
  return (
    <div
      className={
        tone === 'secondary'
          ? 'rounded-full border border-[#dfe5df] bg-[#eef3ef] px-3.5 py-1.5 text-xs font-medium text-[#2f6f5e]'
          : 'rounded-full border border-[#dfe5df] bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700'
      }
    >
      {children}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-panel rounded-[22px] border border-[#dfe5df] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-[#2f6f5e]">{value}</div>
    </div>
  )
}

function Panel({ title, accent, children }: { title: string; accent: 'olive' | 'teal'; children: ReactNode }) {
  return (
    <div className="print-panel rounded-[28px] border border-[#dfe5df] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfb_100%)] p-5 shadow-[0_6px_18px_rgba(0,0,0,0.03)]">
      <div className={`text-[11px] font-semibold uppercase tracking-[0.26em] ${accent === 'olive' ? 'text-[#556b2f]' : 'text-[#2f6f5e]'}`}>
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#dfe5df] bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-stone-800">{value}</div>
    </div>
  )
}

function SubBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#dfe5df] bg-[#eef3ef] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2f6f5e]">
      {children}
    </span>
  )
}

function NutritionCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="nutrition-card rounded-[24px] border border-[#dfe5df] bg-[linear-gradient(180deg,#ffffff_0%,#f7f6f2_100%)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#556b2f]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-[#2b2b2b]">
        {value}
        <span className="ml-1 text-sm font-medium text-stone-500">{unit}</span>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`border-b border-[#dfe5df] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[#eef1ee] px-4 py-3 ${className}`}>{children}</td>
}
