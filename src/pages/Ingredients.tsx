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

// ==================== Premium Icons - Bold & Refined ====================
const Icons = {
  search: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  delete: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  plus: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  chevronDown: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  dollar: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  bolt: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  check: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  reset: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  deactivate: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
}

// ==================== Bold Premium Color Palette ====================
const colors = {
  forest: {
    50: '#ecf0e6',
    100: '#d4ddc4',
    200: '#b9c7a0',
    300: '#9eb07c',
    400: '#839f58',
    500: '#2C5F2D', // Deep forest green - primary
    600: '#234a24',
    700: '#1a361b',
    800: '#112311',
    900: '#080f08',
  },
  olive: '#5C7344', // Secondary olive
  charcoal: '#1E1E1E', // Rich dark text
  slate: '#2D3E4F', // Deep accent
  ivory: '#F8F6F0', // Warm supportive background
  cream: '#FAF7F2', // Card background
  gold: '#C6A15B', // Premium accent
  amber: '#B58B4A', // Warning
  deepRed: '#9E2A2B', // Destructive
  border: '#E0DDD5', // Clean borders
}

// ==================== Unit Badge - Bold & Clear ====================
const UnitBadge = ({ unit }: { unit: string }) => {
  const unitMap: Record<string, string> = {
    g: 'g',
    kg: 'kg',
    ml: 'mL',
    l: 'L',
    pcs: 'pc',
  }

  return (
    <span className="inline-flex items-center justify-center px-2 py-1 text-[10px] font-mono font-medium text-forest-700 bg-forest-50 border border-forest-200 rounded-md">
      {unitMap[unit] || unit}
    </span>
  )
}

// ==================== Price Display - Bold & Structured ====================
const PriceDisplay = ({ amount, unit }: { amount: number; unit: string }) => (
  <div className="flex items-center justify-end gap-2">
    <span className="font-mono text-base font-medium text-charcoal">
      {money(amount)}
    </span>
    <UnitBadge unit={unit} />
  </div>
)

// ==================== Modal - Strong Presence ====================
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-lg mx-auto"
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-white rounded-xl shadow-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <h2 className="text-base font-semibold text-charcoal">{title}</h2>
                <button
                  className="p-2 rounded-lg hover:bg-forest-50 text-stone-500 hover:text-forest-700 transition-colors"
                  onClick={onClose}
                >
                  <Icons.close />
                </button>
              </div>
              <div className="px-6 py-6 max-h-[calc(90vh-8rem)] overflow-y-auto">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Form Field - Strong & Clear ====================
