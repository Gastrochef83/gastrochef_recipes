import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'

type IngredientRow = {
  id: string
  code?: string | null
  name: string
  category?: string | null

  pack_size?: number | null
  pack_unit?: string | null
  pack_price?: number | null

  net_size?: number | null
  net_unit?: string | null
  net_unit_cost?: number | null

  is_archived?: boolean | null
  created_at?: string | null
}

const PAGE_SIZE = 500
const FIELDS =
  'id,code,name,category,pack_size,pack_unit,pack_price,net_size,net_unit,net_unit_cost,is_archived,created_at'

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function calcNetUnitCost(packPrice: number, packSize: number) {
  const ps = Math.max(1e-9, packSize)
  const pp = Math.max(0, packPrice)
  return pp / ps
}

function sanityFlag(net: number, unit: string) {
  // Simple heuristics: if cost per "g/ml" is extremely high, probably wrong units.
  // We keep it gentle; it’s a hint, not a blocker.
  const u = safeUnit(unit)
  if (!Number.isFinite(net) || net <= 0) return { level: 'missing' as const, msg: 'Missing cost' }

  if (u === 'g' || u === 'ml') {
    if (net > 1) return { level: 'warn' as const, msg: 'Looks too high per g/ml (unit mismatch?)' }
  }
  if (u === 'kg' || u === 'l') {
    if (net > 200) return { level: 'warn' as const, msg: 'Looks too high per kg/L' }
  }
  if (u === 'pcs') {
    if (net > 500) return { level: 'warn' as const, msg: 'Looks too high per piece' }
  }
  return { level: 'ok' as const, msg: '' }
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(900px,92vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="gc-card shadow-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-black/10">
            <div>
              <div className="gc-label">INGREDIENT</div>
              <div className="mt-1 text-xl font-extrabold">{title}</div>
            </div>
            <button className="gc-btn gc-btn-ghost" onClick={onClose} type="button">
              Close
            </button>
          </div>
          <div className="p-6 overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}

function money(n: number, currency = 'USD') {
  const v = Number.isFinite(n) ? n : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}

function round2(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export default function Ingredients() {
  const { kitchenId } = useKitchen()

  const isDebug =
    (() => {
      try {
        const v = localStorage.getItem('gc_debug')
        return v === '1' || v === 'true'
      } catch {
        return false
      }
    })() ?? false

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [rows, setRows] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const [showInactive, setShowInactive] = useState(false)

  const [sort, setSort] = useState<'name' | 'category' | 'net_unit_cost' | 'pack_price' | 'created_at'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<IngredientRow | null>(null)

  const [bulkWorking, setBulkWorking] = useState(false)

  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)

    try {
      // paging loop
      let out: IngredientRow[] = []
      let offset = 0
      for (;;) {
        const { data, error } = await supabase
          .from('ingredients')
          .select(FIELDS)
          .order('name', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (error) throw error
        const chunk = (data as any) ?? []
        out = out.concat(chunk)

        if (chunk.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      if (!aliveRef.current) return
      setRows(out)

      // warm cache (used by RecipeEditor etc)
      try {
        primeIngredientsCache(out as any)
      } catch {
        // ignore
      }
    } catch (e: any) {
      if (!aliveRef.current) return
      setErr(e?.message ?? 'Failed to load ingredients')
    } finally {
      if (!aliveRef.current) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = (deferredSearch ?? '').trim().toLowerCase()
    let out = rows

    if (!showInactive) out = out.filter((r) => !r.is_archived)

    if (q) {
      out = out.filter((r) => {
        const a = (r.name ?? '').toLowerCase()
        const b = (r.code ?? '').toLowerCase()
        const c = (r.category ?? '').toLowerCase()
        return a.includes(q) || b.includes(q) || c.includes(q)
      })
    }

    const dir = sortDir === 'asc' ? 1 : -1
    const get = (r: IngredientRow) => {
      if (sort === 'name') return (r.name ?? '').toLowerCase()
      if (sort === 'category') return (r.category ?? '').toLowerCase()
      if (sort === 'created_at') return (r.created_at ?? '')
      if (sort === 'net_unit_cost') return Number(r.net_unit_cost ?? 0)
      if (sort === 'pack_price') return Number(r.pack_price ?? 0)
      return (r.name ?? '').toLowerCase()
    }

    out = [...out].sort((a, b) => {
      const A: any = get(a)
      const B: any = get(b)
      if (typeof A === 'number' && typeof B === 'number') return (A - B) * dir
      return String(A).localeCompare(String(B)) * dir
    })

    return out
  }, [rows, deferredSearch, showInactive, sort, sortDir])

  const stats = useMemo(() => {
    const items = filtered.length
    let sNet = 0
    let cNet = 0
    let missing = 0
    let warnings = 0

    for (const r of filtered) {
      const net = Number(r.net_unit_cost ?? 0)
      if (!Number.isFinite(net) || net <= 0) {
        missing++
      } else {
        sNet += net
        cNet++
        const flag = sanityFlag(net, r.net_unit ?? r.pack_unit ?? 'g')
        if (flag.level === 'warn') warnings++
      }
    }

    const avgNet = cNet ? sNet / cNet : 0
    return { items, avgNet, missing, warnings }
  }, [filtered])

  async function onArchive(row: IngredientRow) {
    try {
      const { error } = await supabase.from('ingredients').update({ is_archived: true }).eq('id', row.id)
      if (error) throw error
      setToast({ kind: 'ok', msg: 'Archived' })
      invalidateIngredientsCache()
      await load()
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? 'Archive failed' })
    }
  }

  async function onRestore(row: IngredientRow) {
    try {
      const { error } = await supabase.from('ingredients').update({ is_archived: false }).eq('id', row.id)
      if (error) throw error
      setToast({ kind: 'ok', msg: 'Restored' })
      invalidateIngredientsCache()
      await load()
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? 'Restore failed' })
    }
  }

  async function onDelete(row: IngredientRow) {
    try {
      const { error } = await supabase.from('ingredients').delete().eq('id', row.id)
      if (error) throw error
      setToast({ kind: 'ok', msg: 'Deleted' })
      invalidateIngredientsCache()
      await load()
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? 'Delete failed' })
    }
  }

  function openEdit(row: IngredientRow) {
    setEditRow(row)
    setEditOpen(true)
  }

  async function saveEdit(next: IngredientRow) {
    try {
      const payload: any = {
        code: next.code ?? null,
        name: (next.name ?? '').trim(),
        category: (next.category ?? '').trim() || null,
        pack_size: next.pack_size ?? null,
        pack_unit: (next.pack_unit ?? '').trim() || null,
        pack_price: next.pack_price ?? null,
        net_size: next.net_size ?? null,
        net_unit: (next.net_unit ?? '').trim() || null,
        net_unit_cost: next.net_unit_cost ?? null,
      }
      const { error } = await supabase.from('ingredients').update(payload).eq('id', next.id)
      if (error) throw error
      setToast({ kind: 'ok', msg: 'Saved' })
      invalidateIngredientsCache()
      setEditOpen(false)
      setEditRow(null)
      await load()
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? 'Save failed' })
    }
  }

  async function bulkRecalcNetUnitCost() {
    try {
      setBulkWorking(true)
      const updates: Array<{ id: string; net_unit_cost: number }> = []

      for (const r of rows) {
        const packPrice = Number(r.pack_price ?? 0)
        const packSize = Number(r.pack_size ?? 0)
        if (packPrice > 0 && packSize > 0) {
          updates.push({ id: r.id, net_unit_cost: calcNetUnitCost(packPrice, packSize) })
        }
      }

      // chunk updates
      const chunkSize = 100
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        const { error } = await supabase.from('ingredients').upsert(chunk as any, { onConflict: 'id' })
        if (error) throw error
      }

      setToast({ kind: 'ok', msg: `Recalculated net unit cost for ${updates.length} ingredients` })
      invalidateIngredientsCache()
      await load()
    } catch (e: any) {
      setToast({ kind: 'err', msg: e?.message ?? 'Bulk update failed' })
    } finally {
      setBulkWorking(false)
    }
  }

  return (
    <div className="gc-ingredients space-y-6">
      {/* Header */}
      <div className="gc-card p-6 gc-page-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">INGREDIENTS — PRO</div>
            <div className="mt-2 text-2xl font-extrabold">Database</div>
            <div className="mt-2 text-sm text-neutral-600">Search, filter, sort, validate costs, and manage ingredients.</div>
            {isDebug && <div className="mt-3 text-xs text-neutral-500">Kitchen ID: {kitchenId ?? '—'}</div>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>

            <button
              className={cls('gc-btn', 'gc-btn-ghost')}
              onClick={() => {
                setSort('created_at')
                setSortDir('desc')
              }}
              type="button"
            >
              Newest
            </button>

            <button
              className={cls('gc-btn', 'gc-btn-ghost')}
              onClick={() => {
                setSort('net_unit_cost')
                setSortDir('desc')
              }}
              type="button"
            >
              Highest cost
            </button>

            <button className={cls('gc-btn', 'gc-btn-primary')} onClick={() => bulkRecalcNetUnitCost()} disabled={bulkWorking}>
              {bulkWorking ? 'Working…' : 'Recalc Net Unit'}
            </button>
          </div>
        </div>
      </div>

      {/* Loading/Error */}
      {loading && (
        <div className="space-y-4">
          {/* KPI skeletons */}
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="gc-card p-5">
                <Skeleton className="h-3 w-28 rounded-md" />
                <div className="mt-3">
                  <Skeleton className="h-8 w-28 rounded-lg" />
                </div>
                <div className="mt-2">
                  <Skeleton className="h-3 w-32 rounded-md" />
                </div>
              </div>
            ))}
          </div>

          {/* Toolbar skeleton */}
          <div className="gc-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Skeleton className="h-10 w-full rounded-xl md:w-[420px]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Table skeleton */}
          <div className="gc-card p-5">
            <Skeleton className="h-4 w-48 rounded-md" />
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-48 rounded-md" />
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-4 w-24 rounded-md" />
              </div>
              {Array.from({ length: 8 }).map((_, r) => (
                <div key={r} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-20 rounded-md" />
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {/* Body */}
      {!loading && !err && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-4">
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

            <div className="gc-card p-5">
              <div className="gc-label">MISSING COST</div>
              <div className="mt-2 text-2xl font-extrabold">{stats.missing}</div>
              <div className="mt-1 text-xs text-neutral-500">Need net_unit_cost</div>
            </div>

            <div className="gc-card p-5">
              <div className="gc-label">WARNINGS</div>
              <div className="mt-2 text-2xl font-extrabold">{stats.warnings}</div>
              <div className="mt-1 text-xs text-neutral-500">Potential unit mismatch</div>
            </div>
          </div>

          {/* Controls */}
          <div className="gc-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="gc-input w-full sm:w-[420px]"
                  placeholder="Search name, code, category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-600">Sort:</span>
                  <select className="gc-select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                    <option value="name">Name</option>
                    <option value="category">Category</option>
                    <option value="net_unit_cost">Net unit cost</option>
                    <option value="pack_price">Pack price</option>
                    <option value="created_at">Created</option>
                  </select>
                  <select className="gc-select" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="gc-btn gc-btn-ghost" onClick={() => load()} type="button">
                  Refresh
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-600">No ingredients found.</div>
            ) : (
              <div className="mt-4 gc-data-table-wrap">
                <table className="gc-data-table text-sm">
                  <thead>
                    <tr>
                      <th className="gc-col-code">Code</th>
                      <th className="gc-col-name">Name</th>
                      <th className="gc-col-category">Category</th>
                      <th className={cls('gc-th-right', 'gc-col-pack')}>Pack</th>
                      <th className={cls('gc-th-right', 'gc-col-net')}>Net Unit</th>
                      <th className={cls('gc-th-right', 'gc-col-netcost')}>Net Unit Cost</th>
                      <th className="gc-col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const net = Number(r.net_unit_cost ?? 0)
                      const unit = r.net_unit ?? r.pack_unit ?? 'g'
                      const flag = sanityFlag(net, unit)

                      return (
                        <tr key={r.id} className={r.is_archived ? 'opacity-60' : ''}>
                          <td className="gc-td-mono">{r.code ?? '—'}</td>
                          <td className="font-semibold">{r.name}</td>
                          <td>{r.category ?? '—'}</td>

                          <td className="gc-td-right">
                            <span className="gc-td-mono">
                              {round2(Number(r.pack_size ?? 0))} {r.pack_unit ?? ''}
                            </span>
                            <div className="text-xs text-neutral-500">{money(Number(r.pack_price ?? 0))}</div>
                          </td>

                          <td className="gc-td-right">
                            <span className="gc-td-mono">
                              {round2(Number(r.net_size ?? 0))} {r.net_unit ?? ''}
                            </span>
                          </td>

                          <td className="gc-td-right">
                            <div className="font-semibold">{money(net)}</div>
                            {flag.level === 'warn' ? (
                              <div className="text-xs text-amber-700">{flag.msg}</div>
                            ) : flag.level === 'missing' ? (
                              <div className="text-xs text-red-600">Missing cost</div>
                            ) : null}
                          </td>

                          <td className="gc-td-right">
                            <div className="flex items-center justify-end gap-2">
                              <button className="gc-btn gc-btn-ghost" onClick={() => openEdit(r)} type="button">
                                Edit
                              </button>

                              {!r.is_archived ? (
                                <>
                                  <button className="gc-btn gc-btn-ghost" onClick={() => onArchive(r)} type="button">
                                    Archive
                                  </button>
                                  <button className="gc-btn gc-btn-danger" onClick={() => onDelete(r)} type="button">
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button className="gc-btn gc-btn-ghost" onClick={() => onRestore(r)} type="button">
                                    Restore
                                  </button>
                                  <button className="gc-btn gc-btn-danger" onClick={() => onDelete(r)} type="button">
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        title={editRow?.name ?? 'Edit'}
        onClose={() => {
          setEditOpen(false)
          setEditRow(null)
        }}
      >
        {editRow ? (
          <EditForm
            key={editRow.id}
            row={editRow}
            onCancel={() => {
              setEditOpen(false)
              setEditRow(null)
            }}
            onSave={(next) => saveEdit(next)}
          />
        ) : null}
      </Modal>

      {/* Toast */}
      {toast ? (
        <Toast
          kind={toast.kind}
          msg={toast.msg}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  )
}

const EditForm = memo(function EditForm({
  row,
  onCancel,
  onSave,
}: {
  row: IngredientRow
  onCancel: () => void
  onSave: (next: IngredientRow) => void
}) {
  const [draft, setDraft] = useState<IngredientRow>(row)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <label className="gc-field">
          <div className="gc-label">CODE</div>
          <input className="gc-input" value={draft.code ?? ''} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        </label>

        <label className="gc-field md:col-span-2">
          <div className="gc-label">NAME</div>
          <input className="gc-input" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>

        <label className="gc-field md:col-span-3">
          <div className="gc-label">CATEGORY</div>
          <input
            className="gc-input"
            value={draft.category ?? ''}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
        </label>

        <label className="gc-field">
          <div className="gc-label">PACK SIZE</div>
          <input
            className="gc-input"
            inputMode="decimal"
            value={draft.pack_size ?? ''}
            onChange={(e) => setDraft({ ...draft, pack_size: Number(e.target.value || 0) })}
          />
        </label>

        <label className="gc-field">
          <div className="gc-label">PACK UNIT</div>
          <input className="gc-input" value={draft.pack_unit ?? ''} onChange={(e) => setDraft({ ...draft, pack_unit: e.target.value })} />
        </label>

        <label className="gc-field">
          <div className="gc-label">PACK PRICE</div>
          <input
            className="gc-input"
            inputMode="decimal"
            value={draft.pack_price ?? ''}
            onChange={(e) => setDraft({ ...draft, pack_price: Number(e.target.value || 0) })}
          />
        </label>

        <label className="gc-field">
          <div className="gc-label">NET SIZE</div>
          <input
            className="gc-input"
            inputMode="decimal"
            value={draft.net_size ?? ''}
            onChange={(e) => setDraft({ ...draft, net_size: Number(e.target.value || 0) })}
          />
        </label>

        <label className="gc-field">
          <div className="gc-label">NET UNIT</div>
          <input className="gc-input" value={draft.net_unit ?? ''} onChange={(e) => setDraft({ ...draft, net_unit: e.target.value })} />
        </label>

        <label className="gc-field">
          <div className="gc-label">NET UNIT COST</div>
          <input
            className="gc-input"
            inputMode="decimal"
            value={draft.net_unit_cost ?? ''}
            onChange={(e) => setDraft({ ...draft, net_unit_cost: Number(e.target.value || 0) })}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button className="gc-btn gc-btn-ghost" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="gc-btn gc-btn-primary" type="submit">
          Save
        </button>
      </div>
    </form>
  )
})
