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

// ==================== Modern Modal Component ====================
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div 
            className="absolute left-1/2 top-1/2 w-[min(1000px,96vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200/80 dark:border-gray-800/80">
              <div className="flex items-start justify-between gap-4 p-8 pb-6 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1.5">INGREDIENT</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{title}</div>
                </div>
                <motion.button 
                  className="w-10 h-10 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  onClick={onClose}
                  type="button"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </div>
              <div className="p-8 pt-6 overflow-auto">{children}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Premium Table Row Component ====================
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
      className={cls(
        "group transition-colors",
        !active && 'opacity-50'
      )}
    >
      <td className="px-6 py-4">
        <span className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50">
          {r.code ? (
            <>
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
              {r.code}
            </>
          ) : '—'}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-gray-900 dark:text-white">{r.name ?? '—'}</span>
            {!active && (
              <span className="px-2.5 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium">
                Inactive
              </span>
            )}
            {flag.level === 'warn' && (
              <span className="px-2.5 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-xl flex items-center gap-1.5 font-medium">
                <span className="text-amber-500">⚠️</span>
                Unit warning
              </span>
            )}
          </div>
          {isDebug && <div className="text-xs text-gray-500 dark:text-gray-500 font-mono">ID: {r.id}</div>}
          {flag.level === 'warn' && (
            <div className="text-xs text-amber-600 dark:text-amber-400">{flag.msg}</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-gray-600 dark:text-gray-400 font-medium">{r.category ?? '—'}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="font-mono text-gray-900 dark:text-white font-semibold text-lg">{Math.max(1, toNum(r.pack_size, 1))}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="inline-flex px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50 uppercase tracking-wider">
          {unit}
        </span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="font-semibold text-primary-600 dark:text-primary-400 text-lg">{money(toNum(r.pack_price, 0))}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="font-semibold text-gray-900 dark:text-white text-lg">{money(net)}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
          <motion.button 
            className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all"
            type="button" 
            onClick={() => onEdit(r)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Edit ingredient"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </motion.button>
          <motion.button 
            className="p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-all"
            type="button" 
            onClick={() => onHardDelete(r.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Delete ingredient"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </motion.button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Elegant Stats Card Component ====================
const StatsCard = memo(function StatsCard({ 
  label, 
  value, 
  sublabel, 
  icon,
  trend 
}: { 
  label: string
  value: string | number
  sublabel: string
  icon: ReactNode
  trend?: { value: number; positive: boolean }
}) {
  return (
    <motion.div 
      className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-800/80 shadow-lg hover:shadow-xl transition-all duration-300"
      whileHover={{ y: -4 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
            {label}
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{value}</span>
            {trend && (
              <span className={cls(
                "text-sm font-semibold px-2 py-1 rounded-xl",
                trend.positive ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : 
                                 "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
              )}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-500">{sublabel}</div>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
          {icon}
        </div>
      </div>
    </motion.div>
  )
})

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
    showToast('Net Unit Cost recalculated from Pack')
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
    const ok = confirm(`Recalculate net_unit_cost from pack_price/pack_size for ${filtered.length} items?`)
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
      transition: { staggerChildren: 0.08 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      className="gc-ingredients max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-gray-50/50 dark:bg-gray-950/50 min-h-screen"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="mb-8">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-200/80 dark:border-gray-800/80">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-4 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-xs font-bold rounded-2xl uppercase tracking-wider">
                  INGREDIENTS — PRO
                </span>
                {isDebug && kitchenId && (
                  <span className="px-4 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-mono rounded-2xl">
                    Kitchen: {kitchenId.slice(0, 8)}...
                  </span>
                )}
              </div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Database</h1>
              <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl">Search, filter, sort, validate costs, and manage ingredients with precision.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2.5 px-5 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-all border border-gray-200/50 dark:border-gray-700/50">
                <input 
                  type="checkbox" 
                  checked={showInactive} 
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="w-4 h-4 rounded-lg border-gray-400 text-primary-600 focus:ring-primary-500"
                />
                <span>Show inactive</span>
              </label>

              <motion.button 
                className="px-5 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all border border-gray-200/50 dark:border-gray-700/50"
                type="button" 
                onClick={bulkRecalcNetCosts} 
                disabled={bulkWorking}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {bulkWorking ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Working...
                  </span>
                ) : 'Recalc net cost'}
              </motion.button>

              <motion.button 
                className="px-5 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all border border-gray-200/50 dark:border-gray-700/50"
                type="button" 
                onClick={() => bulkSetActive(true)} 
                disabled={bulkWorking}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Activate
              </motion.button>

              <motion.button 
                className="px-5 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all border border-gray-200/50 dark:border-gray-700/50"
                type="button" 
                onClick={() => bulkSetActive(false)} 
                disabled={bulkWorking}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Deactivate
              </motion.button>

              <motion.button 
                className="px-6 py-3 bg-primary-600 text-white rounded-2xl text-sm font-semibold shadow-lg shadow-primary-600/20 hover:shadow-xl hover:bg-primary-700 transition-all flex items-center gap-2"
                type="button" 
                onClick={openCreate}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add ingredient
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="mb-8">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-800/80 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Search */}
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2.5">
                Search products & suppliers
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  className="w-full pl-11 pr-12 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all text-base"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or supplier..."
                />
                {search && (
                  <motion.button 
                    type="button" 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl w-6 h-6 flex items-center justify-center"
                    onClick={() => setSearch('')}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    ×
                  </motion.button>
                )}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2.5">
                Category
              </label>
              <select 
                className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all text-base appearance-none cursor-pointer"
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1.2rem'
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2.5">
                Sort by
              </label>
              <select 
                className="w-full px-4 py-3.5 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all text-base appearance-none cursor-pointer"
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1.2rem'
                }}
              >
                <option value="name">Name (A → Z)</option>
                <option value="cost">Net Unit Cost (High → Low)</option>
                <option value="pack_price">Pack Price (High → Low)</option>
              </select>
            </div>
          </div>

          {/* Active filters */}
          {(search || category) && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm text-gray-500 dark:text-gray-500 font-medium">Active filters:</span>
                {search && (
                  <span className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-sm rounded-xl flex items-center gap-2 border border-primary-200/50 dark:border-primary-800/50">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    "{search}"
                    <motion.button 
                      onClick={() => setSearch('')} 
                      className="ml-1 hover:bg-primary-200 dark:hover:bg-primary-800 rounded-lg w-5 h-5 flex items-center justify-center"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ×
                    </motion.button>
                  </span>
                )}
                {category && (
                  <span className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 text-sm rounded-xl flex items-center gap-2 border border-primary-200/50 dark:border-primary-800/50">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                    </svg>
                    {category}
                    <motion.button 
                      onClick={() => setCategory('')} 
                      className="ml-1 hover:bg-primary-200 dark:hover:bg-primary-800 rounded-lg w-5 h-5 flex items-center justify-center"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ×
                    </motion.button>
                  </span>
                )}
                {(search || category) && (
                  <motion.button 
                    onClick={() => { setSearch(''); setCategory(''); }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Clear all
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Loading/Error */}
      {loading && (
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-9 w-28 mb-2" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-lg">
            <Skeleton className="h-5 w-48 mb-5" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {err && (
        <motion.div 
          variants={itemVariants} 
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 text-red-700 dark:text-red-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-semibold text-lg">{err}</span>
          </div>
        </motion.div>
      )}

      {/* Body */}
      {!loading && !err && (
        <>
          {/* KPIs */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatsCard
              label="ITEMS"
              value={stats.items}
              sublabel="Filtered results"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
            />
            <StatsCard
              label="AVG NET UNIT"
              value={money(stats.avgNet)}
              sublabel="Average net unit cost"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            />
            <StatsCard
              label="MISSING COST"
              value={stats.missingCost}
              sublabel="net_unit_cost = 0"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              trend={stats.missingCost > 0 ? { value: stats.missingCost, positive: false } : undefined}
            />
            <StatsCard
              label="UNIT WARNINGS"
              value={stats.warnUnits}
              sublabel="Possible unit mismatch"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              trend={stats.warnUnits > 0 ? { value: stats.warnUnits, positive: false } : undefined}
            />
          </motion.div>

          {/* Table */}
          <motion.div variants={itemVariants} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200/80 dark:border-gray-800/80 shadow-xl overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/50">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                  INGREDIENTS LIST
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1.5">Click Edit to validate pack + cost calculations</p>
              </div>
              <motion.button 
                className="px-5 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center gap-2 border border-gray-200/50 dark:border-gray-700/50"
                onClick={load}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Refresh
              </motion.button>
            </div>

            {filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-28 h-28 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center text-4xl border border-gray-200 dark:border-gray-700">
                  🧂
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {rows.length === 0
                    ? 'No ingredients yet'
                    : normalized.length === 0
                      ? 'No active ingredients'
                      : 'No ingredients found'}
                </h3>
                <p className="text-base text-gray-500 dark:text-gray-500 max-w-md mx-auto mb-8">
                  {rows.length === 0
                    ? 'Start your kitchen database by adding your first ingredient.'
                    : normalized.length === 0
                      ? 'All ingredients are currently inactive. Turn on “Show inactive” to manage them.'
                      : 'Try adjusting your search or filters to find what you need.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {rows.length === 0 ? (
                    <motion.button 
                      className="px-6 py-3 bg-primary-600 text-white rounded-xl text-base font-semibold shadow-lg hover:shadow-xl hover:bg-primary-700 transition-all flex items-center gap-2"
                      onClick={openCreate}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add ingredient
                    </motion.button>
                  ) : normalized.length === 0 ? (
                    <>
                      <motion.button 
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl text-base font-semibold shadow-lg hover:shadow-xl hover:bg-primary-700 transition-all"
                        onClick={() => setShowInactive(true)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Show inactive
                      </motion.button>
                      <motion.button 
                        className="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-base font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                        onClick={openCreate}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        + Add ingredient
                      </motion.button>
                    </>
                  ) : (
                    <>
                      <motion.button 
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl text-base font-semibold shadow-lg hover:shadow-xl hover:bg-primary-700 transition-all"
                        onClick={() => { setSearch(''); setCategory(''); }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Clear filters
                      </motion.button>
                      <motion.button 
                        className="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-base font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                        onClick={openCreate}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        + Add ingredient
                      </motion.button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px]">
                  <thead>
                    <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Pack</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Pack Price</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Net Unit Cost</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
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
        </>
      )}

      {/* Modal */}
      <Modal open={modalOpen} title={editingId ? 'Edit Ingredient' : 'Add Ingredient'} onClose={() => setModalOpen(false)}>
        <div className="space-y-8">
          {/* IDENTIFICATION */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              IDENTIFICATION
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CODE</label>
                <input
                  className={cls(
                    "w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all",
                    !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                  )}
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="ING-000123"
                  disabled={!canEditCodes}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Leave empty to auto-generate. Must start with ING-</p>
                {!canEditCodes && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Code fields are Owner-only.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CODE CATEGORY</label>
                <input
                  className={cls(
                    "w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all",
                    !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                  )}
                  value={fCodeCategory}
                  onChange={(e) => setFCodeCategory(e.target.value)}
                  placeholder={`e.g. ${suggestedCodeCategory}`}
                  disabled={!canEditCodes}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Optional (max 6 chars). If empty, uses Category.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">NAME *</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </div>
            </div>
          </div>

          {/* CLASSIFICATION */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              CLASSIFICATION
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CATEGORY</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  placeholder="e.g. Oils & Fats"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SUPPLIER</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  value={fSupplier}
                  onChange={(e) => setFSupplier(e.target.value)}
                  placeholder="e.g. Sysco"
                />
              </div>
            </div>
          </div>

          {/* PACK */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              PACK
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PACK SIZE *</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  type="number"
                  min={1}
                  step="1"
                  value={fPackSize}
                  onChange={(e) => setFPackSize(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">UNIT *</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all appearance-none cursor-pointer"
                  value={fPackUnit}
                  onChange={(e) => setFPackUnit(e.target.value)}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    backgroundSize: '1.2rem'
                  }}
                >
                  <option value="g">g (gram)</option>
                  <option value="kg">kg (kilogram)</option>
                  <option value="ml">ml (milliliter)</option>
                  <option value="l">L (liter)</option>
                  <option value="pcs">pcs (pieces)</option>
                </select>
              </div>
            </div>
          </div>

          {/* COST */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
              COST
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PACK PRICE *</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  type="number"
                  step="0.01"
                  value={fPackPrice}
                  onChange={(e) => setFPackPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">NET UNIT COST</label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  type="number"
                  step="0.000001"
                  value={fNetUnitCost}
                  onChange={(e) => setFNetUnitCost(e.target.value)}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">If left 0 → auto-calculated from pack</p>
              </div>
            </div>
          </div>

          {/* Smart Helpers */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-2xl p-6 border border-gray-200/80 dark:border-gray-700/80">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">SMART HELPERS:</span>
              <motion.button
                className="px-5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm flex items-center gap-2"
                onClick={smartRecalcNetCost}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4-3-9s1.34-9 3-9" />
                </svg>
                Recalculate net cost
              </motion.button>
              <span className="text-sm text-gray-500 dark:text-gray-500 bg-white/50 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl">net = pack_price ÷ pack_size</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-800">
            <motion.button
              className="px-6 py-3 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
              onClick={() => setModalOpen(false)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              className="px-8 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary-600/20 hover:shadow-xl hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={save}
              disabled={saving}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : 'Save'}
            </motion.button>
          </div>
        </div>
      </Modal>

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </motion.div>
  )
}
