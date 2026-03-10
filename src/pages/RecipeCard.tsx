import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  name: string | null
  code: string | null
  category: string | null
  portions: number | null
  description: string | null
  method: string | null
  method_legacy: string | null
  method_steps: string[] | null
  method_step_photos: string[] | null
  created_at: string | null
  yield_qty: number | null
  yield_unit: string | null
  yield_percent: number | null
  yield_pct: number | null
  currency: string | null
  photo_url: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price: number | null
  target_food_cost_pct: number | null
}

function fmtQty(n: number) {
  if (!Number.isFinite(n)) return ''
  if (Math.round(n) === n) return String(n)
  return n.toFixed(2)
}

function fmtMoney(n: number | null | undefined, currency: string | null | undefined) {
  const value = Number(n ?? 0)
  const cur = String(currency || 'USD').toUpperCase()

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${cur}`
  }
}

function fmtMacro(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toFixed(1)
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
}

export default function RecipePrintCard() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const autoPrint = params.get('autoprint') === '1'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('Missing recipe id.')
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('recipes')
          .select(
            'id,name,code,category,portions,description,method,method_legacy,method_steps,method_step_photos,created_at,yield_qty,yield_unit,yield_percent,yield_pct,currency,photo_url,calories,protein_g,carbs_g,fat_g,selling_price,target_food_cost_pct'
          )
          .eq('id', id)
          .single()

        if (error) throw error
        setRecipe(data as Recipe)
      } catch (e: any) {
        setError(e?.message || 'Failed to load recipe.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const methodLegacy = useMemo(() => {
    return String(recipe?.method_legacy ?? recipe?.method ?? '').trim()
  }, [recipe])

  const steps = useMemo(() => {
    const arr = Array.isArray(recipe?.method_steps) ? recipe?.method_steps : null

    if (arr && arr.length) {
      return arr.map((s) => String(s ?? '').trim()).filter(Boolean)
    }

    return methodLegacy
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }, [recipe, methodLegacy])

  const stepPhotos = useMemo(() => {
    return Array.isArray(recipe?.method_step_photos)
      ? recipe.method_step_photos.filter(Boolean)
      : []
  }, [recipe])

  const yieldLabel = useMemo(() => {
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
  }, [recipe])

  useEffect(() => {
    if (!autoPrint) return
    if (loading || error || !recipe) return

    const t = setTimeout(() => {
      try {
        window.print()
      } catch {}
    }, 500)

    return () => clearTimeout(t)
  }, [autoPrint, loading, error, recipe])

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>
  if (error || !recipe) return <div style={{ padding: 24 }}>{error || 'Recipe not found.'}</div>

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
        color: '#111',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: '#666' }}>GastroChef</div>
          <h1 style={{ margin: '6px 0' }}>{recipe.name || 'Untitled Recipe'}</h1>
          <div style={{ fontSize: 14, color: '#444' }}>Code: {recipe.code || '—'}</div>
        </div>

        <button
          onClick={() => window.print()}
          style={{
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            cursor: 'pointer',
            background: '#111827',
            color: '#fff',
            height: 'fit-content',
          }}
        >
          Print
        </button>
      </div>

      {recipe.photo_url ? (
        <div style={{ marginBottom: 24 }}>
          <img
            src={recipe.photo_url}
            alt={recipe.name || 'Recipe'}
            style={{ maxWidth: 320, width: '100%', borderRadius: 12 }}
          />
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        <Info label="Category" value={recipe.category || '—'} />
        <Info label="Portions" value={String(recipe.portions || '—')} />
        <Info label="Yield" value={yieldLabel} />
      </div>

      {recipe.description ? (
        <section style={{ marginBottom: 24 }}>
          <h2>Description</h2>
          <p>{recipe.description}</p>
        </section>
      ) : null}

      {(recipe.calories != null ||
        recipe.protein_g != null ||
        recipe.carbs_g != null ||
        recipe.fat_g != null) ? (
        <section style={{ marginBottom: 24 }}>
          <h2>Nutrition</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <Info label="Calories" value={fmtMacro(recipe.calories)} />
            <Info label="Protein (g)" value={fmtMacro(recipe.protein_g)} />
            <Info label="Carbs (g)" value={fmtMacro(recipe.carbs_g)} />
            <Info label="Fat (g)" value={fmtMacro(recipe.fat_g)} />
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <h2>Pricing</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Info label="Selling Price" value={fmtMoney(recipe.selling_price, recipe.currency)} />
          <Info
            label="Target Food Cost %"
            value={
              recipe.target_food_cost_pct != null
                ? `${Number(recipe.target_food_cost_pct).toFixed(1)}%`
                : '—'
            }
          />
        </div>
      </section>

      {(steps.length || methodLegacy) ? (
        <section style={{ marginBottom: 24 }}>
          <h2>Method</h2>

          {steps.length ? (
            <div>
              {steps.map((s, i) => {
                const img = stepPhotos[i]

                return (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      Step {i + 1}
                    </div>

                    {img ? (
                      <img
                        src={img}
                        alt={`Step ${i + 1}`}
                        style={{
                          width: '100%',
                          maxWidth: 360,
                          borderRadius: 10,
                          marginBottom: 10,
                        }}
                      />
                    ) : null}

                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{s}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{methodLegacy}</p>
          )}
        </section>
      ) : null}
    </div>
  )
}
