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

// ==================== Organic Background Pattern ====================
const OrganicPattern = () => (
  <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="organic-cells" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
        <circle cx="30" cy="30" r="8" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-emerald-600">
          <animate attributeName="r" values="8;12;8" dur="8s" repeatCount="indefinite" />
        </circle>
        <circle cx="15" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-amber-600">
          <animate attributeName="r" values="4;6;4" dur="6s" repeatCount="indefinite" />
        </circle>
        <circle cx="45" cy="45" r="6" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-teal-600">
          <animate attributeName="r" values="6;9;6" dur="7s" repeatCount="indefinite" />
        </circle>
        <path d="M30 22 L38 38 L22 38 Z" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-emerald-600">
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="5s" repeatCount="indefinite" />
        </path>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#organic-cells)" />
  </svg>
)

// ==================== Growing Line Animation ====================
const GrowingLine = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none">
    <path
      d="M0,50 Q25,30 50,50 T100,50"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      className="text-emerald-600/30"
      strokeDasharray="200"
      strokeDashoffset="200"
    >
      <animate
        attributeName="stroke-dashoffset"
        values="200;0"
        dur="3s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
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
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/90 via-teal-950/80 to-amber-950/90 backdrop-blur-md" onClick={onClose} />
          <motion.div 
            className="absolute left-1/2 top-1/2 w-[min(1000px,96vw)] -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.9, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -50 }}
            transition={{ type: "spring", damping: 20, stiffness: 200, mass: 1.5 }}
          >
            {/* Organic shape background */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-teal-100 to-amber-100 dark:from-emerald-950 dark:via-teal-950 dark:to-amber-950 rounded-[3rem] transform rotate-1 scale-[1.02] blur-xl opacity-50"></div>
            
            {/* Main modal */}
            <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/30 dark:border-emerald-800/30 overflow-hidden">
              {/* Organic top decoration */}
              <div className="absolute top-0 left-0 right-0 h-48">
                <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
              </div>
              
              {/* Growing line animation */}
              <GrowingLine className="absolute top-0 left-0 w-full h-32 text-emerald-600/20" />
              
              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 p-8 pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.3em]">
                        {editingId ? 'EDIT · INGREDIENT' : 'NEW · INGREDIENT'}
                      </span>
                    </div>
                    <h2 className="text-5xl font-light text-gray-900 dark:text-white">
                      {title}
                    </h2>
                  </div>
                  <motion.button 
                    className="w-14 h-14 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-emerald-200 dark:border-emerald-800 shadow-lg"
                    onClick={onClose}
                    type="button"
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </motion.button>
                </div>
                
                {/* Content */}
                <div className="p-8 pt-2 max-h-[70vh] overflow-auto custom-scrollbar">
                  {children}
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileHover={{ 
        backgroundColor: 'rgba(16, 185, 129, 0.03)',
        transition: { duration: 0.2 }
      }}
      className={cls(
        'group relative transition-all duration-300',
        !active && 'opacity-40 grayscale'
      )}
    >
      {/* Organic connector line */}
      <td className="absolute left-0 top-1/2 w-4 h-px bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity"></td>
      
      <td className="px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 group-hover:scale-150 transition-transform"></div>
          <span className="font-mono text-sm font-light text-gray-700 dark:text-gray-300 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700">
            {r.code ? (
              <span className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                {r.code}
              </span>
            ) : '—'}
          </span>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-light text-2xl text-gray-900 dark:text-white tracking-tight">{r.name ?? '—'}</span>
            {!active && (
              <span className="px-4 py-1.5 text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full border border-gray-300 dark:border-gray-600">
                draft
              </span>
            )}
            {flag.level === 'warn' && (
              <span className="px-4 py-1.5 text-xs font-mono bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                <span>⚠</span>
                attention
              </span>
            )}
          </div>
          {isDebug && (
            <div className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full inline-flex items-center gap-2 w-fit">
              <span className="w-1 h-1 rounded-full bg-gray-400"></span>
              {r.id.slice(0, 8)}...
            </div>
          )}
          {flag.level === 'warn' && (
            <div className="text-xs font-mono text-amber-600 dark:text-amber-400 mt-1">{flag.msg}</div>
          )}
        </div>
      </td>
      <td className="px-6 py-5">
        <span className="text-gray-600 dark:text-gray-400 font-light text-lg">{r.category ?? '—'}</span>
      </td>
      <td className="px-6 py-5 text-center">
        <span className="font-mono font-light text-2xl text-gray-900 dark:text-white">{Math.max(1, toNum(r.pack_size, 1))}</span>
      </td>
      <td className="px-6 py-5 text-center">
        <span className="inline-flex px-5 py-2 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-full text-sm font-mono font-light text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {unit}
        </span>
      </td>
      <td className="px-6 py-5 text-center">
        <span className="font-mono font-light text-2xl text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400">
          {money(toNum(r.pack_price, 0))}
        </span>
      </td>
      <td className="px-6 py-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="font-mono font-light text-2xl text-gray-900 dark:text-white">{money(net)}</span>
          {flag.level === 'warn' && (
            <span className="text-amber-500 text-sm">⚠</span>
          )}
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex items-center justify-center gap-2">
          <motion.button 
            className="p-3 rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
            type="button" 
            onClick={() => onEdit(r)}
            whileHover={{ scale: 1.1, rotate: -5 }}
            whileTap={{ scale: 0.9 }}
            title="Edit ingredient"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </motion.button>
          <motion.button 
            className="p-3 rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 border border-gray-200 dark:border-gray-700 hover:border-rose-300 dark:hover:border-rose-700 transition-all"
            type="button" 
            onClick={() => onHardDelete(r.id)}
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            title="Delete ingredient"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
  color = 'emerald'
}: { 
  label: string
  value: string | number
  sublabel: string
  icon: ReactNode
  trend?: { value: number; positive: boolean }
  color?: 'emerald' | 'teal' | 'amber' | 'rose'
}) {
  const colorClasses = {
    emerald: 'from-emerald-500 to-teal-500',
    teal: 'from-teal-500 to-cyan-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500'
  }

  return (
    <motion.div 
      className="group relative"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Organic shadow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity rounded-3xl`}></div>
      
      {/* Card */}
      <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl p-6 border border-gray-200/50 dark:border-gray-800/50 shadow-xl">
        {/* Decorative cell */}
        <div className="absolute top-4 right-4 w-20 h-20 opacity-10">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="1" className="text-emerald-600">
              <animate attributeName="r" values="20;25;20" dur="6s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-mono font-light text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {label}
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-light text-gray-900 dark:text-white">{value}</span>
                {trend && (
                  <span className={cls(
                    "px-2 py-1 text-xs font-mono rounded-full",
                    trend.positive 
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" 
                      : "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800"
                  )}>
                    {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
                  </span>
                )}
              </div>
            </div>
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorClasses[color]} bg-opacity-10 flex items-center justify-center text-white shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all`}>
              {icon}
            </div>
          </div>
          <div className="mt-3 text-sm font-mono font-light text-gray-500 dark:text-gray-400">{sublabel}</div>
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
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 200, damping: 20 }
    }
  }

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-amber-50 dark:from-emerald-950 dark:via-teal-950 dark:to-amber-950"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Organic background pattern */}
      <OrganicPattern />
      
      {/* Floating organic shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-20 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-12">
          <div className="relative">
            {/* Organic background */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-amber-600/20 rounded-[3rem] blur-2xl"></div>
            
            {/* Main header */}
            <div className="relative bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl rounded-[2.5rem] p-1 shadow-2xl border border-white/50 dark:border-emerald-900/50">
              <div className="bg-gradient-to-br from-white to-emerald-50/50 dark:from-gray-900 dark:to-emerald-950/50 rounded-[2.3rem] p-8">
                {/* Growing line decoration */}
                <GrowingLine className="absolute top-0 right-0 w-64 h-64 text-emerald-600/20 rotate-180" />
                
                <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-2xl">
                          <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M12 2a15 15 0 0 0 0 20 15 15 0 0 0 0-20z" />
                            <path d="M12 22a15 15 0 0 1 0-20" />
                          </svg>
                        </div>
                        <div className="absolute -top-2 -right-2 w-4 h-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                        </div>
                      </div>
                      <div>
                        <h1 className="text-6xl font-light text-gray-900 dark:text-white tracking-tight">
                          Ingredients
                        </h1>
                        <p className="text-lg font-mono font-light text-emerald-700 dark:text-emerald-400 mt-2">
                          organic · living · database
                        </p>
                      </div>
                    </div>
                    
                    {isDebug && (
                      <div className="inline-flex items-center gap-3 px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl text-sm font-mono text-gray-600 dark:text-gray-400 border border-emerald-200 dark:border-emerald-800 mt-4">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        kitchen_id: {kitchenId?.slice(0, 8) ?? 'null'}...
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-3 px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-white dark:hover:bg-gray-700 transition-all border border-emerald-200 dark:border-emerald-800">
                      <input 
                        type="checkbox" 
                        checked={showInactive} 
                        onChange={(e) => setShowInactive(e.target.checked)}
                        className="w-5 h-5 rounded-lg border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-mono text-sm">show drafts</span>
                    </label>

                    <motion.button 
                      className="px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl text-sm font-mono hover:bg-white dark:hover:bg-gray-700 transition-all border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 flex items-center gap-2"
                      type="button" 
                      onClick={bulkRecalcNetCosts} 
                      disabled={bulkWorking}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      {bulkWorking ? '...' : 'recalc'}
                    </motion.button>

                    <motion.button 
                      className="px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl text-sm font-mono hover:bg-white dark:hover:bg-gray-700 transition-all border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                      type="button" 
                      onClick={() => bulkSetActive(true)} 
                      disabled={bulkWorking}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      activate
                    </motion.button>

                    <motion.button 
                      className="px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl text-sm font-mono hover:bg-white dark:hover:bg-gray-700 transition-all border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                      type="button" 
                      onClick={() => bulkSetActive(false)} 
                      disabled={bulkWorking}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      draft
                    </motion.button>

                    <motion.button 
                      className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-sm font-mono shadow-2xl hover:shadow-3xl transition-all flex items-center gap-2"
                      type="button" 
                      onClick={openCreate}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      new
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl opacity-0 group-hover:opacity-30 blur transition duration-500"></div>
            
            <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-white/50 dark:border-emerald-900/50 shadow-xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Search */}
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                    search
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600">⚲</span>
                    <input
                      className="w-full pl-11 pr-12 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="type to filter..."
                    />
                    {search && (
                      <motion.button 
                        type="button" 
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-700 rounded-full w-6 h-6 flex items-center justify-center border border-emerald-200 dark:border-emerald-800"
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
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                    category
                  </label>
                  <div className="relative">
                    <select 
                      className="w-full px-4 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all appearance-none font-mono"
                      value={category} 
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2310b981'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundPosition: 'right 1rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value="">all categories</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                    sort by
                  </label>
                  <div className="relative">
                    <select 
                      className="w-full px-4 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all appearance-none font-mono"
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value as any)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2310b981'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundPosition: 'right 1rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.5em 1.5em',
                        paddingRight: '3rem'
                      }}
                    >
                      <option value="name">name (a → z)</option>
                      <option value="cost">net cost (high → low)</option>
                      <option value="pack_price">pack price (high → low)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Active filters */}
              {(search || category) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-light text-gray-500 dark:text-gray-400">active:</span>
                    {search && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm font-mono rounded-full border border-emerald-300 dark:border-emerald-700">
                        <span>⚲</span>
                        {search}
                        <button onClick={() => setSearch('')} className="ml-1 hover:text-emerald-900 dark:hover:text-emerald-300">×</button>
                      </span>
                    )}
                    {category && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm font-mono rounded-full border border-emerald-300 dark:border-emerald-700">
                        <span>📁</span>
                        {category}
                        <button onClick={() => setCategory('')} className="ml-1 hover:text-emerald-900 dark:hover:text-emerald-300">×</button>
                      </span>
                    )}
                    {(search || category) && (
                      <motion.button 
                        onClick={() => { setSearch(''); setCategory(''); }}
                        className="px-4 py-2 text-sm font-mono text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-4"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        clear all
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
                <div key={i} className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-white/50 dark:border-emerald-900/50">
                  <Skeleton className="h-4 w-20 mb-3 bg-emerald-200/50" />
                  <Skeleton className="h-10 w-32 mb-2 bg-emerald-200/50" />
                  <Skeleton className="h-4 w-40 bg-emerald-200/50" />
                </div>
              ))}
            </div>
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-white/50 dark:border-emerald-900/50">
              <Skeleton className="h-6 w-48 mb-6 bg-emerald-200/50" />
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-6">
                    <Skeleton className="h-5 w-24 bg-emerald-200/50" />
                    <Skeleton className="h-5 flex-1 bg-emerald-200/50" />
                    <Skeleton className="h-5 w-32 bg-emerald-200/50" />
                    <Skeleton className="h-5 w-28 bg-emerald-200/50" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {err && (
          <motion.div variants={itemVariants} className="bg-rose-50/80 dark:bg-rose-950/30 backdrop-blur-xl border border-rose-200 dark:border-rose-800 rounded-2xl p-8">
            <div className="flex items-center gap-4 text-rose-700 dark:text-rose-400">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-2xl">
                ⚠
              </div>
              <div>
                <h3 className="text-lg font-mono font-light mb-1">error loading ingredients</h3>
                <p className="text-sm font-mono font-light">{err}</p>
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
                label="items"
                value={stats.items}
                sublabel="filtered results"
                color="emerald"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
              <StatsCard
                label="avg net"
                value={money(stats.avgNet)}
                sublabel="average unit cost"
                color="teal"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              />
              <StatsCard
                label="missing"
                value={stats.missingCost}
                sublabel="cost = 0"
                color="amber"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                trend={stats.missingCost > 0 ? { value: stats.missingCost, positive: false } : undefined}
              />
              <StatsCard
                label="warnings"
                value={stats.warnUnits}
                sublabel="unit mismatches"
                color="rose"
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                trend={stats.warnUnits > 0 ? { value: stats.warnUnits, positive: false } : undefined}
              />
            </motion.div>

            {/* Table */}
            <motion.div variants={itemVariants} className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition duration-500"></div>
              
              <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/50 dark:border-emerald-900/50 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/30">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-sm font-mono font-light text-gray-900 dark:text-white uppercase tracking-wider">
                        ingredients · living list
                      </h2>
                      <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-mono rounded-full border border-emerald-300 dark:border-emerald-700">
                        {filtered.length} items
                      </span>
                    </div>
                    <p className="text-sm font-mono font-light text-gray-600 dark:text-gray-400">click to edit · validate costs</p>
                  </div>
                  <motion.button 
                    className="px-5 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl text-sm font-mono text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 transition-all flex items-center gap-2"
                    onClick={load}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    refresh
                  </motion.button>
                </div>

                {filtered.length === 0 ? (
                  <div className="p-16 text-center">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/50 dark:to-teal-950/50 rounded-[2rem] flex items-center justify-center text-6xl border-2 border-emerald-300 dark:border-emerald-700"
                    >
                      🌱
                    </motion.div>
                    <h3 className="text-3xl font-light text-gray-900 dark:text-white mb-3 tracking-tight">
                      {rows.length === 0
                        ? 'no ingredients yet'
                        : normalized.length === 0
                          ? 'no active ingredients'
                          : 'no ingredients found'}
                    </h3>
                    <p className="text-lg font-mono font-light text-gray-500 dark:text-gray-400 max-w-lg mx-auto mb-8">
                      {rows.length === 0
                        ? 'plant the first seed in your kitchen database'
                        : normalized.length === 0
                          ? 'all ingredients are in draft · toggle "show drafts" to see them'
                          : 'try different filters or search terms'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      {rows.length === 0 ? (
                        <motion.button 
                          className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-lg font-mono font-light shadow-2xl hover:shadow-3xl transition-all flex items-center gap-3"
                          onClick={openCreate}
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          plant ingredient
                        </motion.button>
                      ) : normalized.length === 0 ? (
                        <>
                          <motion.button 
                            className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-lg font-mono font-light shadow-2xl hover:shadow-3xl transition-all"
                            onClick={() => setShowInactive(true)}
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            show drafts
                          </motion.button>
                          <motion.button 
                            className="px-8 py-4 border-2 border-emerald-300 dark:border-emerald-700 rounded-2xl text-lg font-mono font-light hover:bg-white/50 dark:hover:bg-gray-800/50 transition-all"
                            onClick={openCreate}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            + new
                          </motion.button>
                        </>
                      ) : (
                        <>
                          <motion.button 
                            className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-lg font-mono font-light shadow-2xl hover:shadow-3xl transition-all"
                            onClick={() => { setSearch(''); setCategory(''); }}
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            clear filters
                          </motion.button>
                          <motion.button 
                            className="px-8 py-4 border-2 border-emerald-300 dark:border-emerald-700 rounded-2xl text-lg font-mono font-light hover:bg-white/50 dark:hover:bg-gray-800/50 transition-all"
                            onClick={openCreate}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            + new
                          </motion.button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px]">
                      <thead>
                        <tr className="bg-emerald-50/50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800">
                          <th className="px-6 py-5 text-left text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">code</th>
                          <th className="px-6 py-5 text-left text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">name</th>
                          <th className="px-6 py-5 text-left text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">category</th>
                          <th className="px-6 py-5 text-center text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">pack</th>
                          <th className="px-6 py-5 text-center text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">unit</th>
                          <th className="px-6 py-5 text-center text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">pack price</th>
                          <th className="px-6 py-5 text-center text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">net cost</th>
                          <th className="px-6 py-5 text-center text-xs font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-200 dark:divide-emerald-800">
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
        <Modal open={modalOpen} title={editingId ? 'Edit Ingredient' : 'New Ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-8">
            {/* IDENTIFICATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                <h3 className="text-lg font-mono font-light text-gray-900 dark:text-white uppercase tracking-wider">
                  identification
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    code
                  </label>
                  <input
                    className={cls(
                      "w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono",
                      !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                  <p className="mt-2 text-sm font-mono font-light text-gray-500 dark:text-gray-400">leave empty to auto-generate · must start with ING-</p>
                  {!canEditCodes && (
                    <p className="mt-2 text-sm font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700">
                      ⚠ code fields are owner-only
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    code category
                  </label>
                  <input
                    className={cls(
                      "w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono",
                      !canEditCodes && "opacity-60 cursor-not-allowed bg-gray-100 dark:bg-gray-900"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={`e.g. ${suggestedCodeCategory}`}
                    disabled={!canEditCodes}
                  />
                  <p className="mt-2 text-sm font-mono font-light text-gray-500 dark:text-gray-400">optional · max 6 chars · defaults to category</p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="e.g. extra virgin olive oil"
                  />
                </div>
              </div>
            </div>

            {/* CLASSIFICATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-gradient-to-b from-teal-500 to-amber-500 rounded-full"></div>
                <h3 className="text-lg font-mono font-light text-gray-900 dark:text-white uppercase tracking-wider">
                  classification
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    category
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. oils & fats"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    supplier
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. sysco"
                  />
                </div>
              </div>
            </div>

            {/* PACK */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
                <h3 className="text-lg font-mono font-light text-gray-900 dark:text-white uppercase tracking-wider">
                  pack
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    pack size <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    type="number"
                    min={1}
                    step="1"
                    value={fPackSize}
                    onChange={(e) => setFPackSize(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    unit <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all appearance-none font-mono"
                      value={fPackUnit}
                      onChange={(e) => setFPackUnit(e.target.value)}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2310b981'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
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
                <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-rose-500 rounded-full"></div>
                <h3 className="text-lg font-mono font-light text-gray-900 dark:text-white uppercase tracking-wider">
                  cost
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    pack price <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    type="number"
                    step="0.01"
                    value={fPackPrice}
                    onChange={(e) => setFPackPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-light text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                    net unit cost
                  </label>
                  <input
                    className="w-full px-5 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-emerald-200 dark:border-emerald-800 rounded-xl text-gray-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all font-mono"
                    type="number"
                    step="0.000001"
                    value={fNetUnitCost}
                    onChange={(e) => setFNetUnitCost(e.target.value)}
                  />
                  <p className="mt-2 text-sm font-mono font-light text-gray-500 dark:text-gray-400">if 0 → auto-calculated from pack</p>
                </div>
              </div>
            </div>

            {/* Smart Helpers */}
            <motion.div 
              className="relative group"
              whileHover={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500"></div>
              <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl p-6 border-2 border-emerald-300 dark:border-emerald-700">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm font-mono font-light text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">⚡ smart helpers</span>
                  <motion.button
                    className="px-6 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-mono border-2 border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-all shadow-lg flex items-center gap-2"
                    onClick={smartRecalcNetCost}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    recalc net cost
                  </motion.button>
                  <span className="text-sm font-mono text-emerald-600 dark:text-emerald-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-4 py-2 rounded-xl border-2 border-emerald-300 dark:border-emerald-700">
                    net = pack_price ÷ pack_size
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-8 border-t-2 border-emerald-200 dark:border-emerald-800">
              <motion.button
                className="px-8 py-4 border-2 border-emerald-300 dark:border-emerald-700 rounded-xl text-lg font-mono font-light hover:bg-white/50 dark:hover:bg-gray-800/50 transition-all"
                onClick={() => setModalOpen(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                cancel
              </motion.button>
              <motion.button
                className="px-10 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-lg font-mono font-light shadow-2xl hover:shadow-3xl transition-all disabled:opacity-50 flex items-center gap-2"
                onClick={save}
                disabled={saving}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
                    </svg>
                    saving...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    save ingredient
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
          background: #10b981;
          border-radius: 9999px;
          opacity: 0.5;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #059669;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #059669;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #10b981;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </motion.div>
  )
}
