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

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString()
}

function cleanText(s: string | null | undefined) {
  return String(s ?? '').trim()
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
      let code: string | undefined

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

  const stepPhotos = Array.isArray(recipe?.method_step_photos)
    ? recipe.method_step_photos.filter(Boolean)
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
          } catch {
            // ignore print errors
          }
        }, 500)
      })
    })

    return () => {
      cancelled = true
    }
  }, [autoPrint, loading, err, recipe])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 p-6 text-stone-700">
        <div className="mx-auto max-w-5xl rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-stone-100 p-6 text-stone-700">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-200 bg-white p-10 shadow-sm">
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
          margin: 12mm;
        }

        html, body {
          background: #f5f5f4;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-shell {
          width: 100%;
        }

        .print-card {
          background: #ffffff;
          color: #1c1917;
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
        .recipe-table th {
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

          .print-shell {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
          }

          .print-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <div className="print-shell min-h-screen bg-stone-100 p-4 md:p-8">
        <div className="no-print mx-auto mb-4 flex max-w-5xl justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Print Now
          </button>
        </div>

        <article className="print-card mx-auto max-w-5xl rounded-[28px] border border-stone-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <header className="border-b border-stone-200 p-6 md:p-8">
            <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-4 inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600">
                  GastroChef · Premium Recipe Print
                </div>

                <h1 className="text-3xl font-black tracking-tight text-stone-900 md:text-5xl">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                <div className="mt-3 flex flex-wrap gap-2">
                  <MetaPill label="Code" value={recipe.code || '—'} />
                  <MetaPill label="Category" value={recipe.category || '—'} />
                  <MetaPill label="Yield" value={yieldLabel} />
                  <MetaPill label="Portions" value={String(portions)} />
                </div>

                {recipe.description ? (
                  <p className="mt-5 max-w-3xl text-sm leading-7 text-stone-600 md:text-[15px]">
                    {recipe.description}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                <InfoPanel label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                <InfoPanel label="Created" value={formatDateOnly(recipe.created_at)} />
                <InfoPanel label="Printed" value={printedAtHuman} />
                <InfoPanel label="Code Category" value={recipe.code_category || '—'} />
              </div>
            </div>
          </header>

          <section className="border-b border-stone-200 p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total Recipe Cost"
                value={fmtMoney(totalCost, currency)}
                subtle="Total ingredient cost"
              />
              <MetricCard
                label="Cost Per Portion"
                value={fmtMoney(perPortion, currency)}
                subtle="Based on total portions"
              />
              <MetricCard
                label="Selling Price"
                value={selling != null ? fmtMoney(selling, currency) : '—'}
                subtle="Target menu price"
              />
              <MetricCard
                label="Food Cost %"
                value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}
                subtle={
                  targetPct != null ? `Target ${targetPct.toFixed(1)}%` : 'No target set'
                }
              />
            </div>
          </section>

          {recipe.photo_url ? (
            <section className="avoid-break border-b border-stone-200 p-6 md:p-8">
              <SectionTitle
                eyebrow="Visual"
                title="Recipe Photo"
                subtitle="Main presentation image for kitchen, training, or menu reference."
              />

              <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-stone-50">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  className="h-auto max-h-[460px] w-full object-cover"
                />
              </div>
            </section>
          ) : null}

          <section className="avoid-break border-b border-stone-200 p-6 md:p-8">
            <SectionTitle
              eyebrow="Production"
              title="Ingredient Breakdown"
              subtitle="Clean costing and prep view optimized for chefs, costing review, and print."
            />

            <div className="overflow-hidden rounded-[24px] border border-stone-200">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full border-collapse text-sm">
                  <thead className="bg-stone-100 text-stone-700">
                    <tr>
                      <Th className="w-[10%]">Code</Th>
                      <Th className="w-[30%]">Item</Th>
                      <Th className="w-[10%] text-right">Net Qty</Th>
                      <Th className="w-[10%]">Unit</Th>
                      <Th className="w-[10%] text-right">Gross Qty</Th>
                      <Th className="w-[10%]">Unit</Th>
                      <Th className="w-[8%] text-right">Yield</Th>
                      <Th className="w-[12%] text-right">Unit Cost</Th>
                      <Th className="w-[12%] text-right">Line Cost</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((l, index) => {
                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id} className="bg-stone-900 text-white">
                            <td colSpan={9} className="px-4 py-3 text-sm font-bold tracking-wide">
                              {l.group_title || 'Group'}
                            </td>
                          </tr>
                        )
                      }

                      const c = computed.get(l.id)
                      if (!c) return null

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-stone-50/70'

                      return (
                        <tr key={l.id} className={`${zebra} align-top text-stone-700`}>
                          <Td className="font-medium text-stone-500">{c.code || '—'}</Td>
                          <Td className="font-semibold text-stone-900">{c.title}</Td>
                          <Td className="text-right tabular-nums">{fmtQty(c.net)}</Td>
                          <Td>{safeUnit(l.unit)}</Td>
                          <Td className="text-right tabular-nums">{fmtQty(c.gross)}</Td>
                          <Td>{safeUnit(l.unit)}</Td>
                          <Td className="text-right tabular-nums">{c.yieldPct.toFixed(1)}%</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(c.unitCost, currency)}</Td>
                          <Td className="text-right font-bold tabular-nums text-stone-900">
                            {fmtMoney(c.lineCost, currency)}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {(steps.length || methodText) ? (
            <section className="border-b border-stone-200 p-6 md:p-8">
              <SectionTitle
                eyebrow="Execution"
                title="Method"
                subtitle="Step-by-step kitchen instructions designed for readability during production."
              />

              {steps.length ? (
                <div className="grid gap-4">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]

                    return (
                      <div
                        key={`${i}-${s.slice(0, 20)}`}
                        className="avoid-break overflow-hidden rounded-[24px] border border-stone-200 bg-white"
                      >
                        <div className="grid gap-0 md:grid-cols-[88px_1fr]">
                          <div className="flex items-start justify-center border-b border-stone-200 bg-stone-900 px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-black text-stone-900">
                              {i + 1}
                            </div>
                          </div>

                          <div className="p-5 md:p-6">
                            <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-500">
                              Step {i + 1}
                            </div>

                            {img ? (
                              <div className="mb-4 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                                <img
                                  src={img}
                                  alt={`Step ${i + 1}`}
                                  className="max-h-[320px] w-full object-cover"
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
                <div className="avoid-break rounded-[24px] border border-stone-200 bg-stone-50 p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                    {methodText}
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="avoid-break border-b border-stone-200 p-6 md:p-8">
              <SectionTitle
                eyebrow="Nutrition"
                title="Nutrition Snapshot"
                subtitle="Quick macro overview for planning, menu engineering, or nutrition review."
              />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NutritionCard label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCard label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCard label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCard label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="flex flex-col gap-3 p-6 text-xs text-stone-500 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="font-semibold tracking-wide">Generated by GastroChef</div>
            <div>Printed {printedAtHuman}</div>
          </footer>
        </article>
      </div>
    </>
  )
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
        {eyebrow}
      </div>
      <h2 className="text-2xl font-black tracking-tight text-stone-900">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-stone-600">{subtitle}</p> : null}
    </div>
  )
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700 shadow-sm">
      <span className="mr-1 font-bold text-stone-500">{label}:</span>
      <span className="font-semibold text-stone-900">{value}</span>
    </div>
  )
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtle,
}: {
  label: string
  value: string
  subtle?: string
}) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-gradient-to-b from-white to-stone-50 p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-stone-900">{value}</div>
      {subtle ? <div className="mt-2 text-xs text-stone-500">{subtle}</div> : null}
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
    <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-stone-900">
        {value}
        <span className="ml-1 text-sm font-semibold text-stone-500">{unit}</span>
      </div>
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
      className={`border-b border-stone-200 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] ${className}`}
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
  return <td className={`border-b border-stone-200 px-4 py-3 ${className}`}>{children}</td>
}
