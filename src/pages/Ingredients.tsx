// src/pages/Ingredients.tsx
import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'
import { motion, AnimatePresence } from 'framer-motion'

type IngredientRow = {
  id: string
  code?: string | null
  code_category?: string | null
  name?: string
  category?: string | null
  supplier?: string | null
  pack_size?: number | null
  pack_price?: number | null
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

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function calcNetUnitCost(packPrice: number, packSize: number) {
  const ps = Math.max(1e-9, packSize)
  const pp = Math.max(0, packPrice)
  return pp / ps
}

function sanityFlag(net: number, unit: string) {
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

// ==================== Unit Badge Component ====================
const UnitBadge = ({ unit }: { unit: string }) => {
  const unitSymbols: Record<string, string> = {
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'L',
    pcs: 'pcs'
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      {unitSymbols[unit] || unit}
    </span>
  )
}

// ==================== PriceWithUnit Component ====================
const PriceWithUnit = ({ price, unit }: { price: number; unit: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className="font-mono">{money(price)}</span>
    <UnitBadge unit={unit} />
  </span>
)

// ==================== Modal Component ====================
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
    <AnimatePresence>
      {open && (
        <motion.div 
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/5 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div 
            className="absolute left-1/2 top-1/2 w-[min(500px,96vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.98, opacity: 0, y: 5 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 5 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200/50 dark:border-gray-800/50 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-medium text-gray-900 dark:text-white">{title}</h2>
                <motion.button 
                  className="w-6 h-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  onClick={onClose}
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </div>
              <div className="p-5 max-h-[calc(90vh-8rem)] overflow-auto custom-scrollbar">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Form Section Component ====================
const FormSection = ({ title, children }: { title?: string; children: ReactNode }) => (
  <div className="space-y-4">
    {title && (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800"></div>
      </div>
    )}
    <div className="space-y-4">
      {children}
    </div>
  </div>
)

// ==================== Form Field Component ====================
const FormField = ({ 
  label, 
  required, 
  children,
  hint,
  error
}: { 
  label: string
  required?: boolean
  children: ReactNode
  hint?: string
  error?: string
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {hint && <span className="text-[10px] text-gray-400 dark:text-gray-500">{hint}</span>}
    </div>
    {children}
    {error && <p className="text-[10px] text-red-500 dark:text-red-400">{error}</p>}
  </div>
)

// ==================== Table Row Component ====================
const IngredientTableRow = memo(function IngredientTableRow({
  r,
  isDebug,
  onEdit,
  onHardDelete,
}: {
  r: IngredientRow
  isDebug: boolean
  onEdit: (r: IngredientRow) => void
  onHardDelete: (id: string) => void
}) {
  const active = r.is_active !== false
  const net = toNum(r.net_unit_cost, 0)
  const unit = r.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)

  return (
    <motion.tr 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className={cls(
        'group border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors',
        !active && 'opacity-40'
      )}
    >
      <td className="px-3 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400">
        {r.code || '—'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-xs font-medium text-gray-900 dark:text-white",
            !active && "line-through"
          )}>
            {r.name ?? '—'}
          </span>
          {flag.level === 'warn' && (
            <span className="inline-flex items-center px-1 rounded text-[9px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20">
              unit?
            </span>
          )}
        </div>
        {isDebug && (
          <div className="text-[9px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
            {r.id.slice(0, 6)}...
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400">
        {r.category ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className="text-xs font-mono text-gray-900 dark:text-white">
          {Math.max(1, toNum(r.pack_size, 1))}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        <UnitBadge unit={unit} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <PriceWithUnit price={toNum(r.pack_price, 0)} unit={unit} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <PriceWithUnit price={net} unit={unit} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <motion.button 
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            type="button" 
            onClick={() => onEdit(r)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Edit"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </motion.button>
          <motion.button 
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
            type="button" 
            onClick={() => onHardDelete(r.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Delete"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </motion.button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Metric Component ====================
const Metric = memo(function Metric({ 
  label, 
  value, 
  sublabel 
}: { 
  label: string
  value: string | number
  sublabel: string
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-medium text-gray-900 dark:text-white mt-0.5">{value}</div>
      <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{sublabel}</div>
    </div>
  )
})

// ==================== UnitSelector Component ====================
const UnitSelector = ({ value, onChange }: { value: string; onChange: (unit: string) => void }) => {
  const units = [
    { value: 'g', label: 'g', full: 'gram' },
    { value: 'kg', label: 'kg', full: 'kilogram' },
    { value: 'ml', label: 'ml', full: 'milliliter' },
    { value: 'l', label: 'L', full: 'liter' },
    { value: 'pcs', label: 'pcs', full: 'pieces' },
  ]

  return (
    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {units.map((unit) => (
        <button
          key={unit.value}
          type="button"
          onClick={() => onChange(unit.value)}
          className={cls(
            "flex-1 px-2 py-1.5 text-xs font-mono rounded transition-all",
            value === unit.value
              ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
          )}
          title={unit.full}
        >
          {unit.label}
        </button>
      ))}
    </div>
  )
}

// ==================== Main Component ====================
export default function Ingredients() {
  const k = useKitchen()
  const canEditCodes = k.isOwner
  const isDebug =
    import.meta.env.DEV ||
    (() => {
      try {
        if (new URLSearchParams(window.location.search).has('debug')) return true
        const hash = window.location.hash || ''
        const qIdx = hash.indexOf('?')
        if (qIdx >= 0) {
          const hashParams = new URLSearchParams(hash.slice(qIdx + 1))
          if (hashParams.has('debug')) return true
        }
      } catch {
        // ignore
      }
      return false
    })()
  
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const loc = useLocation()

  // One-time search prefill from Command Palette
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('gc:prefill:ingredients')
      if (v && typeof v === 'string') {
        setSearch(v)
        sessionStorage.removeItem('gc:prefill:ingredients')
      }
    } catch {}
  }, [loc.pathname, loc.hash])

  const deferredSearch = useDeferredValue(search)
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'cost' | 'pack_price'>('name')

  const [kitchenId, setKitchenId] = useState<string | null>(null)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [fCode, setFCode] = useState('')
  const [fCodeCategory, setFCodeCategory] = useState('')
  const [fName, setFName] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fSupplier, setFSupplier] = useState('')

  // Required fields
  const [fPackSize, setFPackSize] = useState('1')
  const [fPackPrice, setFPackPrice] = useState('0')
  const [fPackUnit, setFPackUnit] = useState('g')
  const [fNetUnitCost, setFNetUnitCost] = useState('0')

  const [saving, setSaving] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)

  const progressiveRunRef = useRef<number>(0)

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

  const FIELDS =
    'id,code,code_category,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active'

  const PAGE_SIZE = 200

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)

    // cancel any in-flight progressive load
    const runId = Date.now()
    progressiveRunRef.current = runId

    try {
      await loadKitchen()

      let offset = 0
      let acc: IngredientRow[] = []

      while (true) {
        // If a newer load started, stop this one
        if (progressiveRunRef.current !== runId) return

        const { data, error } = await supabase
          .from('ingredients')
          .select(FIELDS)
          .order('name', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (error) throw error

        const chunk = ((data ?? []) as IngredientRow[]) || []
        acc = acc.concat(chunk)

        // Update UI progressively (fast first paint)
        setRows(acc)

        // Prime cache so other pages benefit without refetching within TTL
        primeIngredientsCache(acc as any)

        if (offset === 0) setLoading(false)

        if (!chunk.length || chunk.length < PAGE_SIZE) break

        offset += PAGE_SIZE

        // Yield to the browser so scrolling/typing stays responsive
        await new Promise((r) => setTimeout(r, 0))
      }

      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const normalized = useMemo(() => {
    return rows.filter((r) => (showInactive ? true : r.is_active !== false))
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
    const s = deferredSearch.trim().toLowerCase()
    let list = normalized.filter((r) => {
      const name = (r.name ?? '').toLowerCase()
      const sup = (r.supplier ?? '').toLowerCase()
      const okSearch = !s || name.includes(s) || sup.includes(s)
      const okCat = !category || (r.category ?? '') === category
      return okSearch && okCat
    })

    if (sortBy === 'name') {
      list = list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    } else if (sortBy === 'cost') {
      list = list.sort((a, b) => toNum(b.net_unit_cost, 0) - toNum(a.net_unit_cost, 0))
    } else {
      list = list.sort((a, b) => toNum(b.pack_price, 0) - toNum(a.pack_price, 0))
    }

    return list
  }, [normalized, deferredSearch, category, sortBy])

  const stats = useMemo(() => {
    const items = filtered.length
    const avgNet = items > 0 ? filtered.reduce((a, r) => a + toNum(r.net_unit_cost, 0), 0) / items : 0
    const maxPack = items > 0 ? Math.max(...filtered.map((r) => toNum(r.pack_price, 0))) : 0
    const missingCost = filtered.filter((r) => toNum(r.net_unit_cost, 0) <= 0).length
    const warnUnits = filtered.filter((r) => sanityFlag(toNum(r.net_unit_cost, 0), r.pack_unit ?? 'g').level === 'warn').length

    return { items, avgNet, maxPack, missingCost, warnUnits }
  }, [filtered])

  const openCreate = () => {
    setEditingId(null)
    setFCode('')
    setFCodeCategory('')
    setFName('')
    setFCategory('')
    setFSupplier('')
    setFPackSize('1')
    setFPackPrice('0')
    setFPackUnit('g')
    setFNetUnitCost('0')
    setModalOpen(true)
  }

  const openEdit = (r: IngredientRow) => {
    setEditingId(r.id)
    setFCode((r.code ?? '').toUpperCase())
    setFCodeCategory((r.code_category ?? '').toUpperCase())
    setFName(r.name ?? '')
    setFCategory(r.category ?? '')
    setFSupplier(r.supplier ?? '')
    setFPackSize(String(Math.max(1, toNum(r.pack_size, 1))))
    setFPackPrice(String(Math.max(0, toNum(r.pack_price, 0))))
    setFPackUnit(r.pack_unit ?? 'g')
    setFNetUnitCost(String(Math.max(0, toNum(r.net_unit_cost, 0))))
    setModalOpen(true)
  }

  const smartRecalcNetCost = () => {
    const ps = Math.max(1, toNum(fPackSize, 1))
    const pp = Math.max(0, toNum(fPackPrice, 0))
    const net = calcNetUnitCost(pp, ps)
    setFNetUnitCost(String(Math.round(net * 1000000) / 1000000))
    showToast('Net unit cost recalculated from pack')
  }

  const save = async () => {
    const name = fName.trim()
    if (!name) return showToast('Name is required')

    const codeInput = (fCode || '').trim().toUpperCase()
    if (codeInput && !codeInput.startsWith('ING-')) return showToast('Ingredient code must start with ING-')

    const codeCatInput = (fCodeCategory || '').trim().toUpperCase()
    if (codeCatInput) {
      const norm = codeCatInput.replace(/[^A-Z0-9]/g, '')
      if (!norm) return showToast('Code category must be A-Z/0-9')
      if (norm.length > 6) return showToast('Code category max 6 chars')
    }

    const packSize = Math.max(1, toNum(fPackSize, 1))
    const packPrice = Math.max(0, toNum(fPackPrice, 0))

    const unit = safeUnit(fPackUnit || 'g')
    const net = Math.max(0, toNum(fNetUnitCost, 0))

    // If user left net cost empty/zero, auto compute from pack
    const netFinal = net > 0 ? net : calcNetUnitCost(packPrice, packSize)

    setSaving(true)
    try {
      const payload: any = {
        code: (fCode || '').trim().toUpperCase() || null,
        code_category: (fCodeCategory || '').trim().toUpperCase() || null,
        name,
        category: fCategory.trim() || null,
        supplier: fSupplier.trim() || null,
        pack_size: packSize,
        pack_price: packPrice,
        pack_unit: unit,
        net_unit_cost: netFinal,
        is_active: true,
      }

      if (kitchenId) payload.kitchen_id = kitchenId

      if (editingId) {
        let { error } = await supabase.from('ingredients').update(payload).eq('id', editingId)
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error } = await supabase.from('ingredients').update(payload).eq('id', editingId))
        }
        if (error) throw error
        showToast('Ingredient updated')
      } else {
        let { error } = await supabase.from('ingredients').insert(payload)
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error } = await supabase.from('ingredients').insert(payload))
        }
        if (error) throw error
        showToast('Ingredient created')
      }

      setModalOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const suggestedCodeCategory = useMemo(() => {
    const raw = (fCategory || 'GEN').toUpperCase()
    const norm = raw.replace(/[^A-Z0-9]/g, '')
    return (norm || 'GEN').slice(0, 6)
  }, [fCategory])

  const deactivate = async (id: string) => {
    const ok = confirm('Deactivate ingredient? It will be hidden from pickers.')
    if (!ok) return
    const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
    if (error) return showToast(error.message)
    showToast('Ingredient deactivated')
    await load()
  }

  const restore = async (id: string) => {
    const { error } = await supabase.from('ingredients').update({ is_active: true }).eq('id', id)
    if (error) return showToast(error.message)
    showToast('Ingredient restored')
    await load()
  }

  const hardDelete = async (id: string) => {
    const ok = confirm('Delete ingredient permanently? This cannot be undone.')
    if (!ok) return

    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) {
      const msg = String((error as any).message || '')
      const code = String((error as any).code || '')
      if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
        return showToast('Cannot delete: this ingredient is used in recipes. Remove it from recipe lines first.')
      }
      return showToast(msg || 'Delete failed')
    }

    showToast('Ingredient deleted')
    await load()
  }

  const bulkRecalcNetCosts = async () => {
    if (filtered.length === 0) return
    const ok = confirm(`Recalculate net unit cost from pack price/size for ${filtered.length} items?`)
    if (!ok) return

    setBulkWorking(true)
    try {
      // Update sequentially to keep it simple and safe (no RPC required)
      for (const r of filtered) {
        const ps = Math.max(1, toNum(r.pack_size, 1))
        const pp = Math.max(0, toNum(r.pack_price, 0))
        const net = calcNetUnitCost(pp, ps)

        const { error } = await supabase.from('ingredients').update({ net_unit_cost: net }).eq('id', r.id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast('Bulk recalculation done')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Bulk recalculation failed')
    } finally {
      setBulkWorking(false)
    }
  }

  const bulkSetActive = async (active: boolean) => {
    if (filtered.length === 0) return
    const ok = confirm(`${active ? 'Activate' : 'Deactivate'} ${filtered.length} ingredients?`)
    if (!ok) return

    setBulkWorking(true)
    try {
      for (const r of filtered) {
        const { error } = await supabase.from('ingredients').update({ is_active: active }).eq('id', r.id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast('Bulk update done')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Bulk update failed')
    } finally {
      setBulkWorking(false)
    }
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { 
        staggerChildren: 0.03,
        delayChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
    }
  }

  return (
    <motion.div 
      className="min-h-screen bg-white dark:bg-gray-950"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-base font-medium text-gray-900 dark:text-white">
              Ingredients
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filtered.length} items
              </span>
              {stats.missingCost > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  • {stats.missingCost} missing cost
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <input 
                type="checkbox" 
                checked={showInactive} 
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/20 dark:border-gray-600"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Show inactive</span>
            </label>

            <div className="h-3 w-px bg-gray-200 dark:bg-gray-700"></div>

            <select 
              className="px-2 py-1 text-xs bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="name">Sort by name</option>
              <option value="cost">Sort by cost</option>
              <option value="pack_price">Sort by pack price</option>
            </select>

            <motion.button 
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors shadow-sm"
              type="button" 
              onClick={openCreate}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              + New
            </motion.button>
          </div>
        </motion.div>

        {/* Filters and Actions */}
        <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
          {/* Search */}
          <div className="flex-1 max-w-xs">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredients..."
              />
              {search && (
                <button 
                  type="button" 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setSearch('')}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <select 
            className="px-2 py-1.5 text-xs bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 ml-auto">
            <motion.button 
              className="px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              type="button" 
              onClick={bulkRecalcNetCosts} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Recalc
            </motion.button>
            <motion.button 
              className="px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              type="button" 
              onClick={() => bulkSetActive(true)} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Activate
            </motion.button>
            <motion.button 
              className="px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              type="button" 
              onClick={() => bulkSetActive(false)} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Deactivate
            </motion.button>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-8 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
          <Metric
            label="Items"
            value={stats.items}
            sublabel="filtered results"
          />
          <Metric
            label="Average net"
            value={money(stats.avgNet)}
            sublabel="per unit"
          />
          <Metric
            label="Missing cost"
            value={stats.missingCost}
            sublabel="items"
          />
          <Metric
            label="Warnings"
            value={stats.warnUnits}
            sublabel="unit mismatches"
          />
        </motion.div>

        {/* Loading/Error */}
        {loading && (
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="grid grid-cols-4 gap-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="border border-gray-100 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 flex items-center gap-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-32 flex-1" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {err && (
          <motion.div variants={itemVariants} className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md">
            <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
          </motion.div>
        )}

        {/* Table */}
        {!loading && !err && (
          <motion.div variants={itemVariants}>
            {filtered.length === 0 ? (
              <div className="py-12 text-center border border-gray-100 dark:border-gray-800 rounded-lg">
                <div className="text-3xl mb-3 opacity-20">🥗</div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                  {rows.length === 0 ? 'No ingredients' : 'No results'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {rows.length === 0 
                    ? 'Get started by adding your first ingredient'
                    : 'Try adjusting your filters'}
                </p>
                {rows.length === 0 && (
                  <motion.button 
                    className="mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
                    onClick={openCreate}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    + Add ingredient
                  </motion.button>
                )}
              </div>
            ) : (
              <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                      <th className="px-3 py-2 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                      <th className="px-3 py-2 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-3 py-2 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                      <th className="px-3 py-2 text-center text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack</th>
                      <th className="px-3 py-2 text-center text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                      <th className="px-3 py-2 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack Price</th>
                      <th className="px-3 py-2 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Cost</th>
                      <th className="px-3 py-2 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    <AnimatePresence>
                      {filtered.map((r) => (
                        <IngredientTableRow key={r.id} r={r} isDebug={isDebug} onEdit={openEdit} onHardDelete={hardDelete} />
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Modal - مع حل مشكلة الوحدات */}
        <Modal open={modalOpen} title={editingId ? 'Edit ingredient' : 'New ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-5">
            {/* Basic Info */}
            <FormSection>
              <FormField label="Name" required>
                <input
                  className="w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Category">
                  <input
                    className="w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </FormField>
                <FormField label="Supplier">
                  <input
                    className="w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Code Section */}
            <FormSection title="Code (optional)">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Code" hint="ING-000123">
                  <input
                    className={cls(
                      "w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors font-mono",
                      !canEditCodes && "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                </FormField>
                <FormField label="Category code" hint={`e.g. ${suggestedCodeCategory}`}>
                  <input
                    className={cls(
                      "w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors font-mono",
                      !canEditCodes && "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormField>
              </div>
              {!canEditCodes && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Code fields are owner-only</p>
              )}
            </FormSection>

            {/* Pack & Cost - مع حل مشكلة الوحدات */}
            <FormSection title="Pack & Cost">
              {/* Unit Selector - واضح في الأعلى */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Select unit for all measurements
                </label>
                <UnitSelector value={fPackUnit} onChange={setFPackUnit} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Pack size" required>
                  <div className="relative">
                    <input
                      className="w-full px-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                      {fPackUnit}
                    </span>
                  </div>
                </FormField>
                <FormField label="Unit" required>
                  <div className="h-full flex items-center">
                    <span className="text-sm font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 w-full">
                      {fPackUnit}
                    </span>
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Pack price" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input
                      className="w-full pl-7 pr-3 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                    />
                  </div>
                </FormField>
                <FormField label="Unit price" hint={`per ${fPackUnit}`}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input
                      className="w-full pl-7 pr-12 py-2 text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors font-mono"
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500">
                      /{fPackUnit}
                    </span>
                  </div>
                </FormField>
              </div>

              {/* Cost Preview - يظهر العلاقة بين القيم */}
              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="bg-blue-50 dark:bg-blue-500/5 p-3 rounded-lg border border-blue-100 dark:border-blue-500/20">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-700 dark:text-blue-400">Calculation preview:</span>
                    <span className="font-mono text-blue-900 dark:text-blue-300">
                      ${parseFloat(fPackPrice)} ÷ {parseFloat(fPackSize)} {fPackUnit} = ${(parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4)} /{fPackUnit}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <motion.button
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                  onClick={smartRecalcNetCost}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Recalculate unit price
                </motion.button>
              </div>
            </FormSection>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <motion.button
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                onClick={() => setModalOpen(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors shadow-sm"
                onClick={save}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? 'Saving...' : 'Save ingredient'}
              </motion.button>
            </div>
          </div>
        </Modal>

        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 9999px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4b5563;
        }
      `}</style>
    </motion.div>
  )
}
