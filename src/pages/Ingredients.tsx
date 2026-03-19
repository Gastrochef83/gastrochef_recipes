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

// ==================== NOMAD - الهوية البصرية النووية الجديدة ====================
// تصميم مستوحى من السفر، الخرائط، الاستكشاف، والرفاهية البدوية

const Icons = {
  search: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  delete: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  plus: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  chevronDown: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  dollar: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  bolt: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  check: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  reset: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  deactivate: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  nomad: (props: any) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" {...props}>
      <path d="M3 12 L12 3 L21 12 L12 21 L3 12" />
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 3 L12 21 M3 12 L21 12" strokeOpacity="0.3" />
    </svg>
  ),
  compass: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" strokeOpacity="0.5" />
      <path d="M12 12 L16 8 L12 16 L8 8 L12 12" fill="currentColor" fillOpacity="0.1" />
    </svg>
  ),
}

// ==================== NOMAD - لوحة الألوان ====================
const colors = {
  sand: {
    50: '#faf7f2',
    100: '#f5efe5',
    200: '#ebe0d1',
    300: '#dbcbb5',
    400: '#c9b69a',
    500: '#AA8C6A', // Sand Dune - الأساسي
    600: '#8a6e4f',
    700: '#6b533c',
    800: '#4c3b2a',
    900: '#2d2319',
  },
  earth: {
    500: '#8B7E6C', // Earth - ثانوي
    400: '#A59884',
    300: '#BFB2A0',
  },
  rust: {
    500: '#B75D3A', // Rust - أكcent
    400: '#D17A58',
  },
  slate: '#4A5B5E', // Slate - تحذيرات
  clay: '#C45E3A', // Clay - destructive
  paper: '#FCF9F5', // ورق - خلفية
  text: {
    primary: '#2C2824',
    secondary: '#5C554C',
    tertiary: '#8B8278',
  }
}

// ==================== وحدة القياس - بوصلة ====================
const UnitCompass = ({ unit }: { unit: string }) => {
  const unitMap: Record<string, string> = {
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'L',
    pcs: 'pcs',
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-medium text-sand-700 bg-sand-50 border border-sand-200 tracking-wider">
      <Icons.compass width={10} height={10} className="text-sand-400" />
      {unitMap[unit] || unit}
    </span>
  )
}

// ==================== عرض السعر - صحراوي ====================
const PriceNomad = ({ amount, unit }: { amount: number; unit: string }) => (
  <div className="flex items-center justify-end gap-2">
    <span className="font-mono text-sm font-light text-text-primary tracking-wide">
      {money(amount)}
    </span>
    <UnitCompass unit={unit} />
  </div>
)

