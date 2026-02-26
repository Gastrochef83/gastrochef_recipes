// src/pages/RecipePrintCard.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Wordmark from '../components/Wordmark'

type Recipe = {
  id: string
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
  name: string | null
  pack_unit: string | null
  net_unit_cost: number | null
}

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
function fmtMacro(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
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
  const [subRecipes, setSubRecipes] = useState<{ id: string; name: string | null }[]>([])

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
            'id,kitchen_id,name,category,portions,description,method,method_steps,method_step_photos,created_at,yield_qty,yield_unit,currency,photo_url,calories,protein_g,carbs_g,fat_g,selling_price,target_food_cost_pct'
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

        const ingredientIds = Array.from(new Set((l || [])
          .filter((x: any) => x?.line_type === 'ingredient' && x?.ingredient_id)
          .map((x: any) => x.ingredient_id)))

        const { data: ing, error: iErr } = ingredientIds.length
          ? await supabase.from('ingredients').select('id,name,pack_unit,net_unit_cost').in('id', ingredientIds)
          : { data: [], error: null }

        if (iErr) throw iErr

        const { data: sr, error: sErr } = await supabase
          .from('recipes')
          .select('id,name,kitchen_id')
          .eq('kitchen_id', (r as any).kitchen_id)
          .eq('is_subrecipe', true)
        if (sErr) throw sErr

        if (!mounted.current) return
        setRecipe(r as any)
        setLines((l || []) as any)
        setIngredients((ing || []) as any)
        setSubRecipes((sr || []) as any)
      } catch (e: any) {
        if (!mounted.current) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    })()
  }, [id])

  const currency = recipe?.currency || 'USD'

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const subById = useMemo(() => {
    const m = new Map<string, { id: string; name: string | null }>()
    for (const r of subRecipes) m.set(r.id, r)
    return m
  }, [subRecipes])

  const computed = useMemo(() => {
    const map = new Map<
      string,
      { title: string; net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; kind: string }
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
      map.set(l.id, { title, net, gross, yieldPct: y, unitCost, lineCost, kind })
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

  // --- Print KPIs (safe defaults) ---
  const portions = clamp(toNum(recipe?.portions, 1), 1, 1_000_000)
  const perPortion = portions > 0 ? totalCost / portions : totalCost
  const selling = recipe?.selling_price ?? null
  const targetPct = recipe?.target_food_cost_pct ?? null
  const foodCostPct =
    selling != null && selling > 0 ? (perPortion / selling) * 100 : null


  // Auto print once loaded (only when autoprint=1)
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

  if (loading) return <div className="gc-print-loading">Loading…</div>
  if (err || !recipe) return <div className="gc-print-loading">{err || 'Missing recipe.'}</div>

  const steps: string[] = (() => {
    const arr = Array.isArray((recipe as any)?.method_steps) ? ((recipe as any).method_steps as any[]) : null
    if (arr && arr.length) return arr.map((s) => String(s ?? '').trim()).filter(Boolean)
    return String((recipe as any)?.method || (recipe as any)?.method_legacy || '')
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  })()

  const yieldLabel = (() => {
    const qRaw = (recipe as any)?.yield_qty
    const uRaw = (recipe as any)?.yield_unit
    const q = Number(qRaw)
    const u = String(uRaw ?? '').trim()
    if (Number.isFinite(q) && qRaw != null) {
      const v = fmtQty(q)
      return u ? `${v} ${u}` : `${v}`
    }
    const pRaw = (recipe as any)?.yield_percent ?? (recipe as any)?.yield_pct
    const p = Number(pRaw)
    if (Number.isFinite(p) && pRaw != null) return `${Math.round(p * 1000) / 1000}%`
    return '—'
  })()




  const showNutrition =
    recipe.calories != null || recipe.protein_g != null || recipe.carbs_g != null || recipe.fat_g != null

  const stepPhotos = (recipe.method_step_photos || []).filter(Boolean)
  const hasPhotos = Boolean(recipe.photo_url) || stepPhotos.length > 0

  return (
    <div className="gc-print-root">
      <div className="gc-a4">
        <div className="gc-a4-card">
          <header className="gc-a4-head">
            <div className="gc-a4-brand">
              <img className="gc-a4-logo" src="/gastrochef-logo.png" alt="GastroChef" />
              <div className="gc-a4-brand-text">
                <div className="gc-a4-brand-name">
                  Gastro<span className="gc-a4-brand-accent">Chef</span>
                </div>
                <div className="gc-a4-brand-sub">Recipe Card</div>
              </div>
            </div>

            <div className="gc-a4-meta">
              <div className="gc-a4-meta-row">
                <span className="gc-a4-k">Date</span>
                <span className="gc-a4-v">{recipe.created_at ? String(recipe.created_at).slice(0, 10) : '—'}</span>
              </div>
              <div className="gc-a4-meta-row">
                <span className="gc-a4-k">Category</span>
                <span className="gc-a4-v">{recipe.category || '—'}</span>
              </div>
              <div className="gc-a4-meta-row">
                <span className="gc-a4-k">Portions</span>
                <span className="gc-a4-v">{recipe.portions || 1}</span>
              </div>
              <div className="gc-a4-meta-row">
                <span className="gc-a4-k">Yield</span>
                <span className="gc-a4-v">{yieldLabel}</span>
              </div>
            </div>
          </header>

          <div className="gc-a4-title">{recipe.name || 'Untitled Recipe'}</div>

          {recipe.description ? <div className="gc-a4-descblock">{recipe.description}</div> : null}

          <section className="gc-a4-kpis">
            <div className="gc-a4-kpi">
              <div className="gc-a4-kpi-k">Total Cost</div>
              <div className="gc-a4-kpi-v">{fmtMoney(totalCost, currency)}</div>
            </div>
            <div className="gc-a4-kpi">
              <div className="gc-a4-kpi-k">Cost / Portion</div>
              <div className="gc-a4-kpi-v">{fmtMoney(perPortion, currency)}</div>
            </div>
            <div className="gc-a4-kpi">
              <div className="gc-a4-kpi-k">Selling</div>
              <div className="gc-a4-kpi-v">{selling != null ? fmtMoney(selling, currency) : '—'}</div>
              <div className="gc-a4-kpi-sub">
                Food cost: {foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : '—'}
                {targetPct != null ? ` (target ${targetPct.toFixed(1)}%)` : ''}
              </div>
            </div>
          </section>

          {showNutrition ? (
            <section className="gc-a4-section">
              <div className="gc-a4-section-title">Nutrition</div>
              <div className="gc-a4-nutri">
                <div className="gc-a4-nutri-item">
                  <div className="gc-a4-nutri-k">Calories</div>
                  <div className="gc-a4-nutri-v">{fmtMacro(recipe.calories)}</div>
                </div>
                <div className="gc-a4-nutri-item">
                  <div className="gc-a4-nutri-k">Protein (g)</div>
                  <div className="gc-a4-nutri-v">{fmtMacro(recipe.protein_g)}</div>
                </div>
                <div className="gc-a4-nutri-item">
                  <div className="gc-a4-nutri-k">Carbs (g)</div>
                  <div className="gc-a4-nutri-v">{fmtMacro(recipe.carbs_g)}</div>
                </div>
                <div className="gc-a4-nutri-item">
                  <div className="gc-a4-nutri-k">Fat (g)</div>
                  <div className="gc-a4-nutri-v">{fmtMacro(recipe.fat_g)}</div>
                </div>
              </div>
            </section>
          ) : null}

          {hasPhotos ? (
            <section className="gc-a4-section">
              <div className="gc-a4-section-title">Photos</div>
              <div className="gc-a4-photos">
                {recipe.photo_url ? (
                  <div className="gc-a4-photo">
                    <img src={recipe.photo_url} alt="Recipe" />
                    <div className="gc-a4-photo-cap">Recipe photo</div>
                  </div>
                ) : null}
                {stepPhotos.map((u, i) => (
                  <div className="gc-a4-photo" key={u || i}>
                    <img src={u} alt={`Step ${i + 1}`} />
                    <div className="gc-a4-photo-cap">Step {i + 1}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="gc-a4-section">
            <div className="gc-a4-section-title">Ingredients</div>

            <table className="gc-a4-table">
              <thead>
                <tr>
                  <th style={{ width: '44%' }}>Item</th>
                  <th style={{ width: '14%' }}>Net</th>
                  <th style={{ width: '14%' }}>Gross</th>
                  <th style={{ width: '10%' }}>Yield</th>
                  <th style={{ width: '9%' }}>Unit</th>
                  <th style={{ width: '9%' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  if (l.line_type === 'group') {
                    return (
                      <tr key={l.id} className="gc-a4-group">
                        <td colSpan={6}>{l.group_title || 'Group'}</td>
                      </tr>
                    )
                  }
                  const c = computed.get(l.id)
                  if (!c) return null
                  const pct = totalCost > 0 ? (c.lineCost / totalCost) * 100 : 0

                  return (
                    <tr key={l.id}>
                      <td className="gc-a4-item">
                        <div className="gc-a4-item-title">{c.title}</div>
                        <div className="gc-a4-item-sub">
                          {c.kind} • {pct.toFixed(1)}% of cost
                        </div>
                      </td>
                      <td className="gc-a4-num">
                        {fmtQty(c.net)} {safeUnit(l.unit)}
                      </td>
                      <td className="gc-a4-num">
                        {fmtQty(c.gross)} {safeUnit(l.unit)}
                      </td>
                      <td className="gc-a4-num">{c.yieldPct.toFixed(1)}%</td>
                      <td className="gc-a4-num">{fmtMoney(c.unitCost, currency)}</td>
                      <td className="gc-a4-num">{fmtMoney(c.lineCost, currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {(steps.length || methodLegacy) ? (
            <section className="gc-a4-section">
              <div className="gc-a4-section-title">Method</div>
              {steps.length ? (
                <ol className="gc-a4-steps">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : (
                <div className="gc-a4-text">{methodLegacy}</div>
              )}
            </section>
          ) : null}

          <footer className="gc-a4-foot">
            <span>Kitchen: {recipe.kitchen_id}</span>
            <span>Generated by GastroChef</span>
          </footer>
        </div>
      </div>
    </div>
  )
}