import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type IngredientRow = {
  id: string
  name?: string
  category?: string | null
  supplier?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
  kitchen_id?: string
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function cls(...xs: (string | false | undefined | null)[]) {
  return xs.filter(Boolean).join(' ')
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="gc-card p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="gc-label">MODAL</div>
              <div className="mt-1 text-xl font-extrabold">{title}</div>
            </div>
            <button className="gc-btn gc-btn-ghost" onClick={onClose} type="button">
              Close
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function Ingredients() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [rows, setRows] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'cost'>('name')

  const [kitchenId, setKitchenId] = useState<string | null>(null)

  // ✅ Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fName, setFName] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fPackUnit, setFPackUnit] = useState('g')
  const [fNetUnitCost, setFNetUnitCost] = useState('0')
  const [saving, setSaving] = useState(false)

  const loadKitchen = async () => {
    const { data, error } = await supabase.rpc('current_kitchen_id')
    if (!error) {
      const kid = (data as string) ?? null
      setKitchenId(kid)
      return kid
    }
    setKitchenId(null)
    return null
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      await loadKitchen()

      // ✅ schema-safe: select('*') حتى لا ينهار إذا جدولك فيه/ما فيه أعمدة إضافية
      const { data, error } = await supabase.from('ingredients').select('*').order('name', { ascending: true })
      if (error) throw error

      const list = (data ?? []) as IngredientRow[]
      setRows(list)
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const normalized = useMemo(() => {
    // فلترة is_active على مستوى الواجهة
    return rows.filter((r) => {
      const active = r.is_active ?? true
      return showInactive ? true : active
    })
  }, [rows, showInactive])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const r of normalized) {
      const c = (r.category ?? '').trim()
      if (c) s.add(c)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [normalized])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    let list = normalized.filter((r) => {
      const name = (r.name ?? '').toLowerCase()
      const sup = (r.supplier ?? '').toLowerCase()
      const okSearch = !s || name.includes(s) || sup.includes(s)
      const okCat = !category || (r.category ?? '') === category
      return okSearch && okCat
    })

    if (sortBy === 'name') {
      list = list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    } else {
      list = list.sort((a, b) => toNum(b.net_unit_cost, 0) - toNum(a.net_unit_cost, 0))
    }
    return list
  }, [normalized, search, category, sortBy])

  const stats = useMemo(() => {
    const items = filtered.length
    const avgNet = items > 0 ? filtered.reduce((a, r) => a + toNum(r.net_unit_cost, 0), 0) / items : 0
    return { items, avgNet }
  }, [filtered])

  const openCreate = () => {
    setEditingId(null)
    setFName('')
    setFCategory('')
    setFSupplier('')
    setFPackUnit('g')
    setFNetUnitCost('0')
    setModalOpen(true)
  }

  const openEdit = (r: IngredientRow) => {
    setEditingId(r.id)
    setFName(r.name ?? '')
    setFCategory(r.category ?? '')
    setFSupplier(r.supplier ?? '')
    setFPackUnit(r.pack_unit ?? 'g')
    setFNetUnitCost(String(toNum(r.net_unit_cost, 0)))
    setModalOpen(true)
  }

  const save = async () => {
    const name = fName.trim()
    if (!name) {
      showToast('Name is required')
      return
    }

    setSaving(true)
    try {
      const payload: any = {
        name,
        category: fCategory.trim() || null,
        supplier: fSupplier.trim() || null,
        pack_unit: (fPackUnit || 'g').trim(),
        net_unit_cost: Math.max(0, toNum(fNetUnitCost, 0)),
        is_active: true,
      }

      // kitchen_id قد يكون موجوداً في جدولك — نحاول إضافته بأمان
      if (kitchenId) payload.kitchen_id = kitchenId

      if (editingId) {
        let { error } = await supabase.from('ingredients').update(payload).eq('id', editingId)
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error } = await supabase.from('ingredients').update(payload).eq('id', editingId))
        }
        if (error) throw error
        showToast('Ingredient updated ✅')
      } else {
        let { error } = await supabase.from('ingredients').insert(payload)
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error } = await supabase.from('ingredients').insert(payload))
        }
        if (error) throw error
        showToast('Ingredient created ✅')
      }

      setModalOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ✅ Soft delete: deactivate / restore (لا يوجد FK crash)
  const deactivate = async (id: string) => {
    const ok = confirm('Deactivate ingredient? It will be hidden from pickers.')
    if (!ok) return
    const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
    if (error) {
      showToast(error.message)
      return
    }
    showToast('Ingredient deactivated ✅')
    await load()
  }

  const restore = async (id: string) => {
    const { error } = await supabase.from('ingredients').update({ is_active: true }).eq('id', id)
    if (error) {
      showToast(error.message)
      return
    }
    showToast('Ingredient restored ✅')
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">INGREDIENTS</div>
            <div className="mt-2 text-2xl font-extrabold">Database</div>
            <div className="mt-2 text-sm text-neutral-600">Search, filter, sort, and manage ingredients.</div>
            <div className="mt-3 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>

            <button className="gc-btn gc-btn-primary" type="button" onClick={openCreate}>
              + Add ingredient
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <div className="gc-label">SEARCH</div>
            <input
              className="gc-input mt-2 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or supplier…"
            />
          </div>

          <div className="min-w-[240px]">
            <div className="gc-label">CATEGORY</div>
            <select className="gc-input mt-2 w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[200px]">
            <div className="gc-label">SORT</div>
            <select className="gc-input mt-2 w-full" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="name">Name (A→Z)</option>
              <option value="cost">Net Unit Cost (High→Low)</option>
            </select>
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
        <>
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="gc-card p-5">
              <div className="gc-label">ITEMS</div>
              <div className="mt-2 text-2xl font-extrabold">{stats.items}</div>
              <div className="mt-1 text-xs text-neutral-500">Filtered results</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">AVG NET UNIT</div>
              <div className="mt-2 text-2xl font-extrabold">{money(stats.avgNet)}</div>
              <div className="mt-1 text-xs text-neutral-500">Average net unit cost</div>
            </div>
          </div>

          {/* Category chips */}
          <div className="gc-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={cls('gc-btn', 'gc-btn-ghost', !category && 'ring-2 ring-black/10')}
                type="button"
                onClick={() => setCategory('')}
              >
                All
              </button>
              {categories.slice(0, 12).map((c) => (
                <button
                  key={c}
                  className={cls('gc-btn', 'gc-btn-ghost', category === c && 'ring-2 ring-black/10')}
                  type="button"
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="gc-card p-6">
            <div className="gc-label">LIST</div>

            {filtered.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-600">No ingredients found.</div>
            ) : (
              <div className="mt-4 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold text-neutral-500">
                    <tr>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Supplier</th>
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Net Unit Cost</th>
                      <th className="py-2 pr-0 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {filtered.map((r) => {
                      const active = r.is_active ?? true
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="py-3 pr-4">
                            <div className="font-semibold">
                              {r.name ?? '—'}
                              {!active && (
                                <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-500">ID: {r.id}</div>
                          </td>
                          <td className="py-3 pr-4">{r.category ?? '—'}</td>
                          <td className="py-3 pr-4">{r.supplier ?? '—'}</td>
                          <td className="py-3 pr-4">{r.pack_unit ?? '—'}</td>
                          <td className="py-3 pr-4 font-semibold">{money(toNum(r.net_unit_cost, 0))}</td>
                          <td className="py-3 pr-0 text-right">
                            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => openEdit(r)}>
                              Edit
                            </button>
                            {active ? (
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => deactivate(r.id)}>
                                Delete
                              </button>
                            ) : (
                              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => restore(r.id)}>
                                Restore
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="mt-3 text-xs text-neutral-500">
                  * Delete هنا = Deactivate (Soft Delete) لتجنب مشاكل FK مع recipe_lines.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        title={editingId ? 'Edit Ingredient' : 'Add Ingredient'}
        onClose={() => setModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="gc-label">NAME</div>
            <input className="gc-input mt-2 w-full" value={fName} onChange={(e) => setFName(e.target.value)} />
          </div>

          <div>
            <div className="gc-label">CATEGORY</div>
            <input className="gc-input mt-2 w-full" value={fCategory} onChange={(e) => setFCategory(e.target.value)} />
          </div>

          <div>
            <div className="gc-label">SUPPLIER</div>
            <input className="gc-input mt-2 w-full" value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} />
          </div>

          <div>
            <div className="gc-label">UNIT</div>
            <select className="gc-input mt-2 w-full" value={fPackUnit} onChange={(e) => setFPackUnit(e.target.value)}>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">L</option>
              <option value="pcs">pcs</option>
            </select>
          </div>

          <div>
            <div className="gc-label">NET UNIT COST</div>
            <input
              className="gc-input mt-2 w-full"
              type="number"
              step="0.0001"
              value={fNetUnitCost}
              onChange={(e) => setFNetUnitCost(e.target.value)}
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2">
            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="gc-btn gc-btn-primary" type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ✅ Toast */}
      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
