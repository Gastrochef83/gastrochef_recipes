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
        <div className="mx-auto max-w-5xl rounded-[28px] border border-stone-200 bg-white p-10 shadow-sm">
          Loading recipe card…
        </div>
      </div>
    )
  }

  if (err || !recipe) {
    return (
      <div className="min-h-screen bg-[#f7f6f2] p-6 text-stone-700">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-red-200 bg-white p-10 shadow-sm">
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
          background: #f7f6f2;
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

      <div className="print-stage min-h-screen bg-[#f7f6f2] p-4 md:p-8">
        <div className="no-print mx-auto mb-4 flex max-w-5xl justify-end">
          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Print Now
          </button>
        </div>

        <article className="print-paper mx-auto max-w-5xl overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
          <div className="h-1.5 bg-[#667a5a]" />

          <header className="border-b border-stone-200 px-8 py-8">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">
                  GastroChef Recipe Card
                </div>

                <h1 className="text-4xl font-semibold tracking-[-0.03em] text-stone-900 md:text-5xl">
                  {recipe.name || 'Untitled Recipe'}
                </h1>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Tag>{recipe.code || '—'}</Tag>
                  <Tag>{recipe.category || 'Uncategorized'}</Tag>
                  <Tag>{yieldLabel}</Tag>
                  <Tag>{portions} portions</Tag>
                </div>

                {recipe.description ? (
                  <p className="mt-6 max-w-3xl text-[15px] leading-7 text-stone-600">
                    {recipe.description}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3">
                <InfoRow label="Kitchen Ref" value={shortId(recipe.kitchen_id)} />
                <InfoRow label="Created" value={formatDateOnly(recipe.created_at)} />
                <InfoRow label="Printed" value={printedAtHuman} />
                <InfoRow label="Code Category" value={recipe.code_category || '—'} />
              </div>
            </div>
          </header>

          <section className="border-b border-stone-200 px-8 py-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Cost"
                value={fmtMoney(totalCost, currency)}
                note="Total recipe costing"
              />
              <StatCard
                label="Per Portion"
                value={fmtMoney(perPortion, currency)}
                note="Based on portions"
              />
              <StatCard
                label="Selling Price"
                value={selling != null ? fmtMoney(selling, currency) : '—'}
                note="Menu price"
              />
              <StatCard
                label="Food Cost"
                value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}
                note={targetPct != null ? `Target ${targetPct.toFixed(1)}%` : 'No target'}
              />
            </div>
          </section>

          {recipe.photo_url ? (
            <section className="avoid-break border-b border-stone-200 px-8 py-8">
              <SectionHead
                overline="Presentation"
                title="Recipe Image"
                subtitle="Clean visual reference for production and presentation."
              />

              <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-stone-50">
                <img
                  src={recipe.photo_url}
                  alt={recipe.name || 'Recipe'}
                  className="max-h-[420px] w-full object-cover"
                />
              </div>
            </section>
          ) : null}

          <section className="border-b border-stone-200 px-8 py-8">
            <SectionHead
              overline="Costing"
              title="Ingredient Breakdown"
              subtitle="Clear, elegant costing structure optimized for print."
            />

            <div className="overflow-hidden rounded-[24px] border border-stone-200">
              <div className="overflow-x-auto">
                <table className="recipe-table min-w-full border-collapse text-sm">
                  <thead className="bg-stone-50 text-stone-700">
                    <tr>
                      <Th className="w-[10%]">Code</Th>
                      <Th className="w-[30%]">Item</Th>
                      <Th className="w-[10%] text-right">Net Qty</Th>
                      <Th className="w-[8%]">Unit</Th>
                      <Th className="w-[10%] text-right">Gross Qty</Th>
                      <Th className="w-[8%]">Unit</Th>
                      <Th className="w-[8%] text-right">Yield</Th>
                      <Th className="w-[12%] text-right">Unit Cost</Th>
                      <Th className="w-[14%] text-right">Line Cost</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((l, index) => {
                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id} className="bg-[#667a5a] text-white">
                            <td colSpan={9} className="px-4 py-3 text-sm font-medium tracking-wide">
                              {l.group_title || 'Group'}
                            </td>
                          </tr>
                        )
                      }

                      const c = computed.get(l.id)
                      if (!c) return null

                      const zebra = index % 2 === 0 ? 'bg-white' : 'bg-stone-50/60'

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
                          <Td className="text-right font-semibold tabular-nums text-stone-900">
                            {fmtMoney(c.lineCost, currency)}
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-stone-50">
                      <td
                        colSpan={7}
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
            <section className="border-b border-stone-200 px-8 py-8">
              <SectionHead
                overline="Method"
                title="Preparation Steps"
                subtitle="Structured for calm readability during kitchen execution."
              />

              {steps.length ? (
                <div className="grid gap-4">
                  {steps.map((s, i) => {
                    const img = stepPhotos?.[i]

                    return (
                      <div
                        key={`${i}-${s.slice(0, 24)}`}
                        className="avoid-break overflow-hidden rounded-[22px] border border-stone-200 bg-white"
                      >
                        <div className="grid md:grid-cols-[72px_1fr]">
                          <div className="flex items-start justify-center border-b border-stone-200 bg-stone-50 px-4 py-5 md:border-b-0 md:border-r">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-semibold text-stone-900">
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
                <div className="avoid-break rounded-[22px] border border-stone-200 bg-stone-50 p-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-stone-700">
                    {methodText}
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {showNutrition ? (
            <section className="avoid-break border-b border-stone-200 px-8 py-8">
              <SectionHead
                overline="Nutrition"
                title="Nutrition Overview"
                subtitle="Simple macro summary in a refined format."
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NutritionCard label="Calories" value={fmtMacro(recipe.calories)} unit="kcal" />
                <NutritionCard label="Protein" value={fmtMacro(recipe.protein_g)} unit="g" />
                <NutritionCard label="Carbs" value={fmtMacro(recipe.carbs_g)} unit="g" />
                <NutritionCard label="Fat" value={fmtMacro(recipe.fat_g)} unit="g" />
              </div>
            </section>
          ) : null}

          <footer className="flex flex-col gap-2 px-8 py-5 text-xs text-stone-500 md:flex-row md:items-center md:justify-between">
            <div className="font-medium">Generated by GastroChef</div>
            <div>
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
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
        {overline}
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-stone-900">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm leading-6 text-stone-600">{subtitle}</p> : null}
    </div>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700">
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {label}
      </div>
      <div className="text-sm font-medium text-stone-900">{value}</div>
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-[22px] border border-stone-200 bg-white p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-stone-900">
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
    <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-5">
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

function Th({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <th
      className={`border-b border-stone-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}
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