// ==================== مودال - خيمة ====================
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
            className="absolute inset-0 bg-black/5 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-lg mx-auto"
            initial={{ scale: 0.98, opacity: 0, y: 5 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
          >
            <div className="bg-paper border border-sand-200 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-sand-100">
                <div className="flex items-center gap-3">
                  <Icons.nomad width={20} height={20} className="text-sand-500" />
                  <h2 className="text-base font-light tracking-wide text-text-primary">{title}</h2>
                </div>
                <button
                  className="p-1.5 text-text-tertiary hover:text-sand-600 transition-colors"
                  onClick={onClose}
                >
                  <Icons.close />
                </button>
              </div>
              <div className="px-6 py-5 max-h-[calc(90vh-8rem)] overflow-y-auto">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== حقل النموذج - صحراوي ====================
const FormFieldNomad = ({
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
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium tracking-wide text-text-secondary">
        {label}
        {required && <span className="text-clay ml-1">*</span>}
      </label>
      {hint && <span className="text-[9px] text-text-tertiary">{hint}</span>}
    </div>
    {children}
  </div>
)

// ==================== صف الجدول - بدوي ====================
const IngredientRowNomad = memo(function IngredientRowNomad({
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
        'group border-b border-sand-100 last:border-0 hover:bg-sand-50/30 transition-colors',
        !active && 'opacity-40'
      )}
    >
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-text-tertiary">
          {ingredient.code || '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-sm font-light tracking-wide text-text-primary",
            !active && "line-through text-text-tertiary"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {hasWarning && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-mono text-slate bg-slate/5 border border-slate/20">
              <Icons.alert width={8} height={8} />
              CHECK
            </span>
          )}
        </div>
        {isDebug && (
          <div className="text-[7px] font-mono text-text-tertiary mt-1">
            {ingredient.id.slice(0, 6)}...
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-text-secondary">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-mono text-text-primary">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-3">
        <UnitCompass unit={unit} />
      </td>
      <td className="px-4 py-3">
        <PriceNomad amount={toNum(ingredient.pack_price, 0)} unit={unit} />
      </td>
      <td className="px-4 py-3">
        <PriceNomad amount={net} unit={unit} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-text-tertiary hover:text-sand-600 transition-colors"
            onClick={() => onEdit(ingredient)}
            title="Edit"
          >
            <Icons.edit />
          </button>
          {active && (
            <button
              className="p-1.5 text-text-tertiary hover:text-rust-400 transition-colors"
              onClick={() => onDeactivate(ingredient.id)}
              title="Deactivate"
            >
              <Icons.deactivate />
            </button>
          )}
          <button
            className="p-1.5 text-text-tertiary hover:text-clay transition-colors"
            onClick={() => {
              if (window.confirm('Delete permanently? This cannot be undone.')) {
                onHardDelete(ingredient.id)
              }
            }}
            title="Delete"
          >
            <Icons.delete />
          </button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== بطاقة إحصائية - رملية ====================
const StatCardNomad = ({ label, value, sublabel, warning }: { label: string; value: string | number; sublabel: string; warning?: boolean }) => (
  <div className="bg-paper border border-sand-200 p-5">
    <div className="text-[9px] font-medium tracking-wider text-text-tertiary uppercase mb-1">
      {label}
    </div>
    <div className={cls(
      "text-xl font-light tracking-wide",
      warning ? "text-slate" : "text-text-primary"
    )}>
      {value}
    </div>
    <div className="text-[9px] text-text-tertiary mt-1">
      {sublabel}
    </div>
  </div>
)

// ==================== حالة فارغة - صحراء ====================
const EmptyStateNomad = ({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) => (
  <div className="bg-paper border border-sand-200 p-12 text-center">
    <div className="w-16 h-16 mx-auto mb-4 bg-sand-100 flex items-center justify-center border border-sand-200">
      <Icons.nomad width={32} height={32} className="text-sand-400" />
    </div>
    <h3 className="text-lg font-light tracking-wide text-text-primary mb-2">
      {hasFilters ? 'No destinations found' : 'Empty territory'}
    </h3>
    <p className="text-sm text-text-secondary max-w-sm mx-auto mb-6">
      {hasFilters
        ? 'Try adjusting your compass to discover new ingredients.'
        : 'Begin your journey by adding your first ingredient to the map.'}
    </p>
    <button
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-sand-500 text-white text-sm font-light tracking-wide hover:bg-sand-600 transition-colors border border-sand-600"
      onClick={onAdd}
    >
      <Icons.plus width={16} height={16} />
      Add ingredient
    </button>
  </div>
)

// ==================== حالة التحميل ====================
const LoadingStateNomad = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-paper border border-sand-200 p-5">
          <Skeleton className="h-3 w-16 mb-2 bg-sand-100" />
          <Skeleton className="h-5 w-20 mb-1 bg-sand-100" />
          <Skeleton className="h-3 w-24 bg-sand-100" />
        </div>
      ))}
    </div>
    <div className="bg-paper border border-sand-200 p-5">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-1.5">
            <Skeleton className="h-3 w-16 bg-sand-100" />
            <Skeleton className="h-3 w-32 flex-1 bg-sand-100" />
            <Skeleton className="h-3 w-20 bg-sand-100" />
            <Skeleton className="h-3 w-20 bg-sand-100" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

// ==================== حالة الخطأ ====================
const ErrorStateNomad = ({ message }: { message: string }) => (
  <div className="bg-clay/5 border border-clay/20 p-5">
    <div className="flex items-center gap-3 text-clay">
      <Icons.alert />
      <span className="text-sm font-light">{message}</span>
    </div>
  </div>
)

// ==================== المكون الرئيسي ====================
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
    <div className="min-h-screen bg-paper">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header - بوصلة */}
        <div className="flex items-center justify-between mb-8 border-b border-sand-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sand-100 flex items-center justify-center border border-sand-200">
              <Icons.nomad width={20} height={20} className="text-sand-600" />
            </div>
            <div>
              <h1 className="text-lg font-light tracking-wide text-text-primary">NOMAD</h1>
              <p className="text-[10px] text-text-tertiary tracking-wider mt-0.5">
                {filtered.length} items · {stats.missingCost} uncharted
              </p>
            </div>
          </div>
          {isDebug && kitchenId && (
            <span className="text-[9px] font-mono text-text-tertiary bg-sand-50 border border-sand-200 px-2 py-1">
              {kitchenId.slice(0, 6)}…
            </span>
          )}
        </div>

        {/* Primary Action - بوصلة */}
        <div className="flex items-center justify-between mb-6">
          <button
            className="inline-flex items-center gap-2 px-4 py-2 bg-sand-500 text-white text-xs font-light tracking-wide hover:bg-sand-600 transition-colors border border-sand-600"
            onClick={openCreate}
          >
            <Icons.plus width={14} height={14} />
            New ingredient
          </button>

          {hasFilteredItems && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-tertiary tracking-wider">FILTERED:</span>
              <button
                className="px-3 py-1.5 text-[10px] font-light text-text-secondary bg-paper border border-sand-200 hover:bg-sand-50 transition-colors"
                onClick={bulkRecalcNetCosts}
                disabled={bulkWorking}
              >
                Recalculate
              </button>
              <button
                className="px-3 py-1.5 text-[10px] font-light text-text-secondary bg-paper border border-sand-200 hover:bg-sand-50 transition-colors"
                onClick={() => bulkSetActive(true)}
                disabled={bulkWorking}
              >
                Activate all
              </button>
              <button
                className="px-3 py-1.5 text-[10px] font-light text-text-secondary bg-paper border border-sand-200 hover:bg-sand-50 transition-colors"
                onClick={() => bulkSetActive(false)}
                disabled={bulkWorking}
              >
                Deactivate all
              </button>
            </div>
          )}
        </div>

        {/* Filters - رحلة */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                <Icons.search />
              </span>
              <input
                className="w-full pl-8 pr-7 py-2 bg-paper border border-sand-200 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredients..."
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-sand-600"
                  onClick={() => setSearch('')}
                >
                  <Icons.close width={12} height={12} />
                </button>
              )}
            </div>
          </div>

          <select
            className="px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary focus:outline-none focus:border-sand-500 transition-colors"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary focus:outline-none focus:border-sand-500 transition-colors"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Name</option>
            <option value="cost">Unit cost</option>
            <option value="pack_price">Pack price</option>
          </select>

          <button
            className={cls(
              "inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors",
              showInactive
                ? "bg-sand-500 text-white border border-sand-600"
                : "bg-paper text-text-secondary border border-sand-200 hover:bg-sand-50"
            )}
            onClick={() => setShowInactive(!showInactive)}
          >
            <div className={cls(
              "w-3 h-3 border flex items-center justify-center",
              showInactive ? "bg-white border-white" : "bg-transparent border-text-tertiary"
            )}>
              {showInactive && <Icons.check width={8} height={8} className="text-sand-500" />}
            </div>
            <span>Inactive</span>
          </button>

          {hasActiveFilters && (
            <button
              className="p-2 bg-paper border border-sand-200 text-text-tertiary hover:text-sand-600 hover:border-sand-300 transition-colors"
              onClick={() => {
                setSearch('')
                setCategory('')
              }}
              title="Clear filters"
            >
              <Icons.reset width={12} height={12} />
            </button>
          )}
        </div>

        {/* Stats - كثبان */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCardNomad
            label="TOTAL"
            value={stats.items}
            sublabel="filtered"
          />
          <StatCardNomad
            label="AVG"
            value={money(stats.avgNet)}
            sublabel="per unit"
          />
          <StatCardNomad
            label="VOID"
            value={stats.missingCost}
            sublabel="missing"
            warning={stats.missingCost > 0}
          />
          <StatCardNomad
            label="WARN"
            value={stats.warnUnits}
            sublabel="warnings"
            warning={stats.warnUnits > 0}
          />
        </div>

        {/* Main content */}
        {loading && <LoadingStateNomad />}

        {err && <ErrorStateNomad message={err} />}

        {!loading && !err && (
          <>
            {filtered.length === 0 ? (
              <EmptyStateNomad onAdd={openCreate} hasFilters={hasActiveFilters || !showInactive} />
            ) : (
              <div className="bg-paper border border-sand-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-sand-100 bg-sand-50/30">
                        <th className="px-4 py-2 text-left text-[8px] font-medium text-text-tertiary uppercase tracking-wider">CODE</th>
                        <th className="px-4 py-2 text-left text-[8px] font-medium text-text-tertiary uppercase tracking-wider">NAME</th>
                        <th className="px-4 py-2 text-left text-[8px] font-medium text-text-tertiary uppercase tracking-wider">CATEGORY</th>
                        <th className="px-4 py-2 text-center text-[8px] font-medium text-text-tertiary uppercase tracking-wider">PACK</th>
                        <th className="px-4 py-2 text-center text-[8px] font-medium text-text-tertiary uppercase tracking-wider">UNIT</th>
                        <th className="px-4 py-2 text-right text-[8px] font-medium text-text-tertiary uppercase tracking-wider">PACK</th>
                        <th className="px-4 py-2 text-right text-[8px] font-medium text-text-tertiary uppercase tracking-wider">UNIT</th>
                        <th className="px-4 py-2 text-right text-[8px] font-medium text-text-tertiary uppercase tracking-wider">ACT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sand-100">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientRowNomad
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

        {/* Modal - خيمة */}
        <Modal open={modalOpen} title={editingId ? 'Edit ingredient' : 'New ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-5">
            <div className="space-y-3">
              <FormFieldNomad label="Name" required>
                <input
                  className="w-full px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </FormFieldNomad>

              <div className="grid grid-cols-2 gap-3">
                <FormFieldNomad label="Category">
                  <input
                    className="w-full px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </FormFieldNomad>
                <FormFieldNomad label="Supplier">
                  <input
                    className="w-full px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </FormFieldNomad>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-medium tracking-wide text-text-secondary">Code system</h3>
                <span className="text-[7px] font-mono text-text-tertiary bg-sand-50 px-1.5 py-0.5 border border-sand-200">OPT</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormFieldNomad label="Ingredient code" hint="ING-000123">
                  <input
                    className={cls(
                      "w-full px-3 py-2 bg-paper border border-sand-200 text-xs font-mono text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors",
                      !canEditCodes && "opacity-50 bg-sand-50 cursor-not-allowed"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                </FormFieldNomad>
                <FormFieldNomad label="Category code" hint={`e.g. ${suggestedCodeCategory}`}>
                  <input
                    className={cls(
                      "w-full px-3 py-2 bg-paper border border-sand-200 text-xs font-mono text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-sand-500 transition-colors",
                      !canEditCodes && "opacity-50 bg-sand-50 cursor-not-allowed"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormFieldNomad>
              </div>
              {!canEditCodes && (
                <p className="text-[9px] text-rust-400 flex items-center gap-1">
                  <Icons.alert width={10} height={10} />
                  Owner-only
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-medium tracking-wide text-text-secondary">Pack & Cost</h3>

              <div className="flex gap-1">
                {['g', 'kg', 'ml', 'l', 'pcs'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setFPackUnit(unit)}
                    className={cls(
                      "flex-1 px-2 py-1.5 text-[9px] font-mono border transition-colors",
                      fPackUnit === unit
                        ? "bg-sand-500 text-white border-sand-600"
                        : "bg-paper text-text-secondary border-sand-200 hover:border-sand-300"
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormFieldNomad label="Pack size" required>
                  <div className="relative">
                    <input
                      className="w-full px-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary focus:outline-none focus:border-sand-500 transition-colors pr-10"
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-mono text-text-tertiary">
                      {fPackUnit}
                    </span>
                  </div>
                </FormFieldNomad>
                <FormFieldNomad label="Unit" required>
                  <div className="px-3 py-2 bg-sand-50 border border-sand-200 text-xs text-text-primary font-mono">
                    {fPackUnit}
                  </div>
                </FormFieldNomad>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormFieldNomad label="Pack price" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">$</span>
                    <input
                      className="w-full pl-7 pr-3 py-2 bg-paper border border-sand-200 text-xs text-text-primary focus:outline-none focus:border-sand-500 transition-colors"
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                    />
                  </div>
                </FormFieldNomad>
                <FormFieldNomad label="Unit price" hint={"per " + fPackUnit}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">$</span>
                    <input
                      className="w-full pl-7 pr-10 py-2 bg-paper border border-sand-200 text-xs text-text-primary focus:outline-none focus:border-sand-500 transition-colors font-mono"
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-mono text-text-tertiary">
                      {"/" + fPackUnit}
                    </span>
                  </div>
                </FormFieldNomad>
              </div>

              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="p-3 bg-sand-50 border border-sand-200">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-sand-600">Journey:</span>
                    <span className="font-mono text-text-secondary">
                      {"$" + parseFloat(fPackPrice) + " ÷ " + parseFloat(fPackSize) + " " + fPackUnit + " = $" + (parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4) + "/" + fPackUnit}
                    </span>
                  </div>
                  <button
                    className="w-full mt-2 px-3 py-1.5 bg-paper text-sand-600 text-[9px] border border-sand-200 hover:bg-sand-50 transition-colors flex items-center justify-center gap-1"
                    onClick={smartRecalcNetCost}
                  >
                    <Icons.bolt width={10} height={10} />
                    Apply
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-sand-100">
              <button
                className="px-4 py-2 text-[10px] text-text-secondary hover:text-text-primary hover:bg-sand-50 transition-colors"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-sand-500 text-white text-[10px] font-light tracking-wide hover:bg-sand-600 transition-colors disabled:opacity-40"
                onClick={save}
                disabled={saving}
              >
                {saving ? '…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>

        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>
    </div>
  )
}
