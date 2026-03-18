import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'
import { motion, AnimatePresence } from 'framer-motion'

// Icons - يمكنك استخدام react-icons بدلاً من ذلك
const Icons = {
  Package: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  DollarSign: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  MoreVertical: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Loader: () => (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  Edit: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  Delete: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
}

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

// Modal محسن
const SlideOver = memo(function SlideOver({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col"
          >
            <div className="px-8 py-6 bg-gradient-to-r from-emerald-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                    {subtitle || 'INGREDIENT'}
                  </span>
                  <h2 className="mt-1 text-2xl font-bold text-gray-900">{title}</h2>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <Icons.X />
                </motion.button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})

// بطاقة KPI محسنة
const KPICard = memo(function KPICard({ 
  label, 
  value, 
  icon: Icon,
  gradient,
  trend 
}: { 
  label: string
  value: string | number
  icon: () => JSX.Element
  gradient: string
  trend?: { value: number; positive: boolean }
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className="group relative overflow-hidden rounded-2xl bg-white shadow-md hover:shadow-xl transition-all"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity`} />
      <div className="relative p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
            {trend && (
              <p className={cls(
                "mt-2 text-xs font-medium",
                trend.positive ? "text-emerald-600" : "text-red-600"
              )}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} bg-opacity-10`}>
            <Icon />
          </div>
        </div>
      </div>
    </motion.div>
  )
})

// صف الجدول المحسن
const IngredientTableRow = memo(function IngredientTableRow({
  r,
  isDebug,
  onEdit,
  onHardDelete,
  index
}: {
  r: IngredientRow
  isDebug: boolean
  onEdit: (r: IngredientRow) => void
  onHardDelete: (id: string) => void
  index: number
}) {
  const active = r.is_active !== false
  const net = toNum(r.net_unit_cost, 0)
  const unit = r.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)
  const [showActions, setShowActions] = useState(false)

  return (
    <motion.tr
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group hover:bg-gray-50 transition-colors relative"
      onHoverStart={() => setShowActions(true)}
      onHoverEnd={() => setShowActions(false)}
    >
      <td className="whitespace-nowrap px-6 py-4 text-sm">
        <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 font-mono text-xs text-gray-700 ring-1 ring-inset ring-gray-500/10">
          {r.code ?? '—'}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.1 }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"
          >
            <Icons.Package />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{r.name ?? '—'}</span>
              <AnimatePresence>
                {!active && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                  >
                    Inactive
                  </motion.span>
                )}
                {flag.level === 'warn' && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"
                  >
                    Unit warning
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {isDebug && <div className="mt-1 font-mono text-xs text-gray-400">ID: {r.id}</div>}
            {flag.level === 'warn' && <div className="mt-1 text-xs text-amber-600">{flag.msg}</div>}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{r.category ?? '—'}</td>
      <td className="whitespace-nowrap px-6 py-4 text-center font-mono text-sm text-gray-900">
        {Math.max(1, toNum(r.pack_size, 1))}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-600">{unit}</td>
      <td className="whitespace-nowrap px-6 py-4 text-center font-mono text-sm font-medium text-gray-900">
        {money(toNum(r.pack_price, 0))}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center font-mono text-sm font-medium text-gray-900">
        <span className={cls(
          flag.level === 'warn' && 'text-amber-600',
          flag.level === 'missing' && 'text-gray-400'
        )}>
          {money(net)}
        </span>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-center text-sm">
        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center justify-end gap-2"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                onClick={() => onEdit(r)}
              >
                <Icons.Edit />
                <span className="ml-1.5">Edit</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50"
                onClick={() => onHardDelete(r.id)}
              >
                <Icons.Delete />
                <span className="ml-1.5">Delete</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </td>
    </motion.tr>
  )
})

