// src/pages/Recipes.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'

type RecipeRow = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  is_subrecipe: boolean
  is_archived: boolean
  photo_url: string | null
  description: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price?: number | null
  currency?: string | null
  created_at?: string | null
  yield_qty?: number | null
  yield_unit?: string | null
  target_food_cost_pct?: number | null
}

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

export default function Recipes() {
  const nav = useNavigate()
  const { isKitchen } = useMode()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return recipes
    return recipes.filter((r) => {
      const a = (r.name || '').toLowerCase()
      const b = (r.category || '').toLowerCase()
      return a.includes(s) || b.includes(s)
    })
  }, [recipes, q])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const select =
        'id,kitchen_id,name,category,portions,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,selling_price,currency,created_at,yield_qty,yield_unit,target_food_cost_pct'

      const { data, error } = await supabase
        .from('recipes')
        .select(select)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw error
      setRecipes((data || []) as RecipeRow[])
    } catch (e: any) {
      setErr(e?.message || 'Failed to load recipes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createNewRecipe() {
    setErr(null)
    try {
      const payload: Partial<RecipeRow> = {
        name: 'New Recipe',
        category: null,
        portions: 1,
        is_subrecipe: false,
        is_archived: false,
        description: '',
        photo_url: null,
      }

      const { data, error } = await supabase
        .from('recipes')
        .insert(payload as any)
        .select('id')
        .single()

      if (error) throw error
      const id = (data as any)?.id as string
      setToast('Created. Opening editor…')
      nav(`/recipe?id=${encodeURIComponent(id)}`)
    } catch (e: any) {
      setErr(e?.message || 'Failed to create recipe')
    }
  }

  async function toggleArchive(r: RecipeRow) {
    try {
      const next = !r.is_archived
      const { error } = await supabase.from('recipes').update({ is_archived: next }).eq('id', r.id)
      if (error) throw error
      setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_archived: next } : x)))
      setToast(next ? 'Archived.' : 'Restored.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to update recipe')
    }
  }

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className="gc-card p-5">
        <div className="gc-label">RECIPES</div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">Recipe Library</div>
            <div className="mt-1 text-sm text-neutral-600">
              Premium grid with stable images + ULTRA cards.
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              className="gc-input sm:w-[340px]"
              placeholder="Search by name or category..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <button className="gc-btn" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>

            <button className="gc-btn gc-btn-primary" type="button" onClick={createNewRecipe}>
              + New
            </button>
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="gc-menu-card">
              <div className="gc-menu-hero" />
              <div className="p-4">
                <div className="h-4 w-2/3 rounded bg-neutral-200" />
                <div className="mt-3 h-3 w-full rounded bg-neutral-100" />
                <div className="mt-2 h-3 w-5/6 rounded bg-neutral-100" />
                <div className="mt-4 h-9 w-full rounded bg-neutral-100" />
              </div>
            </div>
          ))}

        {!loading &&
          filtered.map((r) => {
            const title = r.name || 'Untitled'
            const cat = (r.category || 'Uncategorized').toUpperCase()
            const portions = Math.max(1, toNum(r.portions, 1))
            const cur = (r.currency || 'USD').toUpperCase()

            // Note: we intentionally do NOT recompute cost logic here (no logic change).
            // Keep placeholders unless you already store computed values somewhere.
            const costPerPortion = null
            const fcPct = null

            return (
              <div key={r.id} className="gc-menu-card">
                <div className="gc-menu-hero">
                  {r.photo_url ? (
                    <img src={r.photo_url} alt={title} loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                      No Photo
                    </div>
                  )}

                  <div className="gc-menu-overlay" />

                  <div className="gc-menu-badges">
                    <span className="gc-chip">{cat}</span>

                    <span className="gc-chip">
                      Portions: {portions}
                    </span>

                    {r.is_archived && <span className="gc-chip warn">Archived</span>}

                    {r.selling_price != null && (
                      <span className="gc-chip cost">
                        Price: {money(toNum(r.selling_price, 0), cur)}
                      </span>
                    )}

                    {isKitchen && <span className="gc-chip">Kitchen</span>}
                  </div>
                </div>

                <div className="gc-menu-body">
                  <div className="gc-menu-kicker">Recipe</div>
                  <div className="gc-menu-title">{title}</div>

                  <div className="gc-menu-desc">
                    {r.description?.trim() ? r.description : 'Add a short menu description…'}
                  </div>

                  <div className="gc-menu-metrics">
                    <div>
                      <span className="text-neutral-600">Cost/portion:</span>{' '}
                      <b>{costPerPortion == null ? '—' : money(costPerPortion, cur)}</b>
                    </div>
                    <div>
                      <span className="text-neutral-600">FC%:</span> <b>{fcPct == null ? '—' : `${fcPct.toFixed(1)}%`}</b>
                    </div>
                  </div>

                  <div className="gc-menu-actions">
                    <button
                      type="button"
                      className="gc-action primary"
                      onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}
                    >
                      Open Editor
                    </button>

                    <button
                      type="button"
                      className="gc-action"
                      onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}&view=cook`)}
                      title="Cook view (uses same editor route)"
                    >
                      Cook
                    </button>

                    <button type="button" className="gc-action" onClick={() => toggleArchive(r)}>
                      {r.is_archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="gc-card p-8 text-center">
          <div className="text-xl font-extrabold">No recipes found</div>
          <div className="mt-2 text-sm text-neutral-600">Try another search, or create a new recipe.</div>
        </div>
      )}
    </div>
  )
}
