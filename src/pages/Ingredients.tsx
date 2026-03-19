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

// ==================== SOLARA - الهوية البصرية النووية الجديدة ====================
// تصميم مستوحى من الضوء، البلورات، والطاقة الشمسية

const Icons = {
  search: (props: any) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  close: (props: any) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  edit: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  delete: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  plus: (props: any) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  chevronDown: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  dollar: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  bolt: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  check: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  reset: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  deactivate: (props: any) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  solara: (props: any) => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12 M4 4 L7 7 M17 17 L20 20 M4 20 L7 17 M17 7 L20 4" strokeOpacity="0.5" />
    </svg>
  ),
  ray: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M12 2 L12 8 M12 16 L12 22 M2 12 L8 12 M16 12 L22 12 M5 5 L9 9 M15 15 L19 19 M5 19 L9 15 M15 9 L19 5" strokeOpacity="0.3" />
    </svg>
  ),
}

// ==================== SOLARA - لوحة الألوان النووية ====================
const colors = {
  solara: {
    50: '#f2f0fe',
    100: '#e4e0fd',
    200: '#c9c1fb',
    300: '#aea2f9',
    400: '#9383f7',
    500: '#6C5CE7', // Solara Purple - الأساسي
    600: '#5646c9',
    700: '#4135a6',
    800: '#2b2482',
    900: '#16135e',
  },
  sun: {
    500: '#FFD166', // Sun Gold - أكcent
    400: '#FFDF99',
    600: '#E5B84C',
  },
  sky: {
    500: '#48CAE4', // Sky Blue - ثانوي
    400: '#7BD3F0',
  },
  coral: '#FF6B6B', // Coral - destructive
  surface: '#FFFFFF', // أبيض نقي
  background: '#F8F7FF', // خلفية بنفسجية فاتحة جداً
  text: {
    primary: '#1E1E2E',
    secondary: '#4A4A5E',
    tertiary: '#6B6B7E',
  }
}

// ==================== وحدة القياس - شعاعية ====================
const UnitRay = ({ unit }: { unit: string }) => {
  const unitMap: Record<string, string> = {
    g: 'g',
    kg: 'kg',
    ml: 'mL',
    l: 'L',
    pcs: 'pc',
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono font-medium text-solara-600 bg-solara-50 border border-solara-200 rounded-full">
      <Icons.ray width={10} height={10} className="text-solara-400" />
      {unitMap[unit] || unit}
    </span>
  )
}

// ==================== عرض السعر - شمسي ====================
const PriceSolara = ({ amount, unit }: { amount: number; unit: string }) => (
  <div className="flex items-center justify-end gap-2">
    <span className="font-mono text-sm font-medium text-text-primary">
      {money(amount)}
    </span>
    <UnitRay unit={unit} />
  </div>
)

// ==================== مودال - شفاف ====================
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
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
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
            <div className="bg-white/90 backdrop-blur-xl border border-solara-200 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-solara-100">
                <div className="flex items-center gap-3">
                  <Icons.solara width={24} height={24} className="text-solara-500" />
                  <h2 className="text-lg font-light text-text-primary">{title}</h2>
                </div>
                <button
                  className="p-2 rounded-full hover:bg-solara-50 text-text-tertiary hover:text-solara-600 transition-colors"
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

