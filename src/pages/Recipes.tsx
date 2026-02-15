import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

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
  created_at?: string | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function clampStr(s: string, max = 120) {
  const x = (s ?? '').trim()
  if (!x) return ''
  if (x.length <= max) return x
  return x.slice(0, max - 1) + '…'
}

function upperChip(x: string) {
  return (x || '').trim().toUpperCase()
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RecipeRow[]>([])
  const [q, setQ] = useState('')

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select(
          'id,kitchen_id,name,category,portions,is_subrecipe,is_archived,photo_url,description,calories,protein_g,carbs_g,fat_g,created_at'
        )
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRows((data ?? []) as RecipeRow[])
    } catch (e: any) {
      showToast(e?.message ?? 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => {
      const a = (r.name ?? '').toLowerCase()
      const b = (r.category ?? '').toLowerCase()
      return a.includes(s) || b.includes(s)
    })
  }, [rows, q])

  const createNew = async () => {
    try {
      const kitchenId = rows[0]?.kitchen_id ?? 'default'

      const payload = {
        kitchen_id: kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 1,
        is_subrecipe: false,
        is_archived: false,
      }

      const { data, error } = await supabase.from('recipes').insert(payload).select('id').single()
      if (error) throw error

      const newId = (data as any)?.id
      showToast('Created ✅')

      if (newId) window.location.hash = `#/recipe?id=${newId}`
      else await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Create failed')
    }
  }

  const archive = async (id: string) => {
    try {
      const { error } = await supabase.from('recipes').update({ is_archived: true }).eq('id', id)
      if (error) throw error
      showToast('Archived ✅')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Archive failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-2xl font-extrabold">Recipe Library</div>
            <div className="mt-1 text-sm text-neutral-600">Premium Paprika-style cards (fixed aspect + aligned actions).</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="gc-input w-[min(360px,80vw)]"
              placeholder="Search by name or category..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="gc-btn gc-btn-ghost" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className="gc-btn gc-btn-primary" onClick={createNew}>
              + New
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="gc-card p-6">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="gc-card p-6">
          <div className="text-sm text-neutral-600">No recipes. Create your first one.</div>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => {
            const cat = upperChip(r.category || 'Uncategorized')
            const portions = toNum(r.portions, 1)
            const kcal = r.calories != null ? toNum(r.calories, 0) : null

            return (
              <div
                key={r.id}
                className="gc-menu-card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                {/* HERO — Premium: fixed aspect ratio (no distortion) */}
                <div className="relative w-full aspect-[4/3] overflow-hidden">
                  {r.photo_url ? (
                    <img
                      src={r.photo_url}
                      alt={r.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-neutral-500 bg-neutral-100">
                      No Photo
                    </div>
                  )}

                  {/* Premium overlay */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-transparent" />

                  {/* Badges */}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <span className="gc-chip gc-chip-dark">{cat}</span>
                    {kcal != null ? <span className="gc-chip">{kcal} kcal</span> : null}
                    {r.is_subrecipe ? <span className="gc-chip">SUB</span> : null}
                  </div>
                </div>

                {/* BODY — Premium: equal height + actions pinned bottom */}
                <div className="p-4 flex flex-col h-[240px]">
                  <div>
                    <div className="text-lg font-extrabold leading-tight">{r.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">Portions: {portions}</div>

                    <div className="mt-2 text-sm text-neutral-700">
                      {r.description?.trim() ? clampStr(r.description, 120) : 'Add a short menu description…'}
                    </div>

                    {(r.protein_g != null || r.carbs_g != null || r.fat_g != null) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.protein_g != null ? <span className="gc-chip">P {toNum(r.protein_g, 0)}g</span> : null}
                        {r.carbs_g != null ? <span className="gc-chip">C {toNum(r.carbs_g, 0)}g</span> : null}
                        {r.fat_g != null ? <span className="gc-chip">F {toNum(r.fat_g, 0)}g</span> : null}
                      </div>
                    )}
                  </div>

                  {/* ACTIONS pinned to bottom */}
                  <div className="mt-auto pt-4 flex gap-2">
                    <NavLink className="gc-btn gc-btn-primary" to={`/recipe?id=${r.id}`}>
                      Open Editor
                    </NavLink>

                    <NavLink className="gc-btn gc-btn-ghost" to={`/cook?id=${r.id}`}>
                      🍳 Cook
                    </NavLink>

                    <button className="gc-btn gc-btn-ghost" onClick={() => archive(r.id)} type="button">
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