const FormField = ({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: ReactNode
  hint?: string
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="text-sm font-semibold text-charcoal">
        {label}
        {required && <span className="text-deepRed ml-1">*</span>}
      </label>
      {hint && <span className="text-xs text-stone-500">{hint}</span>}
    </div>
    {children}
  </div>
)

// ==================== Table Row - Premium Presence ====================
const IngredientTableRow = memo(function IngredientTableRow({
  ingredient,
  isDebug,
  onEdit,
  onDeactivate,
  onHardDelete,
}: {
  ingredient: IngredientRow
  isDebug: boolean
  onEdit: (ingredient: IngredientRow) => void
  onDeactivate: (id: string) => void
  onHardDelete: (id: string) => void
}) {
  const active = ingredient.is_active !== false
  const net = toNum(ingredient.net_unit_cost, 0)
  const unit = ingredient.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)
  const hasWarning = flag.level === 'warn'

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cls(
        'group border-b border-border last:border-0 hover:bg-forest-50/30 transition-colors',
        !active && 'opacity-50'
      )}
    >
      <td className="px-4 py-4">
        <span className="text-sm font-mono font-medium text-stone-600">
          {ingredient.code || '—'}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-base font-semibold text-charcoal",
            !active && "line-through text-stone-400"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {hasWarning && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber/10 text-amber border border-amber/20">
              <Icons.alert width={10} height={10} />
              check unit
            </span>
          )}
        </div>
        {isDebug && (
          <div className="text-[9px] font-mono text-stone-400 mt-1">
            {ingredient.id.slice(0, 8)}...
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-base text-stone-600">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-4 text-center">
        <span className="text-base font-mono font-medium text-charcoal">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-4">
        <UnitBadge unit={unit} />
      </td>
      <td className="px-4 py-4">
        <PriceDisplay amount={toNum(ingredient.pack_price, 0)} unit={unit} />
      </td>
      <td className="px-4 py-4">
        <PriceDisplay amount={net} unit={unit} />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-2 rounded-lg hover:bg-forest-100 text-stone-500 hover:text-forest-700 transition-colors"
            onClick={() => onEdit(ingredient)}
            title="Edit"
          >
            <Icons.edit />
          </button>
          {active && (
            <button
              className="p-2 rounded-lg hover:bg-forest-100 text-stone-500 hover:text-amber transition-colors"
              onClick={() => onDeactivate(ingredient.id)}
              title="Deactivate"
            >
              <Icons.deactivate />
            </button>
          )}
          <button
            className="p-2 rounded-lg hover:bg-forest-100 text-stone-500 hover:text-deepRed transition-colors"
            onClick={() => {
              if (window.confirm('Delete permanently? This cannot be undone.')) {
                onHardDelete(ingredient.id)
              }
            }}
            title="Delete permanently"
          >
            <Icons.delete />
          </button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Stat Card - Bold & Premium ====================
const StatCard = ({ label, value, sublabel, warning }: { label: string; value: string | number; sublabel: string; warning?: boolean }) => (
  <div className="bg-white rounded-xl p-6 border border-border shadow-sm">
    <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
      {label}
    </div>
    <div className={cls(
      "text-2xl font-light",
      warning ? "text-amber" : "text-charcoal"
    )}>
      {value}
    </div>
    <div className="text-xs text-stone-500 mt-2">
      {sublabel}
    </div>
  </div>
)

// ==================== Empty State - Confident ====================
const EmptyState = ({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) => (
  <div className="bg-white rounded-xl p-12 text-center border border-border">
    <div className="w-16 h-16 mx-auto mb-4 bg-forest-50 rounded-2xl flex items-center justify-center text-3xl text-forest-700 border border-forest-200">
      🥬
    </div>
    <h3 className="text-xl font-semibold text-charcoal mb-2">
      {hasFilters ? 'No matching ingredients' : 'No ingredients yet'}
    </h3>
    <p className="text-base text-stone-600 max-w-sm mx-auto mb-8">
      {hasFilters
        ? 'Try adjusting your search or filters to find what you need.'
        : 'Add your first ingredient to start building your premium kitchen database.'}
    </p>
    <button
      className="inline-flex items-center gap-2 px-6 py-3 bg-forest-500 text-white text-base font-semibold rounded-xl hover:bg-forest-600 transition-colors shadow-md"
      onClick={onAdd}
    >
      <Icons.plus />
      Add ingredient
    </button>
  </div>
)

// ==================== Loading State - Clean ====================
const LoadingState = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-6 border border-border">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
    <div className="bg-white rounded-xl p-6 border border-border">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-32 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

// ==================== Error State ====================
const ErrorState = ({ message }: { message: string }) => (
  <div className="bg-deepRed/5 rounded-xl p-6 border border-deepRed/20">
    <div className="flex items-center gap-3 text-deepRed">
      <Icons.alert />
      <span className="text-base font-medium">{message}</span>
    </div>
  </div>
)

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

  const hasActiveFilters = search !== '' || category !== ''
  const hasFilteredItems = filtered.length > 0

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
    showToast('Unit price recalculated')
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

  const deactivate = async (id: string) => {
    const ok = window.confirm('Deactivate this ingredient? It will be hidden from pickers.')
    if (!ok) return
    const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
    if (error) return showToast(error.message)
    showToast('Ingredient deactivated')
    await load()
  }

  const hardDelete = async (id: string) => {
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) {
      const msg = String((error as any).message || '')
      const code = String((error as any).code || '')
      if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
        return showToast('Cannot delete: ingredient is in use')
      }
      return showToast(msg || 'Delete failed')
    }
    showToast('Ingredient deleted')
    await load()
  }

  const bulkRecalcNetCosts = async () => {
    if (filtered.length === 0) return
    const ok = window.confirm("Recalculate unit costs for " + filtered.length + " filtered items?")
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
    const action = active ? 'Activate' : 'Deactivate'
    const ok = window.confirm(action + " " + filtered.length + " filtered items?")
    if (!ok) return

    setBulkWorking(true)
    try {
      for (const r of filtered) {
        const { error } = await supabase.from('ingredients').update({ is_active: active }).eq('id', r.id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast("Bulk " + action.toLowerCase() + " done")
      await load()
    } catch (e: any) {
      showToast(e?.message ?? "Bulk " + action.toLowerCase() + " failed")
    } finally {
      setBulkWorking(false)
    }
  }

  return (
    <div className="min-h-screen bg-ivory">
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Header - Bold & Clear */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-light text-charcoal tracking-tight">Ingredients</h1>
            <p className="text-base text-stone-600 mt-1">
              {filtered.length} items · {stats.missingCost} need pricing
            </p>
          </div>
          {isDebug && kitchenId && (
            <span className="text-xs font-mono font-medium text-stone-500 bg-cream border border-border px-3 py-1.5 rounded-lg">
              {kitchenId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Primary Action - Strong & Visible */}
        <div className="flex items-center justify-between mb-8">
          <button
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-forest-500 text-white text-base font-semibold rounded-xl hover:bg-forest-600 transition-colors shadow-md"
            onClick={openCreate}
          >
            <Icons.plus />
            New ingredient
          </button>

          {/* Bulk actions - visible when needed */}
          {hasFilteredItems && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-stone-500">Filtered:</span>
              <button
                className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border rounded-lg hover:bg-forest-50 hover:border-forest-300 transition-colors disabled:opacity-40"
                onClick={bulkRecalcNetCosts}
                disabled={bulkWorking}
              >
                Recalculate costs
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border rounded-lg hover:bg-forest-50 hover:border-forest-300 transition-colors disabled:opacity-40"
                onClick={() => bulkSetActive(true)}
                disabled={bulkWorking}
              >
                Activate all
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border rounded-lg hover:bg-forest-50 hover:border-forest-300 transition-colors disabled:opacity-40"
                onClick={() => bulkSetActive(false)}
                disabled={bulkWorking}
              >
                Deactivate all
              </button>
            </div>
          )}
        </div>

        {/* Filters - Sharp & Precise */}
        <div className="flex items-center gap-3 mb-8">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
                <Icons.search />
              </span>
              <input
                className="w-full pl-11 pr-10 py-3 bg-white border border-border rounded-xl text-base text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredients..."
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-forest-700"
                  onClick={() => setSearch('')}
                >
                  <Icons.close width={16} height={16} />
                </button>
              )}
            </div>
          </div>

          {/* Category filter */}
          <select
            className="px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            className="px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Name</option>
            <option value="cost">Unit cost</option>
            <option value="pack_price">Pack price</option>
          </select>

          {/* Show inactive toggle */}
          <button
            className={cls(
              "inline-flex items-center gap-2 px-4 py-3 rounded-xl text-base font-medium transition-colors",
              showInactive
                ? "bg-forest-500 text-white border border-forest-500"
                : "bg-white text-charcoal border border-border hover:bg-forest-50"
            )}
            onClick={() => setShowInactive(!showInactive)}
          >
            <div className={cls(
              "w-5 h-5 rounded-md border flex items-center justify-center",
              showInactive ? "bg-white border-white" : "bg-white border-stone-400"
            )}>
              {showInactive && <Icons.check width={12} height={12} className="text-forest-500" />}
            </div>
            <span>Show inactive</span>
          </button>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              className="p-3 bg-white border border-border rounded-xl text-stone-400 hover:text-forest-700 hover:border-forest-300 transition-colors"
              onClick={() => {
                setSearch('')
                setCategory('')
              }}
              title="Clear filters"
            >
              <Icons.reset />
            </button>
          )}
        </div>

        {/* Stats - Strong Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total items"
            value={stats.items}
            sublabel="filtered results"
          />
          <StatCard
            label="Average cost"
            value={money(stats.avgNet)}
            sublabel="per unit"
          />
          <StatCard
            label="Missing costs"
            value={stats.missingCost}
            sublabel="need attention"
            warning={stats.missingCost > 0}
          />
          <StatCard
            label="Warnings"
            value={stats.warnUnits}
            sublabel="unit mismatches"
            warning={stats.warnUnits > 0}
          />
        </div>

        {/* Main content */}
        {loading && <LoadingState />}

        {err && <ErrorState message={err} />}

        {!loading && !err && (
          <>
            {filtered.length === 0 ? (
              <EmptyState onAdd={openCreate} hasFilters={hasActiveFilters || !showInactive} />
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-cream">
                        <th className="px-4 py-4 text-left text-xs font-semibold text-stone-600 uppercase tracking-wider">Code</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-stone-600 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-stone-600 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-stone-600 uppercase tracking-wider">Pack</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-stone-600 uppercase tracking-wider">Unit</th>
                        <th className="px-4 py-4 text-right text-xs font-semibold text-stone-600 uppercase tracking-wider">Pack Price</th>
                        <th className="px-4 py-4 text-right text-xs font-semibold text-stone-600 uppercase tracking-wider">Unit Price</th>
                        <th className="px-4 py-4 text-right text-xs font-semibold text-stone-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientTableRow
                            key={r.id}
                            ingredient={r}
                            isDebug={isDebug}
                            onEdit={openEdit}
                            onDeactivate={deactivate}
                            onHardDelete={hardDelete}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal */}
        <Modal open={modalOpen} title={editingId ? 'Edit ingredient' : 'New ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <FormField label="Name" required>
                <input
                  className="w-full px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Category">
                  <input
                    className="w-full px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </FormField>
                <FormField label="Supplier">
                  <input
                    className="w-full px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </FormField>
              </div>
            </div>

            {/* Code Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-charcoal">Code system</h3>
                <span className="text-xs font-mono font-medium bg-cream text-stone-500 px-2 py-1 rounded-md border border-border">Optional</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Ingredient code" hint="ING-000123">
                  <input
                    className={cls(
                      "w-full px-4 py-3 bg-white border border-border rounded-xl text-base font-mono text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors",
                      !canEditCodes && "opacity-50 bg-cream cursor-not-allowed"
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
                      "w-full px-4 py-3 bg-white border border-border rounded-xl text-base font-mono text-charcoal placeholder:text-stone-400 focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors",
                      !canEditCodes && "opacity-50 bg-cream cursor-not-allowed"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormField>
              </div>
              {!canEditCodes && (
                <p className="text-sm text-amber flex items-center gap-1">
                  <Icons.alert width={14} height={14} />
                  Owner-only
                </p>
              )}
            </div>

            {/* Pack & Cost */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-charcoal">Pack & Cost</h3>

              {/* Unit selector */}
              <div className="flex gap-2">
                {['g', 'kg', 'ml', 'l', 'pcs'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setFPackUnit(unit)}
                    className={cls(
                      "flex-1 px-4 py-2.5 text-base font-mono font-medium rounded-lg border transition-colors",
                      fPackUnit === unit
                        ? "bg-forest-500 text-white border-forest-500"
                        : "bg-white text-charcoal border-border hover:border-forest-300"
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Pack size" required>
                  <div className="relative">
                    <input
                      className="w-full px-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors pr-16"
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-mono text-stone-500">
                      {fPackUnit}
                    </span>
                  </div>
                </FormField>
                <FormField label="Unit" required>
                  <div className="px-4 py-3 bg-cream border border-border rounded-xl text-base text-charcoal font-mono">
                    {fPackUnit}
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Pack price" required>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">$</span>
                    <input
                      className="w-full pl-8 pr-4 py-3 bg-white border border-border rounded-xl text-base text-charcoal focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors"
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                    />
                  </div>
                </FormField>
                <FormField label="Unit price" hint={"per " + fPackUnit}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 text-lg">$</span>
                    <input
                      className="w-full pl-8 pr-16 py-3 bg-white border border-border rounded-xl text-base text-charcoal focus:outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition-colors font-mono"
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-mono text-stone-500">
                      {"/" + fPackUnit}
                    </span>
                  </div>
                </FormField>
              </div>

              {/* Calculation preview */}
              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="p-4 bg-forest-50/50 rounded-xl border border-forest-200">
                  <div className="flex items-center justify-between text-base">
                    <span className="font-medium text-forest-700">Preview:</span>
                    <span className="font-mono font-medium text-forest-800">
                      {"$" + parseFloat(fPackPrice) + " ÷ " + parseFloat(fPackSize) + " " + fPackUnit + " = $" + (parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4) + "/" + fPackUnit}
                    </span>
                  </div>
                  <button
                    className="w-full mt-3 px-4 py-2.5 bg-white text-forest-700 rounded-lg text-base font-medium border border-forest-200 hover:bg-forest-50 transition-colors flex items-center justify-center gap-2"
                    onClick={smartRecalcNetCost}
                  >
                    <Icons.bolt width={14} height={14} />
                    Apply to unit price
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                className="px-5 py-2.5 text-base font-medium text-stone-600 hover:text-charcoal hover:bg-cream rounded-lg transition-colors"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2.5 bg-forest-500 text-white text-base font-semibold rounded-lg hover:bg-forest-600 transition-colors disabled:opacity-40"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>

        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>
    </div>
  )
}
