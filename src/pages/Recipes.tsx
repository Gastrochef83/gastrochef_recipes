import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  description: string | null
  method: string | null
  photo_urls: string[] | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  created_at?: string
}

function toNum(s: string, fallback = 0) {
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

export default function Recipes() {
  const [kitchenId, setKitchenId] = useState<string | null>(null)

  const [items, setItems] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState('')
  const [photoUrlsText, setPhotoUrlsText] = useState('')

  const [calories, setCalories] = useState('')
  const [proteinG, setProteinG] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [fatG, setFatG] = useState('')

  const resetForm = () => {
    setName('')
    setDescription('')
    setMethod('')
    setPhotoUrlsText('')
    setCalories('')
    setProteinG('')
    setCarbsG('')
    setFatG('')
  }

  const openCreate = () => {
    setEditing(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (r: Recipe) => {
    setEditing(r)
    setName(r.name)
    setDescription(r.description ?? '')
    setMethod(r.method ?? '')
    setPhotoUrlsText((r.photo_urls ?? []).join('\n'))
    setCalories(r.calories == null ? '' : String(r.calories))
    setProteinG(r.protein_g == null ? '' : String(r.protein_g))
    setCarbsG(r.carbs_g == null ? '' : String(r.carbs_g))
    setFatG(r.fat_g == null ? '' : String(r.fat_g))
    setOpen(true)
  }

  const loadKitchen = async () => {
    const { data, error } = await supabase.rpc('current_kitchen_id')
    if (error) throw error
    const kid = (data as string) ?? null
    setKitchenId(kid)
    return kid
  }

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('recipes')
      .select('id,kitchen_id,name,description,method,photo_urls,calories,protein_g,carbs_g,fat_g,created_at')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) throw error
    setItems((data ?? []) as Recipe[])
  }

  useEffect(() => {
    ;(async () => {
      try {
        const kid = await loadKitchen()
        if (!kid) {
          setLoading(false)
          alert('No kitchen linked to this user yet.')
          return
        }
        await load()
      } catch (e: any) {
        setLoading(false)
        alert(e.message)
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((r) => {
      const hay = [r.name, r.description ?? ''].join(' ').toLowerCase()
      return hay.includes(s)
    })
  }, [items, q])

  const onSave = async () => {
    if (!kitchenId) return alert('Kitchen not loaded yet')
    if (!name.trim()) return alert('Name is required')

    const urls = photoUrlsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)

    const payload = {
      kitchen_id: kitchenId,
      name: name.trim(),
      description: description.trim() || null,
      method: method.trim() || null,
      photo_urls: urls.length ? urls : null,
      calories: calories.trim() === '' ? null : toNum(calories, 0),
      protein_g: proteinG.trim() === '' ? null : toNum(proteinG, 0),
      carbs_g: carbsG.trim() === '' ? null : toNum(carbsG, 0),
      fat_g: fatG.trim() === '' ? null : toNum(fatG, 0),
    }

    try {
      if (editing) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('recipes').insert(payload)
        if (error) throw error
      }
      setOpen(false)
      await load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const onDelete = async (r: Recipe) => {
    if (!confirm(`Delete recipe: ${r.name}?`)) return
    const { error } = await supabase.from('recipes').delete().eq('id', r.id)
    if (error) return alert(error.message)
    await load()
  }

  const previewUrls = useMemo(() => {
    return photoUrlsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 4)
  }, [photoUrlsText])

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">Recipes Builder</div>
            <div className="mt-2 text-sm text-neutral-600">
              Create recipes with description, method, photos, and nutrition. Costing lines come next.
            </div>
            <div className="mt-3 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="gc-input w-64"
              placeholder="Search recipes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="gc-btn gc-btn-primary" onClick={openCreate} type="button">
              + Add recipe
            </button>
          </div>
        </div>
      </div>

      <div className="gc-card p-6">
        {loading ? (
          <div className="text-sm text-neutral-600">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-neutral-600">No recipes yet. Click “Add recipe”.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold text-neutral-500">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Calories</th>
                  <th className="py-2 pr-4">Protein</th>
                  <th className="py-2 pr-4">Carbs</th>
                  <th className="py-2 pr-4">Fat</th>
                  <th className="py-2 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-3 pr-4">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-neutral-500">
                        {(r.description ?? '').slice(0, 70) || '—'}
                        {(r.description ?? '').length > 70 ? '…' : ''}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{r.calories ?? '—'}</td>
                    <td className="py-3 pr-4">{r.protein_g ?? '—'}{r.protein_g == null ? '' : ' g'}</td>
                    <td className="py-3 pr-4">{r.carbs_g ?? '—'}{r.carbs_g == null ? '' : ' g'}</td>
                    <td className="py-3 pr-4">{r.fat_g ?? '—'}{r.fat_g == null ? '' : ' g'}</td>
                    <td className="py-3 pr-0 text-right">
                      <div className="inline-flex gap-2">
                        <button className="gc-btn gc-btn-ghost" onClick={() => openEdit(r)} type="button">
                          Edit
                        </button>
                        <button className="gc-btn gc-btn-ghost" onClick={() => onDelete(r)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="gc-card w-full max-w-4xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="gc-label">{editing ? 'EDIT' : 'CREATE'}</div>
                <div className="mt-1 text-xl font-extrabold">{editing ? 'Edit recipe' : 'Add recipe'}</div>
              </div>
              <button className="gc-btn gc-btn-ghost" onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="gc-label">NAME</div>
                <input className="gc-input mt-2" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">DESCRIPTION</div>
                <input
                  className="gc-input mt-2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short dish description…"
                />
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">METHOD</div>
                <textarea
                  className="gc-input mt-2"
                  rows={8}
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder="Step-by-step method…"
                />
              </div>

              <div className="md:col-span-2">
                <div className="gc-label">PHOTO URLS (one per line)</div>
                <textarea
                  className="gc-input mt-2"
                  rows={4}
                  value={photoUrlsText}
                  onChange={(e) => setPhotoUrlsText(e.target.value)}
                  placeholder="https://…"
                />
                {previewUrls.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {previewUrls.map((u) => (
                      <div key={u} className="gc-card overflow-hidden">
                        {/* simple preview */}
                        <img src={u} alt="preview" className="h-28 w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-neutral-500">
                  Next upgrade: upload images to Supabase Storage (no external URLs).
                </div>
              </div>

              <div className="gc-card p-5 md:col-span-2">
                <div className="gc-label">NUTRITION</div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <div className="gc-label">CALORIES</div>
                    <input
                      className="gc-input mt-2"
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                      type="number"
                      step="1"
                    />
                  </div>
                  <div>
                    <div className="gc-label">PROTEIN (G)</div>
                    <input
                      className="gc-input mt-2"
                      value={proteinG}
                      onChange={(e) => setProteinG(e.target.value)}
                      type="number"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <div className="gc-label">CARBS (G)</div>
                    <input
                      className="gc-input mt-2"
                      value={carbsG}
                      onChange={(e) => setCarbsG(e.target.value)}
                      type="number"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <div className="gc-label">FAT (G)</div>
                    <input
                      className="gc-input mt-2"
                      value={fatG}
                      onChange={(e) => setFatG(e.target.value)}
                      type="number"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="gc-btn gc-btn-ghost" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button className="gc-btn gc-btn-primary" onClick={onSave} type="button">
                {editing ? 'Save changes' : 'Create recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
