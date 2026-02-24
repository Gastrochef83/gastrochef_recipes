// src/pages/RecipePrintCard.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  description: string | null
  method: string | null
  method_steps: string[] | null
  created_at: string | null
  yield_qty: number | null
  yield_unit: string | null
  currency: string | null
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
          .select('id,kitchen_id,name,category,portions,description,method,method_steps,created_at,yield_qty,yield_unit,currency')
          .eq('id', id)
          .single()
        if (rErr) throw rErr

        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select('id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,gross_qty_override,line_type,group_title')
          .eq('recipe_id', id)
          .order('position', { ascending: true })
        if (lErr) throw lErr

        const { data: ing, error: iErr } = await supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost')
          .eq('kitchen_id', (r as any).kitchen_id)
        if (iErr) throw iErr

        const { data: sr, error: sErr } = await supabase
          .from('recipes')
          .select('id,name')
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
      { title: string; net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number }
    >()

    for (const l of lines) {
      if (l.line_type === 'group') continue
      const net = Math.max(0, toNum(l.qty, 0))
      const y = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const grossAuto = y > 0 ? net / (y / 100) : net
      const gross = l.gross_qty_override != null && l.gross_qty_override >= 0 ? l.gross_qty_override : grossAuto

      let unitCost = 0
      let title = 'Line'
      if (l.line_type === 'ingredient' && l.ingredient_id) {
        const ing = ingById.get(l.ingredient_id)
        title = ing?.name || 'Ingredient'
        unitCost = toNum(ing?.net_unit_cost, 0)
      }
      if (l.line_type === 'subrecipe' && l.sub_recipe_id) {
        const sr = subById.get(l.sub_recipe_id)
        title = sr?.name || 'Subrecipe'
        unitCost = 0
      }

      const lineCost = net * unitCost
      map.set(l.id, { title, net, gross, yieldPct: y, unitCost, lineCost })
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

  // Auto print once loaded (only when autoprint=1)
  useEffect(() => {
    if (!autoPrint) return
    if (loading || err || !recipe) return

    let cancelled = false
    const fire = () => {
      if (cancelled) return
      // Give React time to paint + images a moment to resolve
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
    }

    fire()
    return () => {
      cancelled = true
    }
  }, [autoPrint, loading, err, recipe])

  if (loading) {
    return <div className="gc-print-loading">Loading…</div>
  }

  if (err || !recipe) {
    return <div className="gc-print-loading">{err || 'Missing recipe.'}</div>
  }

  const steps = (recipe.method_steps || []).filter(Boolean)
  const methodLegacy = (recipe.method || '').trim()

  return (
    <div className="gc-a4">
      <div className="gc-a4-card">
        <header className="gc-a4-head">
          <div className="gc-a4-brand">GastroChef</div>
          <div className="gc-a4-meta">
            <div className="gc-a4-meta-row">
              <span className="gc-a4-k">Date</span>
              <span className="gc-a4-v">{recipe.created_at ? String(recipe.created_at).slice(0, 10) : '—'}</span>
            </div>
            <div className="gc-a4-meta-row">
              <span className="gc-a4-k">Portions</span>
              <span className="gc-a4-v">{recipe.portions || 1}</span>
            </div>
            <div className="gc-a4-meta-row">
              <span className="gc-a4-k">Total Cost</span>
              <span className="gc-a4-v">{fmtMoney(totalCost, currency)}</span>
            </div>
          </div>
        </header>

        <div className="gc-a4-title">{recipe.name || 'Untitled Recipe'}</div>
        {(recipe.category || recipe.description) && (
          <div className="gc-a4-sub">
            {recipe.category ? <span className="gc-a4-pill">{recipe.category}</span> : null}
            {recipe.description ? <span className="gc-a4-desc">{recipe.description}</span> : null}
          </div>
        )}

        <section className="gc-a4-section">
          <div className="gc-a4-section-title">Ingredients</div>

          <table className="gc-a4-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Item</th>
                <th style={{ width: '15%' }}>Net</th>
                <th style={{ width: '15%' }}>Gross</th>
                <th style={{ width: '10%' }}>Yield</th>
                <th style={{ width: '20%' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                if (l.line_type === 'group') {
                  return (
                    <tr key={l.id} className="gc-a4-group">
                      <td colSpan={5}>{l.group_title || 'Group'}</td>
                    </tr>
                  )
                }
                const c = computed.get(l.id)
                if (!c) return null
                const pct = totalCost > 0 ? (c.lineCost / totalCost) * 100 : 0

                return (
                  <tr key={l.id}>
                    <td className="gc-a4-item">{c.title}</td>
                    <td>{fmtQty(c.net)} {safeUnit(l.unit)}</td>
                    <td>{fmtQty(c.gross)} {safeUnit(l.unit)}</td>
                    <td>{c.yieldPct.toFixed(1)}%</td>
                    <td>
                      {fmtMoney(c.lineCost, currency)}
                      <span className="gc-a4-muted"> ({pct.toFixed(1)}%)</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {(steps.length || methodLegacy) && (
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
        )}

        <footer className="gc-a4-foot">
          <span>Kitchen: {recipe.kitchen_id}</span>
          <span>Generated by GastroChef</span>
        </footer>
      </div>
    </div>
  )
}
