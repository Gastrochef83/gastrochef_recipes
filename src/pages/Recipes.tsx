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
  is_archived: boolean
  photo_url: string | null
  created_at?: string | null
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [rows, setRows] = useState<RecipeRow[]>([])
  const [q, setQ] = useState('')

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
        .select('id,kitchen_id,name,category,portions,is_archived,photo_url,created_at')
        .eq('is_archived', false)
        .order('name', { ascending: true })

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

  if (loading) return <div className="gc-card p-6">Loading recipes…</div>

  if (err) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div>
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
        <button className="gc-btn gc-btn-primary" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-2xl font-extrabold">Recipe Library</div>
            <div className="mt-2 text-sm text-neutral-600">Paprika-style grid with photos.</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="gc-input w-[min(380px,78vw)]"
              placeholder="Search by name or category…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <button className="gc-btn gc-btn-ghost" onClick={load}>
              Refresh
            </button>

            <NavLink className="gc-btn gc-btn-primary" to="/recipe-editor">
              + New
            </NavLink>
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
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
            <div key={r.id} className="gc-card overflow-hidden">
              {/* Photo */}
              <div className="relative h-40 w-full bg-neutral-100">
                {r.photo_url ? (
                  <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                    No Photo
                  </div>
                )}

                {/* Badge */}
                <div className="absolute left-3 top-3 rounded-full border border-neutral-200 bg-white/90 px-3 py-1 text-[11px] font-extrabold tracking-wide text-neutral-700">
                  {r.category ?? 'UNCATEGORIZED'}
                </div>
              </div>

              {/* Body */}
              <div className="p-4">
                <div className="text-base font-extrabold leading-tight">{r.name}</div>
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
