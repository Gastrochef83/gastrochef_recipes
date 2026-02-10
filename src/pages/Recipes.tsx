import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type RecipeRow = {
  id: string
  name: string
  category: string | null
  portions: number
  kitchen_id: string
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [kitchenId, setKitchenId] = useState<string | null>(null)
  const [rows, setRows] = useState<RecipeRow[]>([])

  const loadKitchen = async () => {
    const { data, error } = await supabase.rpc('current_kitchen_id')
    if (error) throw error
    const kid = (data as string) ?? null
    setKitchenId(kid)
    return kid
  }

  const loadRecipes = async (kid: string) => {
    const { data, error } = await supabase
      .from('recipes')
      .select('id,name,category,portions,kitchen_id')
      .eq('kitchen_id', kid)
      .order('name', { ascending: true })

    if (error) throw error
    setRows((data ?? []) as RecipeRow[])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const kid = await loadKitchen()
        if (!kid) {
          setErr('No kitchen linked to this user yet.')
          setLoading(false)
          return
        }
        await loadRecipes(kid)
        setLoading(false)
      } catch (e: any) {
        setErr(e?.message ?? 'Unknown error')
        setLoading(false)
      }
    })()
  }, [])

  const count = useMemo(() => rows.length, [rows])

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-2xl font-extrabold">Your Recipes</div>
            <div className="mt-2 text-sm text-neutral-600">Open any recipe editor in one click.</div>
            <div className="mt-3 text-xs text-neutral-500">
              Kitchen ID: {kitchenId ?? '—'} · Total: {count}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="gc-card p-6">
          <div className="text-sm text-neutral-600">Loading…</div>
        </div>
      )}

      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <div className="gc-card p-6">
          <div className="gc-label">LIST</div>

          {rows.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-600">No recipes yet.</div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-semibold text-neutral-500">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Portions</th>
                    <th className="py-2 pr-0 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-neutral-500">{r.id}</div>
                      </td>
                      <td className="py-3 pr-4">{r.category ?? '—'}</td>
                      <td className="py-3 pr-4">{r.portions ?? 1}</td>
                      <td className="py-3 pr-0 text-right">
                        <a className="gc-btn gc-btn-ghost" href={`/#/recipe-editor?id=${r.id}`}>
                          Open editor
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
