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
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function clampStr(s: string, max = 110) {
  const x = (s ?? '').trim()
  if (!x) return ''
  if (x.length <= max) return x
  return x.slice(0, max - 1) + '…'
}

export default function Recipes() {
  const [rows, setRows] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (m: string) => {
    setToastMsg(m)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('recipes')
      .select('id,kitchen_id,name,category,portions,is_subrecipe,is_archived,photo_url,description,calories')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (error) showToast(error.message)
    setRows((data ?? []) as RecipeRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const s = q.toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      (r.name ?? '').toLowerCase().includes(s) ||
      (r.category ?? '').toLowerCase().includes(s)
    )
  }, [rows, q])

  const archive = async (id: string) => {
    await supabase.from('recipes').update({ is_archived: true }).eq('id', id)
    showToast('Archived')
    load()
  }

  return (
    <div className="space-y-6">

      <div className="gc-card p-6">
        <div className="flex justify-between gap-4 flex-wrap">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="text-2xl font-extrabold mt-2">Recipe Library</div>
          </div>

          <input
            className="gc-input w-[320px]"
            placeholder="Search…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="gc-card p-6">Loading…</div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

          {filtered.map(r => (
            <div key={r.id} className="gc-menu-card flex flex-col">

              {/* IMAGE — ratio locked */}
              <div className="relative w-full overflow-hidden" style={{ paddingTop: '75%' }}>
                {r.photo_url ? (
                  <img
                    src={r.photo_url}
                    alt={r.name}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{
                    position:'absolute', inset:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background:'#e5e7eb', fontWeight:700, fontSize:12
                  }}>
                    No Photo
                  </div>
                )}

                <div className="gc-menu-overlay" />

                <div className="gc-menu-badges">
                  <span className="gc-chip gc-chip-dark">
                    {(r.category || 'UNCATEGORIZED').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* BODY — height locked */}
              <div className="p-4 flex flex-col h-[230px]">

                <div>
                  <div className="font-extrabold text-lg">{r.name}</div>
                  <div className="text-xs text-neutral-500">
                    Portions: {toNum(r.portions,1)}
                  </div>

                  <div className="mt-2 text-sm text-neutral-700">
                    {clampStr(r.description || '') || 'Add description…'}
                  </div>
                </div>

                {/* BUTTONS ALWAYS BOTTOM */}
                <div className="mt-auto pt-4 flex gap-2">
                  <NavLink className="gc-btn gc-btn-primary" to={`/recipe?id=${r.id}`}>
                    Open
                  </NavLink>

                  <NavLink className="gc-btn gc-btn-ghost" to={`/cook?id=${r.id}`}>
                    Cook
                  </NavLink>

                  <button className="gc-btn gc-btn-ghost" onClick={() => archive(r.id)}>
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
