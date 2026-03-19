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

// ==================== NUCLEUS Icons ====================
const Icons = {
  search: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  delete: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  plus: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  dollar: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  nucleus: (props: any) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  bolt: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  check: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  spark: (props: any) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
    </svg>
  ),
  menu: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  ),
}

// ==================== Nuclear Card ====================
const NuclearCard = ({ children, className, glow = false, onClick }: { children: ReactNode; className?: string; glow?: boolean; onClick?: () => void }) => (
  <motion.div 
    className={cls(
      "relative overflow-hidden rounded-xl bg-gray-900/90 border border-gray-800/80",
      glow && "before:absolute before:inset-0 before:bg-gradient-to-r before:from-cyan-500/10 before:to-purple-500/10 before:blur-xl",
      onClick && "cursor-pointer",
      className
    )}
    whileHover={onClick ? { scale: 1.01, borderColor: 'rgba(6, 182, 212, 0.3)' } : {}}
    whileTap={onClick ? { scale: 0.99 } : {}}
    onClick={onClick}
  >
    {/* Nuclear glow effect */}
    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 hover:opacity-100 transition-opacity duration-500" />
    <div className="relative z-10">
      {children}
    </div>
  </motion.div>
)

// ==================== Nuclear Button ====================
const NuclearButton = ({ 
  variant = 'default', 
  size = 'default', 
  children, 
  className, 
  icon,
  onClick,
  disabled,
  title
}: { 
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'default'
  children?: ReactNode
  className?: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
}) => {
  const variants = {
    default: 'bg-gray-800/80 text-gray-300 border border-gray-700/50 hover:bg-gray-700/80 hover:border-cyan-500/30 hover:text-cyan-400',
    primary: 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white hover:from-cyan-500 hover:to-purple-500 shadow-lg shadow-cyan-500/20',
    ghost: 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50',
    danger: 'bg-red-950/30 text-red-400 border border-red-800/50 hover:bg-red-900/50 hover:text-red-300',
    success: 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/50 hover:text-emerald-300',
  }

  const sizes = {
    sm: 'px-2 py-1 text-xs rounded-lg',
    default: 'px-3 py-2 text-sm rounded-xl',
  }

  return (
    <motion.button
      className={cls(
        "inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <span className="text-current">{icon}</span>}
      {children}
    </motion.button>
  )
}

// ==================== Nuclear Input ====================
const NuclearInput = ({ className, icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) => (
  <div className="relative">
    {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{icon}</span>}
    <input
      className={cls(
        "w-full bg-gray-800/50 border border-gray-700/50 rounded-xl text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all",
        icon ? 'pl-9' : 'px-4',
        props.type === 'number' ? 'pr-12' : 'pr-4',
        "py-2.5 text-sm",
        className
      )}
      {...props}
    />
  </div>
)

// ==================== Nuclear Select ====================
const NuclearSelect = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select
      className={cls(
        "w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all appearance-none",
        className
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
        backgroundPosition: 'right 1rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1rem',
        paddingRight: '2.5rem'
      }}
      {...props}
    >
      {children}
    </select>
  </div>
)

// ==================== Unit Badge ====================
const UnitBadge = ({ unit, active = false }: { unit: string; active?: boolean }) => {
  const units = {
    g: { symbol: 'g', label: 'gram', color: 'cyan' },
    kg: { symbol: 'kg', label: 'kilogram', color: 'purple' },
    ml: { symbol: 'ml', label: 'milliliter', color: 'blue' },
    l: { symbol: 'L', label: 'liter', color: 'indigo' },
    pcs: { symbol: 'pcs', label: 'pieces', color: 'emerald' },
  }

  const u = units[unit as keyof typeof units] || { symbol: unit, label: unit, color: 'gray' }

  return (
    <span className={cls(
      "inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-mono font-medium transition-all",
      active 
        ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30" 
        : "bg-gray-800/50 text-gray-500 border border-gray-700/50"
    )}>
      {u.symbol}
    </span>
  )
}

// ==================== Nuclear Modal ====================
const NuclearModal = ({ 
  open, 
  onClose, 
  title, 
  children,
  size = 'md'
}: { 
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) => {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Dark backdrop */}
          <motion.div 
            className="absolute inset-0 bg-gray-950/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Nuclear particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-cyan-500/20 rounded-full"
                animate={{
                  x: [Math.random() * 100, Math.random() * 100],
                  y: [Math.random() * 100, Math.random() * 100],
                  scale: [0, 1, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </div>

          {/* Modal */}
          <motion.div 
            className={`relative w-full ${sizes[size]} mx-auto`}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <NuclearCard glow className="border-gray-800">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center text-white">
                    <Icons.spark />
                  </div>
                  <h2 className="text-sm font-medium text-gray-200">{title}</h2>
                </div>
                <NuclearButton variant="ghost" size="sm" onClick={onClose} icon={<Icons.close />} />
              </div>

              {/* Content */}
              <div className="px-6 py-5 max-h-[calc(90vh-12rem)] overflow-y-auto custom-scrollbar">
                {children}
              </div>
            </NuclearCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Table Row ====================
const IngredientRow = memo(function IngredientRow({
  ingredient,
  isDebug,
  onEdit,
  onDelete,
}: {
  ingredient: IngredientRow
  isDebug: boolean
  onEdit: (ingredient: IngredientRow) => void
  onDelete: (id: string) => void
}) {
  const active = ingredient.is_active !== false
  const net = toNum(ingredient.net_unit_cost, 0)
  const unit = ingredient.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)

  return (
    <motion.tr 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className={cls(
        'group relative border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors',
        !active && 'opacity-40'
      )}
    >
      {/* Active indicator */}
      <td className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-gray-500">
          {ingredient.code || '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-sm text-gray-300",
            !active && "line-through text-gray-600"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {flag.level === 'warn' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950/30 text-amber-500 border border-amber-800/50 flex items-center gap-0.5">
              <Icons.alert width={9} height={9} />
              unit
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-mono text-gray-300">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-3">
        <UnitBadge unit={unit} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="font-mono text-sm text-gray-300">
            {money(toNum(ingredient.pack_price, 0))}
          </span>
          <UnitBadge unit={unit} />
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="font-mono text-sm text-gray-300">
            {money(net)}
          </span>
          <UnitBadge unit={unit} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <NuclearButton
            variant="ghost"
            size="sm"
            onClick={() => onEdit(ingredient)}
            icon={<Icons.edit />}
            title="Edit"
          />
          <NuclearButton
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ingredient.id)}
            icon={<Icons.delete />}
            title="Delete"
            className="hover:text-red-400"
          />
        </div>
      </td>
    </motion.tr>
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

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

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

  const FIELDS =
    'id,code,code_category,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active'

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
      const sup = (r.supplier ?? '').toLowerCase()
      const code = (r.code ?? '').toLowerCase()
      const okSearch = !s || name.includes(s) || sup.includes(s) || code.includes(s)
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
    const missingCost = filtered.filter((r) => toNum(r.net_unit_cost, 0) <= 0).length
    const warnUnits = filtered.filter((r) => sanityFlag(toNum(r.net_unit_cost, 0), r.pack_unit ?? 'g').level === 'warn').length

    return { items, avgNet, missingCost, warnUnits }
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

  const save = async () => {
    const name = fName.trim()
    if (!name) return showToast('Name is required')

    const codeInput = (fCode || '').trim().toUpperCase()
    if (codeInput && !codeInput.startsWith('ING-')) return showToast('Code must start with ING-')

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
    const ok = confirm('Delete permanently?')
    if (!ok) return

    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) {
      const msg = String((error as any).message || '')
      const code = String((error as any).code || '')
      if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
        return showToast('Cannot delete: ingredient in use')
      }
      return showToast(msg || 'Delete failed')
    }

    showToast('Ingredient deleted')
    await load()
  }

  const bulkRecalcNetCosts = async () => {
    if (filtered.length === 0) return
    const ok = confirm(`Recalculate for ${filtered.length} items?`)
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
    const ok = confirm(`${active ? 'Activate' : 'Deactivate'} ${filtered.length} items?`)
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.02 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      className="min-h-screen bg-gray-950 text-gray-300"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Nuclear particles background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.15),transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.1),transparent_50%)]" />
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 bg-cyan-500/20 rounded-full"
            animate={{
              y: [0, -100],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header - مبسط جداً */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center text-white">
                <Icons.nucleus />
              </div>
              <div className="absolute -top-1 -right-1 w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-light text-gray-100 tracking-tight flex items-center gap-2">
                NUCLEUS
                <span className="text-[8px] font-mono bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700">
                  v1.0
                </span>
              </h1>
              <p className="text-xs text-gray-600 mt-0.5">
                {filtered.length} cores · {stats.missingCost} unstable
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* زر واحد فقط - New Core (الباقي في القائمة) */}
            <NuclearButton
              variant="primary"
              onClick={openCreate}
              icon={<Icons.plus />}
            >
              New core
            </NuclearButton>
          </div>
        </motion.div>

        {/* Search Bar - مبسط */}
        <motion.div variants={itemVariants} className="mb-6">
          <div className="relative">
            <Icons.search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              className="w-full pl-11 pr-4 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan cores..."
            />
            {search && (
              <button 
                type="button" 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                onClick={() => setSearch('')}
              >
                <Icons.close width={14} height={14} />
              </button>
            )}
          </div>
        </motion.div>

        {/* Stats - 4 بطاقات فقط */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4 mb-8">
          <NuclearCard className="p-5">
            <div className="text-xs text-gray-600 mb-1">CORES</div>
            <div className="text-2xl font-light text-gray-200">{stats.items}</div>
            <div className="text-[10px] text-gray-700 mt-1">active particles</div>
          </NuclearCard>
          <NuclearCard className="p-5">
            <div className="text-xs text-gray-600 mb-1">ENERGY</div>
            <div className="text-2xl font-light text-gray-200">{money(stats.avgNet)}</div>
            <div className="text-[10px] text-gray-700 mt-1">per unit</div>
          </NuclearCard>
          <NuclearCard className="p-5">
            <div className="text-xs text-gray-600 mb-1">VOID</div>
            <div className="text-2xl font-light text-gray-200">{stats.missingCost}</div>
            <div className="text-[10px] text-gray-700 mt-1">missing prices</div>
            {stats.missingCost > 0 && (
              <div className="absolute top-3 right-3 w-2 h-2 bg-amber-500/50 rounded-full animate-pulse" />
            )}
          </NuclearCard>
          <NuclearCard className="p-5">
            <div className="text-xs text-gray-600 mb-1">INSTABILITY</div>
            <div className="text-2xl font-light text-gray-200">{stats.warnUnits}</div>
            <div className="text-[10px] text-gray-700 mt-1">unit warnings</div>
          </NuclearCard>
        </motion.div>

        {/* Filters - سطر واحد فقط */}
        <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
          <NuclearSelect value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </NuclearSelect>

          <NuclearSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="name">Sort by name</option>
            <option value="cost">Sort by energy</option>
            <option value="pack_price">Sort by mass</option>
          </NuclearSelect>

          <NuclearButton
            variant="ghost"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            icon={<div className={cls(
              "w-3 h-3 rounded border",
              showInactive ? "bg-cyan-500 border-cyan-500" : "border-gray-700"
            )} />}
          >
            {showInactive ? "Hide void" : "Show void"}
          </NuclearButton>

          {/* Bulk actions - مخفية في menu */}
          <div className="relative ml-auto">
            <NuclearButton
              variant="ghost"
              size="sm"
              icon={<Icons.menu />}
              onClick={() => {
                const action = confirm('⚡ Bulk actions:\n\nOK: Recalculate all\nCancel: Show more options')
                if (action) {
                  bulkRecalcNetCosts()
                }
              }}
            />
          </div>
        </motion.div>

        {/* Loading/Error */}
        {loading && (
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <NuclearCard key={i} className="p-5">
                  <Skeleton className="h-4 w-16 mb-2 bg-gray-800" />
                  <Skeleton className="h-8 w-24 mb-1 bg-gray-800" />
                  <Skeleton className="h-3 w-20 bg-gray-800" />
                </NuclearCard>
              ))}
            </div>
            <NuclearCard className="p-5">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16 bg-gray-800" />
                    <Skeleton className="h-4 w-32 flex-1 bg-gray-800" />
                    <Skeleton className="h-4 w-20 bg-gray-800" />
                    <Skeleton className="h-4 w-20 bg-gray-800" />
                  </div>
                ))}
              </div>
            </NuclearCard>
          </motion.div>
        )}

        {err && (
          <motion.div variants={itemVariants}>
            <NuclearCard className="p-5 bg-red-950/20 border-red-900/50">
              <div className="flex items-center gap-2 text-red-400">
                <Icons.alert />
                <span className="text-sm">{err}</span>
              </div>
            </NuclearCard>
          </motion.div>
        )}

        {/* Table */}
        {!loading && !err && (
          <motion.div variants={itemVariants}>
            {filtered.length === 0 ? (
              <NuclearCard className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center text-3xl border border-gray-700">
                  ⚛️
                </div>
                <h3 className="text-base font-medium text-gray-300 mb-2">
                  {rows.length === 0 ? 'No cores detected' : 'No results'}
                </h3>
                <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">
                  {rows.length === 0 
                    ? 'Initialize your first core to start the reaction.'
                    : 'Adjust your scan parameters.'}
                </p>
                {rows.length === 0 && (
                  <NuclearButton variant="primary" onClick={openCreate} icon={<Icons.plus />}>
                    Initialize core
                  </NuclearButton>
                )}
              </NuclearCard>
            ) : (
              <NuclearCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800/80 bg-gray-900/50">
                        <th className="px-4 py-3 text-left text-[9px] font-medium text-gray-600 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-3 text-left text-[9px] font-medium text-gray-600 uppercase tracking-wider">CORE</th>
                        <th className="px-4 py-3 text-left text-[9px] font-medium text-gray-600 uppercase tracking-wider">CLASS</th>
                        <th className="px-4 py-3 text-center text-[9px] font-medium text-gray-600 uppercase tracking-wider">MASS</th>
                        <th className="px-4 py-3 text-center text-[9px] font-medium text-gray-600 uppercase tracking-wider">UNIT</th>
                        <th className="px-4 py-3 text-right text-[9px] font-medium text-gray-600 uppercase tracking-wider">MASS PRICE</th>
                        <th className="px-4 py-3 text-right text-[9px] font-medium text-gray-600 uppercase tracking-wider">ENERGY</th>
                        <th className="px-4 py-3 text-right text-[9px] font-medium text-gray-600 uppercase tracking-wider">CONTROL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientRow
                            key={r.id}
                            ingredient={r}
                            isDebug={isDebug}
                            onEdit={openEdit}
                            onDelete={hardDelete}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </NuclearCard>
            )}
          </motion.div>
        )}

        {/* Nuclear Modal */}
        <NuclearModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit core' : 'New core'}
          size="lg"
        >
          <div className="space-y-5">
            {/* Basic info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-purple-500 rounded-full" />
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Core data</h3>
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-2">Designation <span className="text-cyan-500">*</span></label>
                <NuclearInput
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Category</label>
                  <NuclearInput
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Supplier</label>
                  <NuclearInput
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </div>
              </div>
            </div>

            {/* Code section - OPTIONAL */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Code signature</h3>
                <span className="text-[8px] font-mono bg-gray-800 text-gray-600 px-2 py-0.5 rounded-full ml-auto">OPTIONAL</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Core ID</label>
                  <NuclearInput
                    className={!canEditCodes ? "opacity-50" : ""}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                    icon={<Icons.spark className="text-gray-600" />}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Class ID</label>
                  <NuclearInput
                    className={!canEditCodes ? "opacity-50" : ""}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </div>
              </div>
            </div>

            {/* Measurement - Nuclear style */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-pink-500 to-orange-500 rounded-full" />
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Reactor metrics</h3>
              </div>

              {/* Unit selector */}
              <div className="grid grid-cols-5 gap-2">
                {['g', 'kg', 'ml', 'l', 'pcs'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setFPackUnit(u)}
                    className={cls(
                      "py-2 rounded-lg text-sm font-mono transition-all border",
                      fPackUnit === u
                        ? "bg-cyan-600/20 text-cyan-400 border-cyan-500/30"
                        : "bg-gray-800/30 text-gray-600 border-gray-800 hover:text-gray-400 hover:border-gray-700"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Mass</label>
                  <div className="relative">
                    <NuclearInput
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-600">
                      {fPackUnit}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Unit</label>
                  <div className="px-4 py-2.5 bg-gray-800/30 border border-gray-800 rounded-xl text-gray-400 font-mono text-sm">
                    {fPackUnit}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Mass energy</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">$</span>
                    <NuclearInput
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Unit energy</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">$</span>
                    <NuclearInput
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                      className="pl-8 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-600">
                      /{fPackUnit}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reaction preview */}
              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="mt-3 p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-cyan-500/70 flex items-center gap-1">
                      <Icons.bolt />
                      Reaction
                    </span>
                    <span className="font-mono text-cyan-400">
                      ${parseFloat(fPackPrice)} / {parseFloat(fPackSize)}{fPackUnit} = ${(parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4)} /{fPackUnit}
                    </span>
                  </div>
                  <NuclearButton
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => {
                      const ps = Math.max(1, toNum(fPackSize, 1))
                      const pp = Math.max(0, toNum(fPackPrice, 0))
                      setFNetUnitCost(String(pp / ps))
                    }}
                  >
                    Apply reaction
                  </NuclearButton>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-800/80">
              <NuclearButton variant="ghost" onClick={() => setModalOpen(false)}>
                Abort
              </NuclearButton>
              <NuclearButton variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Initializing...' : editingId ? 'Update core' : 'Initialize core'}
              </NuclearButton>
            </div>
          </div>
        </NuclearModal>

        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f2937;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </motion.div>
  )
}
