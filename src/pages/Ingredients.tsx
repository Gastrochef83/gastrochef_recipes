import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Input, Modal, Money } from '../components/ui'
import { useKitchen } from '../ctx/KitchenContext'

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
  const { kitchenId } = useKitchen()

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
    if (!kitchenId) return
    load().catch((e) => alert(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitchenId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((i) => [i.name, i.category ?? '', i.supplier ?? ''].join(' ').toLowerCase().includes(s))
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
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-wide text-neutral-500">INGREDIENTS</div>
            <div className="mt-1 text-2xl font-semibold">Database</div>
            <div className="mt-2 text-sm text-neutral-600">Pack cost → Net unit cost computed automatically.</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-64 rounded-xl border px-3 py-2 text-sm"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button onClick={openCreate}>+ Add ingredient</Button>
          </div>
        </div>
      </Card>

      <Card>
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
                    <td className="py-2 pr-4">
                      <Money value={i.pack_price} />
                    </td>
                    <td className="py-2 pr-4">{i.yield_percent}</td>
                    <td className="py-2 pr-4">
                      <Money value={i.net_unit_cost} />
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="ghost" onClick={() => openEdit(i)}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => onDelete(i)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal title={editing ? 'Edit ingredient' : 'Add ingredient'} open={open} onClose={() => setOpen(false)}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Name" value={name} onChange={setName} placeholder="e.g. Chicken breast" />
          <Input label="Category" value={category} onChange={setCategory} placeholder="e.g. Proteins" />
          <Input label="Supplier" value={supplier} onChange={setSupplier} placeholder="Optional" />
          <Input label="Pack unit" value={packUnit} onChange={setPackUnit} placeholder="kg / g / L / pcs" />
          <Input label="Pack size" value={packSize} onChange={setPackSize} type="number" step="0.01" />
          <Input label="Pack price" value={packPrice} onChange={setPackPrice} type="number" step="0.01" />
          <Input label="Yield %" value={yieldPercent} onChange={setYieldPercent} type="number" step="0.01" />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>{editing ? 'Save changes' : 'Create ingredient'}</Button>
        </div>
      </Modal>
    </div>
  )
}