// الفلاتر على شكل Chips
const FilterChip = memo(function FilterChip({ 
  label, 
  active, 
  onClick 
}: { 
  label: string
  active: boolean
  onClick: () => void 
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cls(
        "px-4 py-2 rounded-full text-sm font-medium transition-all",
        active 
          ? "bg-emerald-600 text-white shadow-md"
          : "bg-white text-gray-600 hover:bg-gray-100 shadow-sm ring-1 ring-gray-200"
      )}
      onClick={onClick}
    >
      {label}
    </motion.button>
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

  const FIELDS = 'id,code,code_category,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active'
  const PAGE_SIZE = 200

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)

    const runId = Date.now()
    progressiveRunRef.current = runId

    try {
      await loadKitchen()

      let offset = 0
      let acc: IngredientRow[] = []

      while (true) {
        if (progressiveRunRef.current !== runId) return

        const { data, error } = await supabase
          .from('ingredients')
          .select(FIELDS)
          .order('name', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (error) throw error

        const chunk = ((data ?? []) as IngredientRow[]) || []
        acc = acc.concat(chunk)

        setRows(acc)
        primeIngredientsCache(acc as any)

        if (offset === 0) setLoading(false)

        if (!chunk.length || chunk.length < PAGE_SIZE) break

        offset += PAGE_SIZE
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
      const code = (r.code ?? '').toLowerCase()
      const sup = (r.supplier ?? '').toLowerCase()
      const okSearch = !s || name.includes(s) || code.includes(s) || sup.includes(s)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="h-8 w-1 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-full"
                />
                <span className="text-sm font-medium text-emerald-600 tracking-wider">
                  INGREDIENT DATABASE
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Kitchen Inventory
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Search, filter, sort, validate costs, and manage ingredients.
              </p>
            </div>

            {/* Quick stats badges */}
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="px-4 py-2 bg-white rounded-2xl shadow-sm ring-1 ring-gray-200"
              >
                <span className="text-sm text-gray-600">Total</span>
                <span className="ml-2 text-lg font-semibold text-gray-900">{rows.length}</span>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="px-4 py-2 bg-amber-50 rounded-2xl shadow-sm ring-1 ring-amber-200"
              >
                <span className="text-sm text-amber-700">Needs Review</span>
                <span className="ml-2 text-lg font-semibold text-amber-700">{stats.warnUnits}</span>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Command Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex items-center gap-2 bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-2"
        >
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
            <Icons.Search />
            <input
              type="text"
              placeholder="Search ingredients, codes, suppliers..."
              className="flex-1 bg-transparent border-0 focus:ring-0 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setSearch('')}
              >
                <Icons.X />
              </motion.button>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              onClick={load}
              title="Refresh"
            >
              <Icons.Refresh />
            </motion.button>
            
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="Bulk actions"
              >
                <Icons.MoreVertical />
              </motion.button>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="ml-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2"
              onClick={openCreate}
            >
              <Icons.Plus />
              <span>Add ingredient</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6 flex items-center gap-3"
        >
          <span className="text-sm font-medium text-gray-500">Filter by:</span>
          
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="All"
              active={category === ''}
              onClick={() => setCategory('')}
            />
            {categories.slice(0, 5).map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              />
            ))}
          </div>
          
          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Show inactive
            </label>
            
            <select
              className="px-3 py-2 bg-white rounded-xl text-sm border-0 ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="name">Sort by name</option>
              <option value="cost">Sort by cost ↓</option>
              <option value="pack_price">Sort by price ↓</option>
            </select>
          </div>
        </motion.div>

        {/* KPI Cards */}
        {!loading && !err && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
          >
            <KPICard
              label="Total Items"
              value={stats.items}
              icon={Icons.Package}
              gradient="from-blue-500 to-blue-600"
              trend={{ value: 12, positive: true }}
            />
            <KPICard
              label="Avg Cost"
              value={money(stats.avgNet)}
              icon={Icons.DollarSign}
              gradient="from-emerald-500 to-emerald-600"
            />
            <KPICard
              label="Missing Cost"
              value={stats.missingCost}
              icon={Icons.AlertCircle}
              gradient="from-amber-500 to-amber-600"
              trend={{ value: stats.missingCost > 0 ? 5 : 0, positive: false }}
            />
            <KPICard
              label="Need Review"
              value={stats.warnUnits}
              icon={Icons.Shield}
              gradient="from-purple-500 to-purple-600"
            />
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* KPI Skeletons */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="mt-3 h-8 w-32 rounded-lg" />
                  <Skeleton className="mt-2 h-3 w-24 rounded" />
                </div>
              ))}
            </div>

            {/* Table Skeleton */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-8 w-32 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24 rounded" />
                    <Skeleton className="h-4 flex-1 rounded" />
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-4 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {err && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-red-50 p-6 ring-1 ring-inset ring-red-600/20"
          >
            <div className="flex items-center gap-3">
              <Icons.AlertCircle />
              <span className="text-sm font-medium text-red-800">{err}</span>
            </div>
          </motion.div>
        )}

        {/* Main Content */}
        {!loading && !err && (
          <>
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16"
              >
                <div className="relative mx-auto w-48 h-48 mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-100 to-emerald-50 rounded-full animate-pulse" />
                  <div className="relative flex items-center justify-center h-full">
                    <Icons.Package />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {rows.length === 0 ? 'No ingredients yet' : 'No ingredients found'}
                </h3>
                <p className="text-gray-500 mb-8 max-w-md mx-auto">
                  {rows.length === 0
                    ? 'Start building your kitchen database by adding your first ingredient.'
                    : 'No ingredients match your current search/filters.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {rows.length > 0 && normalized.length === 0 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
                      onClick={() => setShowInactive(true)}
                    >
                      Show inactive
                    </motion.button>
                  )}
                  {(search.trim() || category) && rows.length > 0 && normalized.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
                      onClick={() => {
                        setSearch('')
                        setCategory('')
                      }}
                    >
                      Clear filters
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-3 bg-white text-gray-700 rounded-xl shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 transition-colors"
                    onClick={openCreate}
                  >
                    + Add ingredient
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 overflow-hidden"
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="px-6 py-4 text-left">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Code</span>
                        </th>
                        <th className="px-6 py-4 text-left">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ingredient</span>
                        </th>
                        <th className="px-6 py-4 text-left">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Category</span>
                        </th>
                        <th className="px-6 py-4 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pack</span>
                        </th>
                        <th className="px-6 py-4 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Unit</span>
                        </th>
                        <th className="px-6 py-4 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pack Price</span>
                        </th>
                        <th className="px-6 py-4 text-center">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Net Cost</span>
                        </th>
                        <th className="px-6 py-4 text-right">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filtered.map((r, index) => (
                        <IngredientTableRow
                          key={r.id}
                          r={r}
                          isDebug={isDebug}
                          onEdit={openEdit}
                          onHardDelete={hardDelete}
                          index={index}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Table Footer */}
                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-medium text-gray-900">{filtered.length}</span> of{' '}
                    <span className="font-medium text-gray-900">{rows.length}</span> ingredients
                  </p>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Icons.ChevronLeft />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Icons.ChevronRight />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Slide Over Modal */}
        <SlideOver
          open={modalOpen}
          title={editingId ? fName || 'Edit Ingredient' : 'Add New Ingredient'}
          subtitle={editingId ? 'Edit' : 'Create'}
          onClose={() => setModalOpen(false)}
        >
          <div className="space-y-8">
            {/* Identification Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                IDENTIFICATION
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CODE</label>
                  <input
                    className={cls(
                      "w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all",
                      !canEditCodes && "bg-gray-50 text-gray-500"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123 (optional)"
                    disabled={!canEditCodes}
                  />
                  <p className="mt-1 text-xs text-gray-500">Must start with ING- if provided</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CODE CATEGORY</label>
                  <input
                    className={cls(
                      "w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all",
                      !canEditCodes && "bg-gray-50 text-gray-500"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={`e.g. ${suggestedCodeCategory}`}
                    disabled={!canEditCodes}
                  />
                  <p className="mt-1 text-xs text-gray-500">Max 6 chars A–Z/0–9</p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">NAME *</label>
                <input
                  className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g., Organic All-Purpose Flour"
                />
              </div>
            </motion.div>

            {/* Classification Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                CLASSIFICATION
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CATEGORY</label>
                  <input
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g., Baking"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SUPPLIER</label>
                  <input
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g., King Arthur"
                  />
                </div>
              </div>
            </motion.div>

            {/* Pack Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                PACK DETAILS
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PACK SIZE *</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fPackSize}
                    onChange={(e) => setFPackSize(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UNIT</label>
                  <select
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fPackUnit}
                    onChange={(e) => setFPackUnit(e.target.value)}
                  >
                    <option value="g">grams (g)</option>
                    <option value="kg">kilograms (kg)</option>
                    <option value="ml">milliliters (ml)</option>
                    <option value="l">liters (L)</option>
                    <option value="pcs">pieces (pcs)</option>
                  </select>
                </div>
              </div>
            </motion.div>

            {/* Cost Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                COST INFORMATION
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PACK PRICE *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fPackPrice}
                    onChange={(e) => setFPackPrice(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NET UNIT COST</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    className="w-full rounded-xl border-0 py-2.5 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 transition-all"
                    value={fNetUnitCost}
                    onChange={(e) => setFNetUnitCost(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">If 0 → auto-calculated from pack</p>
                </div>
              </div>
            </motion.div>

            {/* Smart Helpers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/50 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700">⚡ SMART HELPERS</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 transition-all"
                  onClick={smartRecalcNetCost}
                >
                  <Icons.Refresh />
                  Recalculate from pack
                </motion.button>
              </div>
              <p className="mt-2 text-xs text-emerald-600">
                net = pack_price ÷ pack_size — Auto-calculates if net cost is zero
              </p>
            </motion.div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-2.5 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50"
                onClick={save}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Icons.Loader />
                    Saving...
                  </>
                ) : (
                  <>
                    <Icons.Check />
                    Save ingredient
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </SlideOver>

        {/* Toast Notification */}
        <Toast 
          open={toastOpen} 
          message={toastMsg} 
          onClose={() => setToastOpen(false)} 
        />
      </div>
    </div>
  )
}
