import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type Recipe = {
  id: string
  name: string
  category: string | null
  portions: number
  is_subrecipe: boolean
  is_archived: boolean
}

type Line = {
  recipe_id: string
  ingredient_id: string
  qty: number
}

type Ingredient = {
  id: string
  net_unit_cost?: number | null
  is_active?: boolean
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data: rData, error: rErr } = await supabase
        .from('recipes')
        .select('id,name,category,portions,is_subrecipe,is_archived')
        .order('name', { ascending: true })
      if (rErr) throw rErr

      const { data: lData, error: lErr } = await supabase
        .from('recipe_lines')
        .select('recipe_id,ingredient_id,qty')
      if (lErr) throw lErr

      const { data: iData, error: iErr } = await supabase
        .from('ingredients')
        .select('id,net_unit_cost,is_active')
      if (iErr) throw iErr

      setRecipes((rData ?? []) as Recipe[])
      setLines((lData ?? []) as Line[])
      setIngredients((iData ?? []) as Ingredient[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const ingCost = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of ingredients) m.set(i.id, toNum(i.net_unit_cost, 0))
    return m
  }, [ingredients])

  const recipeCost = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lines) {
      const c = toNum(l.qty, 0) * (ingCost.get(l.ingredient_id) ?? 0)
      m.set(l.recipe_id, (m.get(l.recipe_id) ?? 0) + c)
    }
    return m
  }, [lines, ingCost])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return recipes
      .filter((r) => (showArchived ? true : !r.is_archived))
      .filter((r) => !s || r.name.toLowerCase().includes(s) || (r.category ?? '').toLowerCase().includes(s))
  }, [recipes, search, showArchived])

  const openEditor = (id: string) => {
    window.location.href = `/#/recipe-editor?id=${id}`
  }

  const toggleArchive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('recipes').update({ is_archived: next }).eq('id', id)
    if (error) return showToast(error.message)
    showToast(next ? 'Recipe archived ✅' : 'Recipe restored ✅')
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES (PRO)</div>
            <div className="mt-2 text-2xl font-extrabold">Library</div>
            <div className="mt-2 text-sm text-neutral-600">Open editor, preview cost, and manage recipes.</div>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        <div className="mt-4">
          <div className="gc-label">SEARCH</div>
          <input className="gc-input mt-2 w-full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipe name or category…" />
        </div>
      </div>

      {loading && <div className="gc-card p-6">Loading…</div>}
      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => {
            const total = recipeCost.get(r.id) ?? 0
            const portions = Math.max(1, toNum(r.portions, 1))
            const cpp = total / portions
            return (
              <div key={r.id} className="gc-card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold">{r.name}</div>
                    <div className="mt-1 text-sm text-neutral-600">{r.category ?? '—'} · Portions: {portions}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.is_subrecipe && (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">Sub-Recipe</span>
                      )}
                      {r.is_archived && (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">Archived</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="gc-label">TOTAL COST</div>
                    <div className="mt-1 text-xl font-extrabold">{money(total)}</div>
                    <div className="mt-1 text-xs text-neutral-500">Cost/portion: <span className="font-semibold">{money(cpp)}</span></div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="gc-btn gc-btn-primary" type="button" onClick={() => openEditor(r.id)}>
                    Open Editor
                  </button>

                  {!r.is_archived ? (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleArchive(r.id, true)}>
                      Archive
                    </button>
                  ) : (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleArchive(r.id, false)}>
                      Restore
                    </button>
                  )}
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
