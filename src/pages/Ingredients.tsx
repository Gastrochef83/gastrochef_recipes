import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Ingredient = {
  id: string
  name: string
  category: string | null
  supplier: string | null
  pack_size: number
  pack_unit: string
  pack_price: number
  yield_percent: number
  net_unit_cost: number
}

function toNum(s: string, fallback = 0) {
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

export default function Ingredients() {
  const [kitchenId, setKitchenId] = useState<string | null>(null)

  const [items, setItems] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [packSize, setPackSize] = useState('1')
  const [packUnit, setPackUnit] = useState('kg')
  const [packPrice, setPackPrice] = useState('0')
  const [yieldPercent, setYieldPercent] = useState('100')

  const resetForm = () => {
    setName('')
    setCategory('')
    setSupplier('')
    setPackSize('1')
    setPackUnit('kg')
    setPackPrice('0')
    setYieldPercent('100')
  }

  const openCreate = () => {
    setEditing(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (i: Ingredient) => {
    setEditing(i)
    setName(i.name)
    setCategory(i.category ?? '')
    setSupplier(i.supplier ?? '')
    setPackSize(String(i.pack_size))
    setPackUnit(i.pack_unit)
    setPackPrice(String(i.pack_price))
    setYieldPercent(String(i.yield_percent))
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
      .from('ingredients')
      .select('id,name,category,supplier,pack_size,pack_unit,pack_price,yield_percent,net_unit_cost')
      .order('created_at', { ascending: false })

    setLoading(false)
    if (error) throw error
    setItems((data ?? []) as Ingredient[])
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
    return items.filter((i) =>
      [i.name, i.category ?? '', i.supplier ?? ''].join(' ').toLowerCase().includes(s)
    )
  }, [items, q])

  const onSave = async () => {
    if (!kitchenId) return alert('Kitchen not loaded yet')
    if (!name.trim()) return alert('Name is required')

    const payload = {
      kitchen_id: kitchenId,
      name: name.trim(),
      category: category.trim() || null,
      supplier: supplier.trim() || null,
      pack_size: toNum(packSize, 1),
      pack_unit: packUnit.trim() || 'unit',
      pack_price: toNum(packPrice, 0),
      yield_percent: toNum(yieldPercent, 100),
    }

    try {
      if (editing) {
        const { error } = await supabase.from('ingredients').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ingredients').insert(payload)
        if (error) throw error
      }
      setOpen(false)
      await load()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const onDelete = async (i: Ingredient) => {
    if (!confirm(`Delete ingredient: ${i.name}?`)) return
    const { error } = await supabase.from('ingredients').delete().eq('id', i.id)
    if (error) return alert(error.message)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="gc-label">INGREDIENTS</div>
            <div className="mt-2 text-2xl font-extrabold">Database</div>
            <div className="mt-3 text-sm text-neutral-600">
              Pack cost → Net unit cost computed automatically.
            </div>
            <div className="mt-2 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="gc-input w-64"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="gc-btn gc-btn-primary" onClick={openCreate} type="button">
              + Add ingredient
            </button>
          </div>
        </div>
      </div>

      <div className="gc-card p-6">
        {loading ? (
          <div className="text-sm text-neutral-600">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-neutral-600">No ingredients yet. Click “Add ingredient”.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold text-neutral-500">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Pack</th>
                  <th className="py-2 pr-4">Pack Price</th>
                  <th className="py-2 pr-4">Yield %</th>
                  <th className="py-2 pr-4">Net Unit Cost</th>
                  <th className="py-2 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="py-2 pr-4 font-semibold">{i.name}</td>
                    <td className="py-2 pr-4">{i.category ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {i.pack_size} {i.pack_unit}
                    </td>
                    <td className="py-2 pr-4">{i.pack_price}</td>
                    <td className="py-2 pr-4">{i.yield_percent}</td>
                    <td className="py-2 pr-4">{i.net_unit_cost}</td>
                    <td className="py-2 pr-0 text-right">
                      <div className="inline-flex gap-2">
                        <button className="gc-btn gc-btn-ghost" onClick={() => openEdit(i)} type="button">
                          Edit
                        </button>
                        <button className="gc-btn gc-btn-ghost" onClick={() => onDelete(i)} type="button">
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
          <div className="gc-card w-full max-w-2xl p-6">
            <div className="text-lg font-extrabold">{editing ? 'Edit ingredient' : 'Add ingredient'}</div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="gc-label">NAME</div>
                <input className="gc-input mt-2" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">CATEGORY</div>
                <input className="gc-input mt-2" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">SUPPLIER</div>
                <input className="gc-input mt-2" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">PACK UNIT</div>
                <input className="gc-input mt-2" value={packUnit} onChange={(e) => setPackUnit(e.target.value)} />
              </div>

              <div>
                <div className="gc-label">PACK SIZE</div>
                <input
                  className="gc-input mt-2"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  type="number"
                  step="0.01"
                />
              </div>

              <div>
                <div className="gc-label">PACK PRICE</div>
                <input
                  className="gc-input mt-2"
                  value={packPrice}
                  onChange={(e) => setPackPrice(e.target.value)}
                  type="number"
                  step="0.01"
                />
              </div>

              <div>
                <div className="gc-label">YIELD %</div>
                <input
                  className="gc-input mt-2"
                  value={yieldPercent}
                  onChange={(e) => setYieldPercent(e.target.value)}
                  type="number"
                  step="0.01"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="gc-btn gc-btn-ghost" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button className="gc-btn gc-btn-primary" onClick={onSave} type="button">
                {editing ? 'Save changes' : 'Create ingredient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
