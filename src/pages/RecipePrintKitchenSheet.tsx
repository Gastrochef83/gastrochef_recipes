// src/pages/RecipePrintKitchenSheet.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  kitchen_id: string
  name: string | null
  category: string | null
  portions: number | null
  yield_qty: number | null
  yield_unit: string | null
  currency: string | null
}

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number | null
  qty: number | null // Net qty
  unit: string | null
  yield_percent: number | null
  gross_qty_override: number | null
  notes: string | null
  line_type: string | null
  group_title: string | null
}

type Ingredient = {
  id: string
  name: string | null
  pack_unit: string | null
  net_unit_cost: number | null
}

function num(n: any) {
  const x = typeof n === 'number' ? n : n == null ? NaN : Number(n)
  return Number.isFinite(x) ? x : 0
}

function fmtQty(n: any) {
  const x = num(n)
  if (!Number.isFinite(x)) return ''
  // Keep it simple and readable for kitchens
  const abs = Math.abs(x)
  if (abs >= 100) return String(Math.round(x))
  if (abs >= 10) return (Math.round(x * 10) / 10).toString()
  return (Math.round(x * 100) / 100).toString()
}

function calcGross(netQty: number, yieldPct: number, override?: number | null) {
  if (override != null && Number.isFinite(override)) return override
  if (yieldPct > 0) return netQty / (yieldPct / 100)
  return netQty
}

export default function RecipePrintKitchenSheet() {
  const [sp] = useSearchParams()
  const id = sp.get('id') || ''
  const autoprint = sp.get('autoprint') === '1'

  const mounted = useRef(true)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  useEffect(() => {
    mounted.current = true
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
          .select('id,kitchen_id,name,category,portions,yield_qty,yield_unit,currency')
          .eq('id', id)
          .single()
        if (rErr) throw rErr

        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select(
            'id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,gross_qty_override,notes,line_type,group_title'
          )
          .eq('recipe_id', id)
          .order('position', { ascending: true })
        if (lErr) throw lErr

        const { data: ing, error: iErr } = await supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost')
          .eq('kitchen_id', (r as any).kitchen_id)
        if (iErr) throw iErr

        if (!mounted.current) return
        setRecipe(r as any)
        setLines((l || []) as any)
        setIngredients((ing || []) as any)
      } catch (e: any) {
        if (!mounted.current) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    })()

    return () => {
      mounted.current = false
    }
  }, [id])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  // Auto print once content is ready
  useEffect(() => {
    if (!autoprint) return
    if (loading) return
    if (err) return

    const t = window.setTimeout(() => {
      try {
        window.print()
      } catch {
        // ignore
      }
    }, 350)

    return () => window.clearTimeout(t)
  }, [autoprint, loading, err])

  const title = recipe?.name || 'Kitchen Spec Sheet'

  return (
    <div className="gc-kprint-wrap">
      <div className="gc-kprint-page">
        <div className="gc-kprint-head">
          <div>
            <div className="gc-kprint-title">{title}</div>
            <div className="gc-kprint-sub">
              {recipe?.category ? <span>{recipe.category}</span> : <span>—</span>}
              <span className="gc-dot">•</span>
              <span>Portions: {recipe?.portions ?? 1}</span>
              <span className="gc-dot">•</span>
              <span>
                Yield: {recipe?.yield_qty != null ? fmtQty(recipe.yield_qty) : '—'} {recipe?.yield_unit || ''}
              </span>
            </div>
          </div>

          <div className="gc-no-print" style={{ display: 'flex', gap: 8 }}>
            <button className="gc-btn" onClick={() => window.print()}>
              Print
            </button>
            <button className="gc-btn ghost" onClick={() => window.history.back()}>
              Back
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 16, color: '#64748b' }}>Loading…</div>
        ) : err ? (
          <div style={{ padding: 16, color: '#b91c1c' }}>{err}</div>
        ) : (
          <>
            <table className="gc-kprint-table">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Ingredient</th>
                  <th style={{ width: '10%' }}>Net</th>
                  <th style={{ width: '10%' }}>Unit</th>
                  <th style={{ width: '10%' }}>Gross</th>
                  <th style={{ width: '10%' }}>Yield%</th>
                  <th style={{ width: '22%' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => {
                  const isGroup = ln.line_type === 'group'
                  if (isGroup) {
                    return (
                      <tr key={ln.id} className="gc-kprint-group">
                        <td colSpan={6}>{ln.group_title || 'Group'}</td>
                      </tr>
                    )
                  }

                  const ing = ln.ingredient_id ? ingById.get(ln.ingredient_id) : null
                  const net = num(ln.qty)
                  const y = num(ln.yield_percent)
                  const gross = calcGross(net, y, ln.gross_qty_override)
                  return (
                    <tr key={ln.id}>
                      <td>
                        <div className="gc-kprint-ing">{ing?.name || '—'}</div>
                      </td>
                      <td>{net ? fmtQty(net) : ''}</td>
                      <td>{ln.unit || ''}</td>
                      <td>{gross ? fmtQty(gross) : ''}</td>
                      <td>{y ? fmtQty(y) : ''}</td>
                      <td className="gc-kprint-note">{ln.notes || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="gc-kprint-foot">
              <div className="gc-kprint-footnote">Kitchen Spec Sheet — generated by GastroChef</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
