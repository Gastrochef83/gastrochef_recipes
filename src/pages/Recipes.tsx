import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type RecipeRow = {
  id: string
  kitchen_id: string
  name: string
  category?: string | null
  portions?: number | null
  description?: string | null
  method?: string | null
  photo_urls?: string[] | null
  calories?: number | string | null
  protein_g?: number | string | null
  carbs_g?: number | string | null
  fat_g?: number | string | null
  created_at?: string | null
}

function toNum(s: string, fallback = 0) {
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

export default function Recipes() {
  const [kitchenId, setKitchenId] = useState<string | null>(null)
  const [items, setItems] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecipeRow | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')

  const [description, setDescription] = useState('')
  const [method, setMethod] = useState('')
  const [photoUrlsText, setPhotoUrlsText] = useState('')

  const [calories, setCalories] = useState('')
  const [proteinG, setProteinG] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [fatG, setFatG] = useState('')

  const resetForm = () => {
    setName('')
    setCategory('')
    setPortions('1')
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

  const openEdit = (r: RecipeRow) => {
    setEditing(r)
    setName(r.name ?? '')
    setCategory((r.category as any) ?? '')
    setPortions(r.portions == null ? '1' : String(r.portions))
    setDescription((r.description as any) ?? '')
    setMethod((r.method as any) ?? '')
    setPhotoUrlsText(((r.photo_urls as any) ?? []).join('\n'))
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
    setErr(null)

    const { data, error } = await supabase
      .from('recipes')
      .select(
        'id,kitchen_id,name,category,portions,description,method,photo_urls,calories,protein_g,carbs_g,fat_g,created_at'
      )
      .order('created_at', { ascending: false })

    setLoading(false)

    if (error) {
      setErr(error.message)
      setItems([])
      return
    }

    setItems((data ?? []) as RecipeRow[])
  }

  useEffect(() => {
    ;(async () => {
      try {
        const kid = await loadKitchen()
        if (!kid) {
          setLoading(false)
          setErr('No kitchen linked to this user yet.')
          return
        }
        await load()
      } catch (e: any) {
        setLoading(false)
        setErr(e?.message ?? 'Unknown error')
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((r) => {
      const hay = [r.name ?? '', r.category ?? '', r.description ?? ''].join(' ').toLowerCase()
      return hay.includes(s)
    })
  }, [items, q])

  const previewUrls = useMemo(() => {
    return photoUrlsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 4)
  }, [photoUrlsText])

  const onSave = async () => {
    if (!kitchenId) return alert('Kitchen not loaded yet')
    if (!name.trim()) return alert('Name is required')

    const portionsVal = toNum(portions, 1)
    if (portionsVal <= 0) return alert('Portions must be >= 1')

    const urls = photoUrlsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)

    const payload = {
      kitchen_id: kitchenId,
      name: name.trim(),
      category: category.trim() || null,
      portions: portionsVal,
      description: description.trim() || null,
      method: method.trim() || null,
      photo_urls: urls.length ? urls : null,
      calories: calories.trim() === '' ? null : toNum(calories, 0),
      protein_g: proteinG.trim() === '' ? null : toNum(proteinG, 0),
      carbs_g: carbsG.trim() === '' ? null : toNum(carbsG, 0),
      fat_g: fatG.trim() === '' ? null : toNum(fatG, 0),
    }

    const res = editing
      ? await supabase.from('recipes').update(payload).eq('id', editing.id)
      : await supabase.from('recipes').insert(payload)

    if (res.error) {
      alert(res.error.message)
      return
    }

    setOpen(false)
    await load()
  }

  const onDelete = async (r: RecipeRow) => {
    if (!confirm(`Delete recipe: ${r.name}?`)) return
    const { error } = await supabase.from('recipes').delete().eq('id', r.id)
    if (error) return alert(error.message)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES</div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">Recipes Builder</div>
            <div className="mt-2 text-sm text-neutral-600">
              Description, method, photos, nutrition. (Costing lines next.)
            </div>
            <div className="mt-3 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>
          </div>