// ==================== حقل النموذج - شمسي ====================
const FormFieldSolara = ({
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
      <label className="text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="text-coral ml-1">*</span>}
      </label>
      {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
    </div>
    {children}
  </div>
)

// ==================== صف الجدول - شمسي ====================
const IngredientRowSolara = memo(function IngredientRowSolara({
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
        'group border-b border-solara-100 last:border-0 hover:bg-solara-50/50 transition-colors',
        !active && 'opacity-40'
      )}
    >
      <td className="px-4 py-4">
        <span className="text-xs font-mono text-text-tertiary">
          {ingredient.code || '—'}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-sm font-medium text-text-primary",
            !active && "line-through text-text-tertiary"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {hasWarning && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-medium bg-sun-500/10 text-sun-600 border border-sun-200">
              <Icons.alert width={10} height={10} />
              ATTENTION
            </span>
          )}
        </div>
        {isDebug && (
          <div className="text-[8px] font-mono text-text-tertiary mt-1">
            {ingredient.id.slice(0, 8)}...
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-xs text-text-secondary">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-4 text-center">
        <span className="text-sm font-mono text-text-primary">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-4">
        <UnitRay unit={unit} />
      </td>
      <td className="px-4 py-4">
        <PriceSolara amount={toNum(ingredient.pack_price, 0)} unit={unit} />
      </td>
      <td className="px-4 py-4">
        <PriceSolara amount={net} unit={unit} />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded-full hover:bg-solara-100 text-text-tertiary hover:text-solara-600 transition-colors"
            onClick={() => onEdit(ingredient)}
            title="Edit"
          >
            <Icons.edit />
          </button>
          {active && (
            <button
              className="p-1.5 rounded-full hover:bg-solara-100 text-text-tertiary hover:text-sun-600 transition-colors"
              onClick={() => onDeactivate(ingredient.id)}
              title="Deactivate"
            >
              <Icons.deactivate />
            </button>
          )}
          <button
            className="p-1.5 rounded-full hover:bg-solara-100 text-text-tertiary hover:text-coral transition-colors"
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

// ==================== بطاقة إحصائية - شمسية ====================
const StatCardSolara = ({ label, value, sublabel, warning }: { label: string; value: string | number; sublabel: string; warning?: boolean }) => (
  <div className="bg-white border border-solara-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
      {label}
    </div>
    <div className={cls(
      "text-2xl font-light",
      warning ? "text-sun-600" : "text-text-primary"
    )}>
      {value}
    </div>
    <div className="text-[10px] text-text-tertiary mt-2">
      {sublabel}
    </div>
  </div>
)

// ==================== حالة فارغة - شمسية ====================
const EmptyStateSolara = ({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) => (
  <div className="bg-white border border-solara-100 rounded-2xl p-16 text-center shadow-sm">
    <div className="w-20 h-20 mx-auto mb-6 bg-solara-50 rounded-full flex items-center justify-center">
      <Icons.solara width={48} height={48} className="text-solara-300" />
    </div>
    <h3 className="text-xl font-light text-text-primary mb-3">
      {hasFilters ? 'No results found' : 'No ingredients yet'}
    </h3>
    <p className="text-sm text-text-secondary max-w-sm mx-auto mb-8">
      {hasFilters
        ? 'Try adjusting your filters to see more results.'
        : 'Start building your kitchen by adding your first ingredient.'}
    </p>
    <button
      className="inline-flex items-center gap-2 px-6 py-3 bg-solara-500 text-white text-sm font-medium rounded-full hover:bg-solara-600 transition-colors shadow-sm"
      onClick={onAdd}
    >
      <Icons.plus width={18} height={18} />
      Add ingredient
    </button>
  </div>
)

// ==================== حالة التحميل ====================
const LoadingStateSolara = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white border border-solara-100 rounded-2xl p-6">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-6 w-20 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
    <div className="bg-white border border-solara-100 rounded-2xl p-6">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-32 flex-1" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

// ==================== حالة الخطأ ====================
const ErrorStateSolara = ({ message }: { message: string }) => (
  <div className="bg-coral/5 border border-coral/20 rounded-2xl p-6">
    <div className="flex items-center gap-3 text-coral">
      <Icons.alert />
      <span className="text-sm font-medium">{message}</span>
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
    <div className="min-h-screen bg-background">
      {/* خلفية شعاعية */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-solara-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sun-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        {/* Header - شمسي */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-solara-500 to-sky-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-solara-500/20">
                <Icons.solara width={28} height={28} />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-solara-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-solara-500" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-light text-text-primary tracking-tight flex items-center gap-3">
                SOLARA
                <span className="text-[8px] font-mono text-solara-500 bg-solara-50 px-2 py-1 rounded-full border border-solara-200">
                  RADIANT
                </span>
              </h1>
              <p className="text-sm text-text-tertiary mt-1">
                {filtered.length} items · {stats.missingCost} need attention
              </p>
            </div>
          </div>
          {isDebug && kitchenId && (
            <span className="text-xs font-mono text-text-tertiary bg-white border border-solara-200 px-3 py-1.5 rounded-full shadow-sm">
              {kitchenId.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Primary Action - شمسي */}
        <div className="flex items-center justify-between mb-8">
          <button
            className="inline-flex items-center gap-2 px-6 py-3 bg-solara-500 text-white text-sm font-medium rounded-full hover:bg-solara-600 transition-colors shadow-lg shadow-solara-500/20"
            onClick={openCreate}
          >
            <Icons.plus width={18} height={18} />
            New ingredient
          </button>

          {hasFilteredItems && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-text-tertiary">Filtered:</span>
              <button
                className="px-4 py-2 text-xs font-medium text-text-secondary bg-white border border-solara-200 rounded-full hover:bg-solara-50 hover:border-solara-300 transition-colors shadow-sm disabled:opacity-40"
                onClick={bulkRecalcNetCosts}
                disabled={bulkWorking}
              >
                Recalculate
              </button>
              <button
                className="px-4 py-2 text-xs font-medium text-text-secondary bg-white border border-solara-200 rounded-full hover:bg-solara-50 hover:border-solara-300 transition-colors shadow-sm disabled:opacity-40"
                onClick={() => bulkSetActive(true)}
                disabled={bulkWorking}
              >
                Activate all
              </button>
              <button
                className="px-4 py-2 text-xs font-medium text-text-secondary bg-white border border-solara-200 rounded-full hover:bg-solara-50 hover:border-solara-300 transition-colors shadow-sm disabled:opacity-40"
                onClick={() => bulkSetActive(false)}
                disabled={bulkWorking}
              >
                Deactivate all
              </button>
            </div>
          )}
        </div>

        {/* Filters - شمسية */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                <Icons.search />
              </span>
              <input
                className="w-full pl-11 pr-10 py-3 bg-white border border-solara-200 rounded-full text-sm text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredients..."
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-solara-600"
                  onClick={() => setSearch('')}
                >
                  <Icons.close width={16} height={16} />
                </button>
              )}
            </div>
          </div>

          <select
            className="px-4 py-3 bg-white border border-solara-200 rounded-full text-sm text-text-primary focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors shadow-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            className="px-4 py-3 bg-white border border-solara-200 rounded-full text-sm text-text-primary focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors shadow-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Name</option>
            <option value="cost">Unit cost</option>
            <option value="pack_price">Pack price</option>
          </select>

          <button
            className={cls(
              "inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium transition-colors shadow-sm",
              showInactive
                ? "bg-solara-500 text-white border border-solara-500"
                : "bg-white text-text-secondary border border-solara-200 hover:bg-solara-50"
            )}
            onClick={() => setShowInactive(!showInactive)}
          >
            <div className={cls(
              "w-4 h-4 rounded-full border flex items-center justify-center",
              showInactive ? "bg-white border-white" : "bg-white border-text-tertiary"
            )}>
              {showInactive && <Icons.check width={10} height={10} className="text-solara-500" />}
            </div>
            <span>Show inactive</span>
          </button>

          {hasActiveFilters && (
            <button
              className="p-3 bg-white border border-solara-200 rounded-full text-text-tertiary hover:text-solara-600 hover:border-solara-300 transition-colors shadow-sm"
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

        {/* Stats - بطاقات شمسية */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCardSolara
            label="TOTAL ITEMS"
            value={stats.items}
            sublabel="filtered results"
          />
          <StatCardSolara
            label="AVG COST"
            value={money(stats.avgNet)}
            sublabel="per unit"
          />
          <StatCardSolara
            label="MISSING"
            value={stats.missingCost}
            sublabel="need pricing"
            warning={stats.missingCost > 0}
          />
          <StatCardSolara
            label="WARNINGS"
            value={stats.warnUnits}
            sublabel="unit issues"
            warning={stats.warnUnits > 0}
          />
        </div>

        {/* Main content */}
        {loading && <LoadingStateSolara />}

        {err && <ErrorStateSolara message={err} />}

        {!loading && !err && (
          <>
            {filtered.length === 0 ? (
              <EmptyStateSolara onAdd={openCreate} hasFilters={hasActiveFilters || !showInactive} />
            ) : (
              <div className="bg-white border border-solara-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-solara-100 bg-solara-50/50">
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-text-tertiary uppercase tracking-wider">CODE</th>
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-text-tertiary uppercase tracking-wider">NAME</th>
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-text-tertiary uppercase tracking-wider">CATEGORY</th>
                        <th className="px-4 py-4 text-center text-[9px] font-medium text-text-tertiary uppercase tracking-wider">PACK</th>
                        <th className="px-4 py-4 text-center text-[9px] font-medium text-text-tertiary uppercase tracking-wider">UNIT</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-text-tertiary uppercase tracking-wider">PACK PRICE</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-text-tertiary uppercase tracking-wider">UNIT PRICE</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-text-tertiary uppercase tracking-wider">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-solara-100">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientRowSolara
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

        {/* Modal - Solara */}
        <Modal open={modalOpen} title={editingId ? 'Edit ingredient' : 'New ingredient'} onClose={() => setModalOpen(false)}>
          <div className="space-y-6">
            <div className="space-y-4">
              <FormFieldSolara label="Name" required>
                <input
                  className="w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </FormFieldSolara>

              <div className="grid grid-cols-2 gap-4">
                <FormFieldSolara label="Category">
                  <input
                    className="w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </FormFieldSolara>
                <FormFieldSolara label="Supplier">
                  <input
                    className="w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </FormFieldSolara>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium text-text-secondary">Code system</h3>
                <span className="text-[8px] font-mono text-text-tertiary bg-solara-50 px-2 py-0.5 rounded-full border border-solara-200">Optional</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormFieldSolara label="Ingredient code" hint="ING-000123">
                  <input
                    className={cls(
                      "w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm font-mono text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors",
                      !canEditCodes && "opacity-50 bg-solara-50 cursor-not-allowed"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                </FormFieldSolara>
                <FormFieldSolara label="Category code" hint={`e.g. ${suggestedCodeCategory}`}>
                  <input
                    className={cls(
                      "w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm font-mono text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors",
                      !canEditCodes && "opacity-50 bg-solara-50 cursor-not-allowed"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormFieldSolara>
              </div>
              {!canEditCodes && (
                <p className="text-xs text-sun-600 flex items-center gap-1">
                  <Icons.alert width={12} height={12} />
                  Code fields are owner-only
                </p>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-medium text-text-secondary">Pack & Cost</h3>

              <div className="flex gap-2">
                {['g', 'kg', 'ml', 'l', 'pcs'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setFPackUnit(unit)}
                    className={cls(
                      "flex-1 px-4 py-2.5 text-xs font-mono font-medium rounded-full border transition-colors",
                      fPackUnit === unit
                        ? "bg-solara-500 text-white border-solara-500"
                        : "bg-white text-text-secondary border-solara-200 hover:border-solara-300"
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormFieldSolara label="Pack size" required>
                  <div className="relative">
                    <input
                      className="w-full px-4 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors pr-16"
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-text-tertiary">
                      {fPackUnit}
                    </span>
                  </div>
                </FormFieldSolara>
                <FormFieldSolara label="Unit" required>
                  <div className="px-4 py-3 bg-solara-50 border border-solara-200 rounded-xl text-sm text-text-primary font-mono">
                    {fPackUnit}
                  </div>
                </FormFieldSolara>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormFieldSolara label="Pack price" required>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                    <input
                      className="w-full pl-8 pr-4 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors"
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                    />
                  </div>
                </FormFieldSolara>
                <FormFieldSolara label="Unit price" hint={"per " + fPackUnit}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
                    <input
                      className="w-full pl-8 pr-16 py-3 bg-white border border-solara-200 rounded-xl text-sm text-text-primary focus:outline-none focus:border-solara-500 focus:ring-2 focus:ring-solara-500/20 transition-colors font-mono"
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-text-tertiary">
                      {"/" + fPackUnit}
                    </span>
                  </div>
                </FormFieldSolara>
              </div>

              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="p-4 bg-solara-50 rounded-xl border border-solara-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-solara-600">Calculation preview:</span>
                    <span className="font-mono text-text-secondary">
                      {"$" + parseFloat(fPackPrice) + " ÷ " + parseFloat(fPackSize) + " " + fPackUnit + " = $" + (parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4) + "/" + fPackUnit}
                    </span>
                  </div>
                  <button
                    className="w-full mt-3 px-4 py-2 bg-white text-solara-600 rounded-full text-xs font-medium border border-solara-200 hover:bg-solara-50 transition-colors flex items-center justify-center gap-2"
                    onClick={smartRecalcNetCost}
                  >
                    <Icons.bolt width={12} height={12} />
                    Apply to unit price
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-solara-100">
              <button
                className="px-5 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-solara-50 rounded-full transition-colors"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2.5 bg-solara-500 text-white text-sm font-medium rounded-full hover:bg-solara-600 transition-colors shadow-sm disabled:opacity-40"
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
