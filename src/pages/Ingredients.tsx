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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
          <motion.div 
            className="absolute left-1/2 top-1/2 w-[min(1000px,96vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.95, opacity: 0, rotateX: -15 }}
            animate={{ scale: 1, opacity: 1, rotateX: 0 }}
            exit={{ scale: 0.95, opacity: 0, rotateX: 15 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
          >
            <div className="relative">
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl animate-pulse"></div>
              
              {/* Main modal content */}
              <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-white/20 dark:border-gray-800/50 overflow-hidden backdrop-blur-xl">
                {/* Dynamic gradient header */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90"></div>
                <div className="absolute top-0 left-0 right-0 h-32 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/30 to-transparent"></div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4 p-8 pb-4">
                    <div>
                      <div className="inline-flex items-center gap-2 mb-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                        </span>
                        <span className="text-sm font-bold text-white/90 uppercase tracking-[0.3em]">INGREDIENT STUDIO</span>
                      </div>
                      <h2 className="text-4xl font-black text-white">{title}</h2>
                    </div>
                    <motion.button 
                      className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md hover:bg-white/20 flex items-center justify-center text-white border border-white/20"
                      onClick={onClose}
                      type="button"
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </motion.button>
                  </div>
                  
                  <div className="p-8 pt-4 max-h-[70vh] overflow-auto custom-scrollbar bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      whileHover={{ 
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
        transition: { duration: 0.2 }
      }}
      className={cls(
        'group relative cursor-pointer transition-colors',
        !active && 'opacity-40'
      )}
    >
      {/* Animated selection indicator */}
      <td className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-top"></td>
      
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 group-hover:scale-150 transition-transform"></div>
          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
            {r.code ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                {r.code}
              </span>
            ) : '—'}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">{r.name ?? '—'}</span>
            {!active && (
              <span className="px-3 py-1 text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full uppercase tracking-wider">
                DRAFT
              </span>
            )}
            {flag.level === 'warn' && (
              <span className="px-3 py-1 text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center gap-1 uppercase tracking-wider">
                <span className="text-amber-500 text-base">⚠</span>
                ATTENTION
              </span>
            )}
          </div>
          {isDebug && (
            <div className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg inline-block">
              ID: {r.id.slice(0, 8)}...
            </div>
          )}
          {flag.level === 'warn' && (
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">{flag.msg}</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-gray-600 dark:text-gray-300 font-medium">{r.category ?? '—'}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="font-mono font-bold text-gray-900 dark:text-white text-lg">{Math.max(1, toNum(r.pack_size, 1))}</span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="inline-flex px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-2xl text-sm font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          {unit}
        </span>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
          {money(toNum(r.pack_price, 0))}
        </span>
      </td>
      <td className="px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="font-black text-gray-900 dark:text-white text-lg">{money(net)}</span>
          {flag.level === 'warn' && (
            <span className="text-amber-500 text-sm font-bold" title={flag.msg}>⚠</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          <motion.button 
            className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
            type="button" 
            onClick={() => onEdit(r)}
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            title="Edit ingredient"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </motion.button>
          <motion.button 
            className="p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 border border-gray-200 dark:border-gray-700 hover:border-rose-300 dark:hover:border-rose-700 transition-all"
            type="button" 
            onClick={() => onHardDelete(r.id)}
            whileHover={{ scale: 1.1, rotate: -5 }}
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

// ==================== Stats Card Component ====================
const StatsCard = memo(function StatsCard({ 
  label, 
  value, 
  sublabel, 
  icon,
  trend,
  gradient = 'from-indigo-500 to-purple-500'
}: { 
  label: string
  value: string | number
  sublabel: string
  icon: ReactNode
  trend?: { value: number; positive: boolean }
  gradient?: string
}) {
  return (
    <motion.div 
      className="group relative overflow-hidden"
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      {/* Animated background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500 rounded-3xl`}></div>
      
      {/* Card content */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-xl hover:shadow-2xl transition-shadow">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2">
                {label}
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{value}</span>
                {trend && (
                  <span className={cls(
                    "px-2 py-1 text-xs font-bold rounded-lg",
                    trend.positive 
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" 
                      : "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30"
                  )}>
                    {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
                  </span>
                )}
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all">
              {icon}
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">{sublabel}</div>
        </div>
      </div>
    </motion.div>
  )
})

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
      transition: { 
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 25 }
    }
  }

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Dynamic background grid */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#6366f1_0%,_transparent_50%),_radial-gradient(ellipse_at_bottom_left,_#a855f7_0%,_transparent_50%)] opacity-5"></div>
        <div className="absolute inset-0" style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: '30px 30px'
        }}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-12">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-1 shadow-2xl">
            {/* Animated border */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"></div>
            
            {/* Main content */}
            <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8">
              {/* Floating elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -ml-10 -mb-10"></div>
              
              <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="absolute -top-1 -right-1 w-3 h-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </div>
                    </div>
                    <div>
                      <h1 className="text-5xl font-black text-white tracking-tight">Ingredients</h1>
                      <p className="text-lg text-white/80 mt-1">Studio · Database · Management</p>
                    </div>
                  </div>
                  
                  {isDebug && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/20 backdrop-blur-md rounded-2xl text-white/90 text-sm font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Kitchen ID: {kitchenId?.slice(0, 8) ?? '—'}...
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-md rounded-2xl text-white cursor-pointer hover:bg-white/20 transition-all border border-white/20">
                    <input 
                      type="checkbox" 
                      checked={showInactive} 
                      onChange={(e) => setShowInactive(e.target.checked)}
                      className="w-5 h-5 rounded-lg border-white/30 bg-white/10 text-indigo-600 focus:ring-white"
                    />
                    <span className="font-medium">Show drafts</span>
                  </label>

                  <motion.button 
                    className="px-5 py-3 bg-white/10 backdrop-blur-md rounded-2xl text-sm font-medium hover:bg-white/20 transition-all border border-white/20 disabled:opacity-50 flex items-center gap-2"
                    type="button" 
                    onClick={bulkRecalcNetCosts} 
                    disabled={bulkWorking}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    {bulkWorking ? 'Processing...' : 'Recalc net'}
                  </motion.button>

                  <motion.button 
                    className="px-5 py-3 bg-white/10 backdrop-blur-md rounded-2xl text-sm font-medium hover:bg-white/20 transition-all border border-white/20 disabled:opacity-50"
                    type="button" 
                    onClick={() => bulkSetActive(true)} 
                    disabled={bulkWorking}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Activate
                  </motion.button>

                  <motion.button 
                    className="px-5 py-3 bg-white/10 backdrop-blur-md rounded-2xl text-sm font-medium hover:bg-white/20 transition-all border border-white/20 disabled:opacity-50"
                    type="button" 
                    onClick={() => bulkSetActive(false)} 
                    disabled={bulkWorking}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Draft
                  </motion.button>

                  <motion.button 
                    className="px-6 py-3 bg-white text-indigo-600 rounded-2xl text-sm font-bold shadow-xl hover:shadow-2xl transition-all flex items-center gap-2"
                    type="button" 
                    onClick={openCreate}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New ingredient
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="relative group">
            {/* Animated border */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl opacity-0 group-hover:opacity-100 blur transition duration-500"></div>
            
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Search */}
                <div>
                  <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Search
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                      className="w-full pl-11 pr-12 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search ingredients..."
                    />
                    {search && (
                      <motion.button 
                        type="button" 
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-full w-6 h-6 flex items-center justify-center"
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
                  <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Category
                  </label>
                  <div className="relative">
                    <select 
                      className="w-full px-4 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all appearance-none text-lg"
                      value={category} 
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236366f1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundPosition: 'right 1rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Sort by
                  </label>
                  <div className="relative">
                    <select 
                      className="w-full px-4 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all appearance-none text-lg"
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value as any)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236366f1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundPosition: 'right 1rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value="name">Name (A → Z)</option>
                      <option value="cost">Net Unit Cost (High → Low)</option>
                      <option value="pack_price">Pack Price (High → Low)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Active filters */}
              {(search || category) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active:</span>
                    {search && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-sm font-bold rounded-xl border border-indigo-200 dark:border-indigo-800">
                        <span>🔍</span>
                        {search}
                        <button onClick={() => setSearch('')} className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-300">×</button>
                      </span>
                    )}
                    {category && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-sm font-bold rounded-xl border border-indigo-200 dark:border-indigo-800">
                        <span>📁</span>
                        {category}
                        <button onClick={() => setCategory('')} className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-300">×</button>
                      </span>
                    )}
                    {(search || category) && (
                      <motion.button 
                        onClick={() => { setSearch(''); setCategory(''); }}
                        className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white underline underline-offset-4"
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
          </div>
        </motion.div>

        {/* Loading/Error */}
        {loading && (
          <motion.div variants={itemVariants} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-10 w-32 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800">
              <Skeleton className="h-6 w-48 mb-6" />
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-6">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 flex-1" />
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {err && (
          <motion.div variants={itemVariants} className="bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-200 dark:border-rose-800 rounded-2xl p-8">
            <div className="flex items-center gap-4 text-rose-700 dark:text-rose-400">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-2xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-black mb-1">Error loading ingredients</h3>
                <p className="text-sm font-medium">{err}</p>
              </div>
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
                gradient="from-indigo-500 to-purple-500"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
              <StatsCard
                label="AVG NET UNIT"
                value={money(stats.avgNet)}
                sublabel="Average net unit cost"
                gradient="from-purple-500 to-pink-500"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              />
              <StatsCard
                label="MISSING COST"
                value={stats.missingCost}
                sublabel="net_unit_cost = 0"
                gradient="from-pink-500 to-rose-500"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                trend={stats.missingCost > 0 ? { value: stats.missingCost, positive: false } : undefined}
              />
              <StatsCard
                label="UNIT WARNINGS"
                value={stats.warnUnits}
                sublabel="Possible unit mismatch"
                gradient="from-rose-500 to-orange-500"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                trend={stats.warnUnits > 0 ? { value: stats.warnUnits, positive: false } : undefined}
              />
            </motion.div>

            {/* Table */}
            <motion.div variants={itemVariants} className="relative group">
              {/* Animated border */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition duration-500"></div>
              
              <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl border-2 border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
                <div className="p-6 border-b-2 border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">INGREDIENTS LIST</h2>
                      <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-black rounded-full">
                        {filtered.length} items
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Click edit to validate pack + cost</p>
                  </div>
                  <motion.button 
                    className="px-5 py-3 bg-white dark:bg-gray-800 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex items-center gap-2"
                    onClick={load}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Refresh
                  </motion.button>
                </div>

                {filtered.length === 0 ? (
                  <div className="p-16 text-center">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="w-28 h-28 mx-auto mb-8 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-3xl flex items-center justify-center text-5xl border-2 border-indigo-200 dark:border-indigo-800"
                    >
                      🧂
                    </motion.div>
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">
                      {rows.length === 0
                        ? 'No ingredients yet'
                        : normalized.length === 0
                          ? 'No active ingredients'
                          : 'No ingredients found'}
                    </h3>
                    <p className="text-lg text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-8 font-medium">
                      {rows.length === 0
                        ? 'Start your kitchen database by adding your first ingredient.'
                        : normalized.length === 0
                          ? 'All ingredients are currently in draft. Turn on “Show drafts” to manage them.'
                          : 'Try adjusting your search or filters.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      {rows.length === 0 ? (
                        <motion.button 
                          className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-lg font-bold shadow-2xl hover:shadow-3xl transition-all flex items-center gap-3"
                          onClick={openCreate}
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Add ingredient
                        </motion.button>
                      ) : normalized.length === 0 ? (
                        <>
                          <motion.button 
                            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-lg font-bold shadow-2xl hover:shadow-3xl transition-all"
                            onClick={() => setShowInactive(true)}
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Show drafts
                          </motion.button>
                          <motion.button 
                            className="px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-2xl text-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
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
                            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl text-lg font-bold shadow-2xl hover:shadow-3xl transition-all"
                            onClick={() => { setSearch(''); setCategory(''); }}
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Clear filters
                          </motion.button>
                          <motion.button 
                            className="px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-2xl text-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
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
                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b-2 border-gray-200 dark:border-gray-700">
                          <th className="px-6 py-5 text-left text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Code</th>
                          <th className="px-6 py-5 text-left text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Name</th>
                          <th className="px-6 py-5 text-left text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Category</th>
                          <th className="px-6 py-5 text-center text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Pack</th>
                          <th className="px-6 py-5 text-center text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Unit</th>
                          <th className="px-6 py-5 text-center text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Pack Price</th>
                          <th className="px-6 py-5 text-center text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Net Unit Cost</th>
                          <th className="px-6 py-5 text-center text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">Actions</th>
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
              </div>
            </motion.div>
          </>
        )}

        {/* Modal */}
        <Modal open={modalOpen} title={editingId ? 'Edit Ingredient' : 'Add Ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-8">
            {/* IDENTIFICATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">IDENTIFICATION</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    CODE
                  </label>
                  <input
                    className={cls(
                      "w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg",
                      !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-medium">Leave empty to auto-generate. Must start with ING-</p>
                  {!canEditCodes && (
                    <p className="mt-2 text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800">
                      ⚠ Code fields are Owner-only
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    CODE CATEGORY
                  </label>
                  <input
                    className={cls(
                      "w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg",
                      !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={`e.g. ${suggestedCodeCategory}`}
                    disabled={!canEditCodes}
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-medium">Optional (max 6 chars). If empty, uses Category.</p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    NAME <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="e.g. Extra Virgin Olive Oil"
                  />
                </div>
              </div>
            </div>

            {/* CLASSIFICATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">CLASSIFICATION</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    CATEGORY
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils & Fats"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    SUPPLIER
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </div>
              </div>
            </div>

            {/* PACK */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-pink-500 to-rose-500 rounded-full"></div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">PACK</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    PACK SIZE <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    type="number"
                    min={1}
                    step="1"
                    value={fPackSize}
                    onChange={(e) => setFPackSize(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    UNIT <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all appearance-none text-lg"
                      value={fPackUnit}
                      onChange={(e) => setFPackUnit(e.target.value)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236366f1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundPosition: 'right 1rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '3rem'
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
            </div>

            {/* COST */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-rose-500 to-orange-500 rounded-full"></div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">COST</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    PACK PRICE <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    type="number"
                    step="0.01"
                    value={fPackPrice}
                    onChange={(e) => setFPackPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    NET UNIT COST
                  </label>
                  <input
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all text-lg"
                    type="number"
                    step="0.000001"
                    value={fNetUnitCost}
                    onChange={(e) => setFNetUnitCost(e.target.value)}
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-medium">If left 0 → auto-calculated from pack</p>
                </div>
              </div>
            </div>

            {/* Smart Helpers */}
            <motion.div 
              className="relative group"
              whileHover={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl opacity-0 group-hover:opacity-100 blur transition duration-500"></div>
              <div className="relative bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl p-6 border-2 border-indigo-200 dark:border-indigo-800">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">⚡ SMART HELPERS</span>
                  <motion.button
                    className="px-6 py-3 bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-400 rounded-xl text-sm font-bold border-2 border-indigo-300 dark:border-indigo-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all shadow-lg flex items-center gap-2"
                    onClick={smartRecalcNetCost}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Recalculate net cost
                  </motion.button>
                  <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl border-2 border-indigo-200 dark:border-indigo-800">
                    net = pack_price ÷ pack_size
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-8 border-t-2 border-gray-200 dark:border-gray-700">
              <motion.button
                className="px-8 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-lg font-bold hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                onClick={() => setModalOpen(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-lg font-bold shadow-2xl hover:shadow-3xl transition-all disabled:opacity-50 flex items-center gap-2"
                onClick={save}
                disabled={saving}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Ingredient
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </Modal>

        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </motion.div>
  )
}
