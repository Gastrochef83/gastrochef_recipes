import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type RecipeRow = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  is_archived: boolean
  photo_url: string | null
  calories: number | null
  created_at?: string | null
}

function badgeClass(cat: string) {
  const x = (cat || '').toLowerCase()
  if (x.includes('veg') || x.includes('veget')) return 'bg-emerald-600 text-white'
  if (x.includes('chicken') || x.includes('meat') || x.includes('beef')) return 'bg-rose-600 text-white'
  if (x.includes('dessert') || x.includes('sweet')) return 'bg-amber-500 text-white'
  if (x.includes('fish') || x.includes('sea')) return 'bg-sky-600 text-white'
  return 'bg-neutral-900 text-white'
}

function SkeletonCard() {
  return (
    <div className="gc-card overflow-hidden">
      <div className="h-44 w-full bg-neutral-100 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="h-3 w-1/2 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="h-10 w-full bg-neutral-100 rounded-2xl animate-pulse" />
      </div>
    </div>
  )
}

export default function Recipes() {
  const nav = useNavigate()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [rows, setRows] = useState<RecipeRow[]>([])
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (m: string) => {
    setToastMsg(m)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id,kitchen_id,name,category,portions,is_archived,photo_url,calories,created_at')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRows((data ?? []) as RecipeRow[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load recipes')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => {
      const a = (r.name ?? '').toLowerCase()
      const b = (r.category ?? '').toLowerCase()
      return a.includes(needle) || b.includes(needle)
    })
  }, [rows, q])

  const createNew = async () => {
    if (creating) return
    setCreating(true)
    try {
      const kitchenId = rows[0]?.kitchen_id
      if (!kitchenId) {
        showToast('No kitchen_id found yet.')
        setCreating(false)
        return
      }

      const payload = {
        kitchen_id: kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 1,
        yield_qty: null,
        yield_unit: null,
        is_subrecipe: false,
        is_archived: false,
        photo_url: null,
        description: null,
        method: null,
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        photo_urls: null,
      }

      const { data, error } = await supabase.from('recipes').insert(payload).select('id').single()
      if (error) throw error

      const newId = data?.id
      if (!newId) throw new Error('Failed to create recipe id')

      showToast('Recipe created ✅')
      await load()
      nav(`/recipe-editor?id=${newId}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-2xl font-extrabold">Recipe Library</div>
            <div className="mt-2 text-sm text-neutral-600">
              Premium grid — fast search, photos, nutrition preview.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="gc-input w-[min(420px,78vw)]"
              placeholder="Search by name or category…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <button className="gc-btn gc-btn-ghost" onClick={load}>
              Refresh
            </button>

            <button className="gc-btn gc-btn-primary" onClick={createNew} disabled={creating}>
              {creating ? 'Creating…' : '+ New'}
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="gc-card p-6 space-y-3">
          <div className="gc-label">ERROR</div>
          <div className="text-sm text-red-600">{err}</div>
          <button className="gc-btn gc-btn-primary" onClick={load}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gc-card p-6">
          <div className="gc-label">EMPTY</div>
          <div className="mt-2 text-sm text-neutral-600">No recipes found.</div>
          <div className="mt-4">
            <button className="gc-btn gc-btn-ghost" onClick={() => setQ('')}>
              Clear search
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="gc-card overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
            >
              {/* Image */}
              <div className="relative h-44 w-full bg-neutral-100">
                {r.photo_url ? (
                  <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                    No Photo
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />

                {/* Category badge */}
                <div
                  className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wide ${badgeClass(
                    r.category ?? ''
                  )}`}
                >
                  {r.category ?? 'UNCATEGORIZED'}
                </div>

                {/* Calories badge */}
                {Number.isFinite(r.calories as any) && r.calories !== null ? (
                  <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-extrabold text-neutral-800">
                    {r.calories} kcal
                  </div>
                ) : null}
              </div>

              {/* Body */}
              <div className="p-4">
                <div className="text-base font-extrabold leading-tight line-clamp-1">{r.name}</div>
                <div className="mt-1 text-xs text-neutral-500">Portions: {r.portions ?? 1}</div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <NavLink className="gc-btn gc-btn-primary" to={`/recipe-editor?id=${r.id}`}>
                    Open
                  </NavLink>

                  <button
                    className="gc-btn gc-btn-ghost"
                    onClick={async () => {
                      try {
                        const { error } = await supabase.from('recipes').update({ is_archived: true }).eq('id', r.id)
                        if (error) throw error
                        showToast('Archived ✅')
                        await load()
                      } catch (e: any) {
                        showToast(e?.message ?? 'Archive failed')
                      }
                    }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
