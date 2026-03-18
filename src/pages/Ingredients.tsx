// Ingredients.tsx
import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'
import { QRCodeSVG } from 'qrcode.react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDebounce } from 'use-debounce'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Swal from 'sweetalert2'

// Lazy load المكونات الثقيلة
const ComparePanel = lazy(() => import('../components/ComparePanel'))
const PriceHistoryChart = lazy(() => import('../components/PriceHistoryChart'))

// ==================== الأنواع ====================
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
  expiry_date?: string | null
  min_stock?: number | null
  current_stock?: number | null
  created_at?: string
  updated_at?: string
}

type UnitType = 'g' | 'kg' | 'ml' | 'l' | 'pcs'
type SortOption = 'name' | 'cost' | 'pack_price' | 'stock'

interface PriceHistory {
  date: string
  price: number
  supplier: string
}

interface AuditLog {
  id: string
  user: string
  action: 'create' | 'update' | 'delete' | 'restore'
  ingredient_name: string
  old_value?: any
  new_value?: any
  timestamp: Date
}

// ==================== دوال المساعدة ====================
function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(v)
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
  if (!Number.isFinite(net) || net <= 0) return { level: 'missing' as const, msg: 'التكلفة مفقودة' }

  if (u === 'g' || u === 'ml') {
    if (net > 1) return { level: 'warn' as const, msg: 'مرتفع جداً للغرام (خطأ في الوحدة?)' }
  }
  if (u === 'kg' || u === 'l') {
    if (net > 200) return { level: 'warn' as const, msg: 'مرتفع جداً للكيلو' }
  }
  if (u === 'pcs') {
    if (net > 500) return { level: 'warn' as const, msg: 'مرتفع جداً للحبة' }
  }
  return { level: 'ok' as const, msg: '' }
}

// ==================== المكونات الفرعية ====================
const Modal = memo(function Modal({
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
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
          <div className="flex items-start justify-between border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-8 py-6">
            <div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                مكون
              </span>
              <h2 id="modal-title" className="mt-3 text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={onClose}
              type="button"
              aria-label="إغلاق"
            >
              <span className="sr-only">إغلاق</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-h-[calc(90vh-120px)] overflow-y-auto px-8 py-6">{children}</div>
        </div>
      </div>
    </div>
  )
})

const IngredientTableRow = memo(function IngredientTableRow({
  r,
  isDebug,
  onEdit,
  onHardDelete,
  onToggleFavorite,
  isFavorite,
  onShowHistory,
}: {
  r: IngredientRow
  isDebug: boolean
  onEdit: (r: IngredientRow) => void
  onHardDelete: (id: string) => void
  onToggleFavorite: (id: string) => void
  isFavorite: boolean
  onShowHistory: (r: IngredientRow) => void
}) {
  const active = r.is_active !== false
  const net = toNum(r.net_unit_cost, 0)
  const unit = r.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)
  const lowStock = r.current_stock && r.min_stock && r.current_stock < r.min_stock

  // أيقونة حسب الفئة
  const getCategoryIcon = (category: string = '') => {
    const icons: Record<string, string> = {
      خضروات: '🥬',
      لحوم: '🥩',
      دواجن: '🍗',
      أسماك: '🐟',
      بهارات: '🌶️',
      زيوت: '🫒',
      ألبان: '🥛',
      مخبوزات: '🥖',
    }
    return icons[category] || '📦'
  }

  return (
    <tr className="group transition-colors hover:bg-gray-50">
      <td className="whitespace-nowrap px-4 py-4 text-sm">
        <button
          onClick={() => onToggleFavorite(r.id)}
          className="text-xl"
          aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
        >
          {isFavorite ? '⭐' : '☆'}
        </button>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-sm">
        <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 font-mono text-xs text-gray-700 ring-1 ring-inset ring-gray-500/10">
          {r.code ?? '—'}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-lg">
            {getCategoryIcon(r.category)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{r.name ?? '—'}</span>
              {!active && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  غير نشط
                </span>
              )}
              {lowStock && (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                  مخزون منخفض
                </span>
              )}
              {flag.level === 'warn' && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  تحذير الوحدة
                </span>
              )}
            </div>
            {isDebug && <div className="mt-1 font-mono text-xs text-gray-400">ID: {r.id}</div>}
            {flag.level === 'warn' && <div className="mt-1 text-xs text-amber-600">{flag.msg}</div>}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1">
          {getCategoryIcon(r.category)}
          {r.category ?? '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-600">{r.supplier ?? '—'}</td>
      <td className="whitespace-nowrap px-4 py-4 text-center font-mono text-sm text-gray-900">
        {Math.max(1, toNum(r.pack_size, 1))} {unit}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center font-mono text-sm font-medium text-gray-900">
        {money(toNum(r.pack_price, 0))}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center font-mono text-sm font-medium text-gray-900">
        {money(net)}/{unit}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center text-sm">
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="inline-flex items-center rounded-lg bg-white px-2 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            type="button"
            onClick={() => onShowHistory(r)}
            title="سعر التاريخ"
          >
            📈
          </button>
          <button
            className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            type="button"
            onClick={() => onEdit(r)}
          >
            <svg className="mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            تعديل
          </button>
          <button
            className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50"
            type="button"
            onClick={() => onHardDelete(r.id)}
          >
            <svg className="mr-1.5 h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            حذف
          </button>
        </div>
      </td>
    </tr>
  )
})

// ==================== الصفحة الرئيسية ====================
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

  // ==================== States ====================
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const loc = useLocation()

  // Filter states
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [supplier, setSupplier] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // UI States
  const [kitchenId, setKitchenId] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)
  const [favorites, setFavorites] = useLocalStorage<string[]>('ingredient-favorites', [])
  const [auditLog, setAuditLog] = useState<AuditLog[]>([])
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientRow | null>(null)
  const [showPriceHistory, setShowPriceHistory] = useState(false)
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([])
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [shoppingList, setShoppingList] = useLocalStorage<any[]>('shopping-list', [])

  // Form states
  const [fCode, setFCode] = useState('')
  const [fCodeCategory, setFCodeCategory] = useState('')
  const [fName, setFName] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fPackSize, setFPackSize] = useState('1')
  const [fPackPrice, setFPackPrice] = useState('0')
  const [fPackUnit, setFPackUnit] = useState<UnitType>('g')
  const [fNetUnitCost, setFNetUnitCost] = useState('0')
  const [fExpiryDate, setFExpiryDate] = useState('')
  const [fMinStock, setFMinStock] = useState('')
  const [fCurrentStock, setFCurrentStock] = useState('')
  const [fNotes, setFNotes] = useState('')

  // Refs
  const progressiveRunRef = useRef<number>(0)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // ==================== Effects ====================
  // Load kitchen ID
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

  const FIELDS = 'id,code,code_category,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active,expiry_date,min_stock,current_stock,created_at,updated_at'
  const PAGE_SIZE = 200

  // Load ingredients with progressive loading
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
      setErr(e?.message ?? 'خطأ غير معروف')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [])

  // Search prefill from Command Palette
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('gc:prefill:ingredients')
      if (v && typeof v === 'string') {
        setSearch(v)
        sessionStorage.removeItem('gc:prefill:ingredients')
      }
    } catch {}
  }, [loc.pathname, loc.hash])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K للبحث
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[placeholder*="بحث"]')?.focus()
      }
      
      // Ctrl/Cmd + N لإضافة جديد
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        openCreate()
      }
      
      // Ctrl/Cmd + F للبحث في الجدول
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[placeholder*="بحث"]')?.focus()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ==================== Computed Properties ====================
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

  const suppliers = useMemo(() => {
    const s = new Set<string>()
    for (const r of normalized) {
      const sup = (r.supplier ?? '').trim()
      if (sup) s.add(sup)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [normalized])

  const filtered = useMemo(() => {
    const s = debouncedSearch.trim().toLowerCase()
    let list = normalized.filter((r) => {
      const name = (r.name ?? '').toLowerCase()
      const sup = (r.supplier ?? '').toLowerCase()
      const code = (r.code ?? '').toLowerCase()
      const cat = (r.category ?? '').toLowerCase()
      
      // بحث متقدم في عدة حقول
      const matchesSearch = !s || 
        name.includes(s) || 
        sup.includes(s) || 
        code.includes(s) || 
        cat.includes(s)
      
      const matchesCategory = !category || (r.category ?? '') === category
      const matchesSupplier = !supplier || (r.supplier ?? '') === supplier
      
      const price = toNum(r.net_unit_cost, 0)
      const matchesMinPrice = !minPrice || price >= toNum(minPrice)
      const matchesMaxPrice = !maxPrice || price <= toNum(maxPrice)
      
      const matchesStock = !lowStockOnly || 
        (r.current_stock && r.min_stock && r.current_stock < r.min_stock)
      
      return matchesSearch && matchesCategory && matchesSupplier && 
             matchesMinPrice && matchesMaxPrice && matchesStock
    })

    // ترتيب
    if (sortBy === 'name') {
      list = list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    } else if (sortBy === 'cost') {
      list = list.sort((a, b) => toNum(b.net_unit_cost, 0) - toNum(a.net_unit_cost, 0))
    } else if (sortBy === 'pack_price') {
      list = list.sort((a, b) => toNum(b.pack_price, 0) - toNum(a.pack_price, 0))
    } else if (sortBy === 'stock') {
      list = list.sort((a, b) => {
        const aStock = (a.current_stock ?? 0) / (a.min_stock ?? 1)
        const bStock = (b.current_stock ?? 0) / (b.min_stock ?? 1)
        return aStock - bStock
      })
    }

    return list
  }, [normalized, debouncedSearch, category, supplier, minPrice, maxPrice, lowStockOnly, sortBy])

  // إحصائيات متقدمة
  const stats = useMemo(() => {
    const items = filtered.length
    if (items === 0) {
      return {
        items: 0,
        avgNet: 0,
        maxPack: 0,
        missingCost: 0,
        warnUnits: 0,
        totalValue: 0,
        topExpensive: [],
        lowStock: 0,
        expiringSoon: 0
      }
    }
    
    let sumNet = 0
    let maxPack = 0
    let missingCost = 0
    let warnUnits = 0
    let totalValue = 0
    let lowStock = 0
    let expiringSoon = 0
    
    const costs: { name: string; cost: number }[] = []
    
    const today = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(today.getDate() + 30)
    
    for (const r of filtered) {
      const net = toNum(r.net_unit_cost, 0)
      const stock = toNum(r.current_stock, 0)
      const packPrice = toNum(r.pack_price, 0)
      
      sumNet += net
      maxPack = Math.max(maxPack, packPrice)
      if (net <= 0) missingCost++
      if (sanityFlag(net, r.pack_unit ?? 'g').level === 'warn') warnUnits++
      
      totalValue += stock * net
      
      costs.push({ name: r.name ?? '', cost: net })
      
      // مخزون منخفض
      if (r.current_stock && r.min_stock && r.current_stock < r.min_stock) {
        lowStock++
      }
      
      // منتهي قريباً
      if (r.expiry_date) {
        const expiry = new Date(r.expiry_date)
        if (expiry <= thirtyDaysFromNow && expiry >= today) {
          expiringSoon++
        }
      }
    }
    
    // أغلى 5 مكونات
    const topExpensive = costs
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
    
    return {
      items,
      avgNet: sumNet / items,
      maxPack,
      missingCost,
      warnUnits,
      totalValue,
      topExpensive,
      lowStock,
      expiringSoon
    }
  }, [filtered])

  // Virtualization للجدول
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 73,
    overscan: 5
  })

  // ==================== Actions ====================
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const logAudit = (action: AuditLog['action'], ingredient: IngredientRow, oldValue?: any, newValue?: any) => {
    setAuditLog(prev => [{
      id: crypto.randomUUID(),
      user: k.user?.email || 'unknown',
      action,
      ingredient_name: ingredient.name || '',
      old_value: oldValue,
      new_value: newValue,
      timestamp: new Date()
    }, ...prev])
  }

  const openCreate = () => {
    setEditingId(null)
    resetForm()
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
    setFPackUnit((r.pack_unit as UnitType) ?? 'g')
    setFNetUnitCost(String(Math.max(0, toNum(r.net_unit_cost, 0))))
    setFExpiryDate(r.expiry_date ?? '')
    setFMinStock(String(r.min_stock ?? ''))
    setFCurrentStock(String(r.current_stock ?? ''))
    setModalOpen(true)
  }

  const resetForm = () => {
    setFCode('')
    setFCodeCategory('')
    setFName('')
    setFCategory('')
    setFSupplier('')
    setFPackSize('1')
    setFPackPrice('0')
    setFPackUnit('g')
    setFNetUnitCost('0')
    setFExpiryDate('')
    setFMinStock('')
    setFCurrentStock('')
    setFNotes('')
  }

  const smartRecalcNetCost = () => {
    const ps = Math.max(1, toNum(fPackSize, 1))
    const pp = Math.max(0, toNum(fPackPrice, 0))
    const net = calcNetUnitCost(pp, ps)
    setFNetUnitCost(String(Math.round(net * 1000000) / 1000000))
    showToast('تم إعادة حساب التكلفة')
  }

  const validateForm = (): string | null => {
    const name = fName.trim()
    if (!name) return 'الاسم مطلوب'

    const codeInput = (fCode || '').trim().toUpperCase()
    if (codeInput && !codeInput.startsWith('ING-')) {
      return 'كود المكون يجب أن يبدأ بـ ING-'
    }

    const codeCatInput = (fCodeCategory || '').trim().toUpperCase()
    if (codeCatInput) {
      const norm = codeCatInput.replace(/[^A-Z0-9]/g, '')
      if (!norm) return 'فئة الكود يجب أن تكون A-Z/0-9'
      if (norm.length > 6) return 'فئة الكود الحد الأقصى 6 أحرف'
    }

    const packSize = toNum(fPackSize, 1)
    if (packSize <= 0) return 'حجم العبوة يجب أن يكون أكبر من 0'

    const packPrice = toNum(fPackPrice, 0)
    if (packPrice < 0) return 'سعر العبوة لا يمكن أن يكون سالباً'

    return null
  }

  const save = async () => {
    const validationError = validateForm()
    if (validationError) return showToast(validationError)

    const name = fName.trim()
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
        expiry_date: fExpiryDate || null,
        min_stock: fMinStock ? toNum(fMinStock) : null,
        current_stock: fCurrentStock ? toNum(fCurrentStock) : null,
      }

      if (kitchenId) payload.kitchen_id = kitchenId

      if (editingId) {
        const oldIngredient = rows.find(r => r.id === editingId)
        
        let { error } = await supabase.from('ingredients').update(payload).eq('id', editingId)
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error } = await supabase.from('ingredients').update(payload).eq('id', editingId))
        }
        if (error) throw error
        
        if (oldIngredient) {
          logAudit('update', oldIngredient, oldIngredient, payload)
        }
        
        showToast('تم تحديث المكون')
      } else {
        let { error, data } = await supabase.from('ingredients').insert(payload).select()
        if (error && String(error.message || '').includes('column "kitchen_id" does not exist')) {
          delete payload.kitchen_id
          ;({ error, data } = await supabase.from('ingredients').insert(payload).select())
        }
        if (error) throw error
        
        if (data && data[0]) {
          logAudit('create', data[0], null, data[0])
        }
        
        showToast('تم إنشاء المكون')
      }

      setModalOpen(false)
      await load()
    } catch (e: any) {
      if (e.code === '23505') {
        showToast('هذا الكود موجود مسبقاً')
      } else {
        showToast(e?.message ?? 'فشل الحفظ')
      }
    } finally {
      setSaving(false)
    }
  }

  const hardDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '⚠️ هل أنت متأكد؟',
      text: 'سيتم حذف المكون نهائياً. هذا الإجراء لا يمكن التراجع عنه!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'نعم، احذف',
      cancelButtonText: 'إلغاء'
    })

    if (!result.isConfirmed) return

    const ingredient = rows.find(r => r.id === id)
    
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) {
      const msg = String((error as any).message || '')
      const code = String((error as any).code || '')
      if (code === '23503' || msg.toLowerCase().includes('foreign key')) {
        return showToast('لا يمكن الحذف: هذا المكون مستخدم في وصفات. قم بإزالته من الوصفات أولاً.')
      }
      return showToast(msg || 'فشل الحذف')
    }

    if (ingredient) {
      logAudit('delete', ingredient, ingredient, null)
    }

    showToast('تم حذف المكون')
    await load()
  }

  const deactivate = async (id: string) => {
    const result = await Swal.fire({
      title: 'تعطيل المكون؟',
      text: 'سيتم إخفاؤه من قوائم الاختيار.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'نعم، عطل',
      cancelButtonText: 'إلغاء'
    })

    if (!result.isConfirmed) return

    const ingredient = rows.find(r => r.id === id)
    
    const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
    if (error) return showToast(error.message)

    if (ingredient) {
      logAudit('update', ingredient, { is_active: true }, { is_active: false })
    }

    showToast('تم تعطيل المكون')
    await load()
  }

  const restore = async (id: string) => {
    const ingredient = rows.find(r => r.id === id)
    
    const { error } = await supabase.from('ingredients').update({ is_active: true }).eq('id', id)
    if (error) return showToast(error.message)

    if (ingredient) {
      logAudit('restore', ingredient, { is_active: false }, { is_active: true })
    }

    showToast('تم استعادة المكون')
    await load()
  }

  const bulkRecalcNetCosts = async () => {
    if (filtered.length === 0) return
    
    const result = await Swal.fire({
      title: 'تحديث جماعي',
      text: `إعادة حساب التكلفة لـ ${filtered.length} مكون؟`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'نعم',
      cancelButtonText: 'إلغاء'
    })

    if (!result.isConfirmed) return

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
      showToast('تم التحديث الجماعي')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'فشل التحديث الجماعي')
    } finally {
      setBulkWorking(false)
    }
  }

  const bulkSetActive = async (active: boolean) => {
    if (filtered.length === 0) return
    
    const result = await Swal.fire({
      title: active ? 'تفعيل جماعي' : 'تعطيل جماعي',
      text: `${active ? 'تفعيل' : 'تعطيل'} ${filtered.length} مكون؟`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'نعم',
      cancelButtonText: 'إلغاء'
    })

    if (!result.isConfirmed) return

    setBulkWorking(true)
    try {
      for (const r of filtered) {
        const { error } = await supabase.from('ingredients').update({ is_active: active }).eq('id', r.id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast('تم التحديث الجماعي')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'فشل التحديث الجماعي')
    } finally {
      setBulkWorking(false)
    }
  }

  const showPriceHistoryForIngredient = async (ingredient: IngredientRow) => {
    setSelectedIngredient(ingredient)
    
    // محاكاة سجل الأسعار (في الواقع تجلب من قاعدة البيانات)
    const mockHistory: PriceHistory[] = [
      { date: '2024-01-01', price: 45, supplier: 'مورد أ' },
      { date: '2024-02-01', price: 48, supplier: 'مورد أ' },
      { date: '2024-03-01', price: 52, supplier: 'مورد ب' },
      { date: '2024-04-01', price: 50, supplier: 'مورد ب' },
      { date: '2024-05-01', price: 55, supplier: 'مورد ج' },
    ]
    
    setPriceHistory(mockHistory)
    setShowPriceHistory(true)
  }

  const addToShoppingList = (ingredient: IngredientRow) => {
    setShoppingList(prev => [...prev, {
      id: crypto.randomUUID(),
      ingredient_id: ingredient.id,
      name: ingredient.name,
      quantity: 1,
      unit: ingredient.pack_unit,
      checked: false,
      added_at: new Date().toISOString()
    }])
    showToast('تمت الإضافة لقائمة التسوق')
  }

  const exportToCSV = () => {
    const headers = ['الكود', 'الاسم', 'الفئة', 'المورد', 'حجم العبوة', 'الوحدة', 'سعر العبوة', 'تكلفة الوحدة', 'تاريخ الانتهاء', 'الحد الأدنى', 'المخزون الحالي']
    const data = filtered.map(r => [
      r.code || '',
      r.name || '',
      r.category || '',
      r.supplier || '',
      r.pack_size || '',
      r.pack_unit || '',
      r.pack_price || '',
      r.net_unit_cost || '',
      r.expiry_date || '',
      r.min_stock || '',
      r.current_stock || ''
    ])
    
    const csv = [headers, ...data].map(row => row.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }) // إضافة BOM للعربية
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ingredients-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    
    showToast('تم التصدير بنجاح')
  }

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm'
    })
    
    doc.setFont('helvetica')
    doc.setFontSize(18)
    doc.text('تقرير المكونات', 14, 22)
    doc.setFontSize(11)
    doc.text(`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`, 14, 32)
    
    const tableData = filtered.map(r => [
      r.code || '',
      r.name || '',
      r.category || '',
      r.supplier || '',
      `${r.pack_size || ''} ${r.pack_unit || ''}`,
      money(toNum(r.pack_price, 0)),
      money(toNum(r.net_unit_cost, 0)),
      r.current_stock || '',
      r.expiry_date || ''
    ])
    
    autoTable(doc, {
      head: [['الكود', 'الاسم', 'الفئة', 'المورد', 'العبوة', 'سعر العبوة', 'تكلفة الوحدة', 'المخزون', 'تاريخ الانتهاء']],
      body: tableData,
      startY: 40,
      styles: { font: 'helvetica', fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] }
    })
    
    doc.save(`ingredients-${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('تم تصدير PDF')
  }

  const generateMonthlyReport = () => {
    const report = {
      totalItems: stats.items,
      totalValue: stats.totalValue,
      avgCost: stats.avgNet,
      lowStock: stats.lowStock,
      expiringSoon: stats.expiringSoon,
      topExpensive: stats.topExpensive
    }
    
    // إنشاء PDF مفصل
    const doc = new jsPDF()
    
    doc.setFontSize(20)
    doc.text('التقرير الشهري للمكونات', 105, 20, { align: 'center' })
    
    doc.setFontSize(12)
    doc.text(`الشهر: ${new Date().toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}`, 20, 40)
    
    // إحصائيات
    doc.setFontSize(14)
    doc.text('الإحصائيات', 20, 60)
    
    doc.setFontSize(11)
    doc.text(`إجمالي المكونات: ${report.totalItems}`, 30, 75)
    doc.text(`القيمة الإجمالية: ${money(report.totalValue)}`, 30, 85)
    doc.text(`متوسط التكلفة: ${money(report.avgCost)}`, 30, 95)
    doc.text(`مخزون منخفض: ${report.lowStock}`, 30, 105)
    doc.text(`قريب من الانتهاء: ${report.expiringSoon}`, 30, 115)
    
    // أغلى المكونات
    doc.text('أغلى 5 مكونات', 20, 135)
    report.topExpensive.forEach((item, index) => {
      doc.text(`${index + 1}. ${item.name}: ${money(item.cost)}`, 30, 150 + (index * 10))
    })
    
    doc.save(`report-${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('تم إنشاء التقرير')
  }

  const suggestedCodeCategory = useMemo(() => {
    const raw = (fCategory || 'GEN').toUpperCase()
    const norm = raw.replace(/[^A-Z0-9]/g, '')
    return (norm || 'GEN').slice(0, 6)
  }, [fCategory])

  // ==================== Render ====================
  return (
    <div className="min-h-screen bg-gray-50/50" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* شريط التنقل السريع */}
        <div className="mb-4 flex gap-2 text-sm text-gray-600">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-emerald-600">
            ↑ أعلى الصفحة
          </button>
          <span>•</span>
          <button onClick={() => document.querySelector('input[placeholder*="بحث"]')?.focus()} className="hover:text-emerald-600">
            🔍 بحث (Ctrl+K)
          </button>
          <span>•</span>
          <button onClick={openCreate} className="hover:text-emerald-600">
            ➕ إضافة (Ctrl+N)
          </button>
          <span>•</span>
          <button onClick={exportToCSV} className="hover:text-emerald-600">
            📥 تصدير CSV
          </button>
          <span>•</span>
          <button onClick={exportToPDF} className="hover:text-emerald-600">
            📄 تصدير PDF
          </button>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                المكونات — النسخة المتقدمة
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">قاعدة بيانات المكونات</h1>
              <p className="mt-2 text-sm text-gray-600">
                بحث، تصفية، فرز، التحقق من التكاليف، وإدارة المخزون.
              </p>
              {isDebug && (
                <div className="mt-3 font-mono text-xs text-gray-500">معرف المطبخ: {kitchenId ?? '—'}</div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Dashboard التحليلي */}
              <button
                className="inline-flex items-center rounded-lg bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 shadow-sm ring-1 ring-inset ring-purple-200 hover:bg-purple-100"
                type="button"
                onClick={generateMonthlyReport}
              >
                📊 تقرير شهري
              </button>

              <button
                className="inline-flex items-center rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm ring-1 ring-inset ring-blue-200 hover:bg-blue-100"
                type="button"
                onClick={() => setCompareMode(true)}
                disabled={selectedForCompare.length < 2}
              >
                🔄 مقارنة ({selectedForCompare.length})
              </button>

              <button
                className="inline-flex items-center rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 shadow-sm ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
                type="button"
                onClick={() => setShowAuditLog(true)}
              >
                📋 سجل التعديلات
              </button>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span className="text-sm font-medium text-gray-700">عرض غير النشط</span>
              </label>

              <button
                className="inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                type="button"
                onClick={bulkRecalcNetCosts}
                disabled={bulkWorking}
              >
                <svg className="mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {bulkWorking ? 'جاري العمل…' : 'إعادة حساب التكلفة'}
              </button>

              <button
                className="inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                type="button"
                onClick={() => bulkSetActive(true)}
                disabled={bulkWorking}
              >
                <svg className="mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                تفعيل الكل
              </button>

              <button
                className="inline-flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                type="button"
                onClick={() => bulkSetActive(false)}
                disabled={bulkWorking}
              >
                <svg className="mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                تعطيل الكل
              </button>

              <button
                className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                type="button"
                onClick={openCreate}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                إضافة مكون
              </button>
            </div>
          </div>

          {/* Filters متقدمة */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">بحث</label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pl-3">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  className="block w-full rounded-lg border-0 bg-white py-3 pr-10 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث في الاسم، الكود، المورد..."
                />
                {search && (
                  <button
                    type="button"
                    className="absolute inset-y-0 left-0 flex items-center pl-3"
                    onClick={() => setSearch('')}
                  >
                    <span className="sr-only">مسح البحث</span>
                    <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">الفئة</label>
              <select
                className="mt-1 block w-full rounded-lg border-0 bg-white py-3 pl-3 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">كل الفئات</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">المورد</label>
              <select
                className="mt-1 block w-full rounded-lg border-0 bg-white py-3 pl-3 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              >
                <option value="">كل الموردين</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">ترتيب حسب</label>
              <select
                className="mt-1 block w-full rounded-lg border-0 bg-white py-3 pl-3 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <option value="name">الاسم (أ→ي)</option>
                <option value="cost">تكلفة الوحدة (الأعلى→الأقل)</option>
                <option value="pack_price">سعر العبوة (الأعلى→الأقل)</option>
                <option value="stock">المخزون (الأقل←الأعلى)</option>
              </select>
            </div>
          </div>

          {/* تصفية إضافية */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">أقل سعر</label>
              <input
                type="number"
                className="mt-1 block w-full rounded-lg border-0 bg-white py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm"
                placeholder="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">أعلى سعر</label>
              <input
                type="number"
                className="mt-1 block w-full rounded-lg border-0 bg-white py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm"
                placeholder="1000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
            
            <div className="flex items-center">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm text-gray-700">مخزون منخفض فقط</span>
              </label>
            </div>
            
            <div className="flex items-center justify-end">
              <button
                className="text-sm text-emerald-600 hover:text-emerald-700"
                onClick={() => {
                  setCategory('')
                  setSupplier('')
                  setMinPrice('')
                  setMaxPrice('')
                  setLowStockOnly(false)
                  setSortBy('name')
                }}
              >
                مسح الكل
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards متقدمة */}
        {!loading && !err && (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">إجمالي المكونات</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-gray-900">{stats.items}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">نتائج الفلتر</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-2">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">متوسط التكلفة</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-gray-900">{money(stats.avgNet)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">لكل وحدة</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-50 p-2">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">تكلفة مفقودة</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-gray-900">{stats.missingCost}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">بدون تكلفة</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-red-50 p-2">
                  <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">مخزون منخفض</span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-gray-900">{stats.lowStock}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">بحاجة لإعادة طلب</p>
            </div>
          </div>
        )}

        {/* Loading/Error */}
        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="mt-3 h-8 w-32 rounded-lg" />
                  <Skeleton className="mt-2 h-3 w-24 rounded" />
                </div>
              ))}
            </div>

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
          </div>
        )}

        {err && (
          <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-inset ring-red-600/20">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-red-800">{err}</span>
            </div>
          </div>
        )}

        {/* Table Section مع Virtualization */}
        {!loading && !err && (
          <>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-900/5">
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      القائمة
                    </span>
                    <p className="text-sm text-gray-600">اضغط تعديل للتحقق من العبوة والتكلفة.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      عرض {filtered.length} من {rows.length} مكون
                    </span>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                      type="button"
                      onClick={load}
                    >
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      تحديث
                    </button>
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
                    <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">
                    {rows.length === 0
                      ? 'لا توجد مكونات بعد'
                      : normalized.length === 0
                        ? 'لا توجد مكونات نشطة'
                        : 'لا توجد مكونات تطابق بحثك'}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {rows.length === 0
                      ? 'ابدأ قاعدة بيانات مطبخك بإضافة أول مكون.'
                      : normalized.length === 0
                        ? 'جميع المكونات غير نشطة. فعل "عرض غير النشط" لإدارتها.'
                        : 'لا توجد مكونات تطابق معايير البحث الحالية.'}
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-3">
                    {rows.length > 0 && normalized.length === 0 && (
                      <button
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
                        onClick={() => setShowInactive(true)}
                      >
                        عرض غير النشط
                      </button>
                    )}
                    {(search.trim() || category || supplier || minPrice || maxPrice || lowStockOnly) && rows.length > 0 && (
                      <button
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
                        onClick={() => {
                          setSearch('')
                          setCategory('')
                          setSupplier('')
                          setMinPrice('')
                          setMaxPrice('')
                          setLowStockOnly(false)
                        }}
                      >
                        مسح الفلاتر
                      </button>
                    )}
                    <button
                      className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                      onClick={openCreate}
                    >
                      + إضافة مكون
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div
                    ref={tableContainerRef}
                    className="relative max-h-[600px] overflow-auto"
                  >
                    <table className="w-full min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 w-12">
                            ⭐
                          </th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            الكود
                          </th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            الاسم
                          </th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            الفئة
                          </th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            المورد
                          </th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                            العبوة
                          </th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                            سعر العبوة
                          </th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                            تكلفة الوحدة
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                            الإجراءات
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white relative">
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                          const ingredient = filtered[virtualRow.index]
                          return (
                            <tr
                              key={ingredient.id}
                              style={{
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                              className="absolute top-0 left-0 w-full"
                            >
                              <IngredientTableRow
                                r={ingredient}
                                isDebug={isDebug}
                                onEdit={openEdit}
                                onHardDelete={hardDelete}
                                onToggleFavorite={(id) => {
                                  setFavorites(prev =>
                                    prev.includes(id)
                                      ? prev.filter(f => f !== id)
                                      : [...prev, id]
                                  )
                                }}
                                isFavorite={favorites.includes(ingredient.id)}
                                onShowHistory={showPriceHistoryForIngredient}
                              />
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* أغلى المكونات */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">🔝 أغلى 5 مكونات</h3>
                <div className="space-y-3">
                  {stats.topExpensive.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.name}</span>
                      <span className="font-mono text-sm font-medium text-gray-900">{money(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ تنبيهات</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">مخزون منخفض</span>
                    <span className="font-medium text-red-600">{stats.lowStock}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">سينتهي خلال 30 يوم</span>
                    <span className="font-medium text-amber-600">{stats.expiringSoon}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">تكلفة مفقودة</span>
                    <span className="font-medium text-amber-600">{stats.missingCost}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">تحذيرات الوحدة</span>
                    <span className="font-medium text-amber-600">{stats.warnUnits}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modal للإضافة/التعديل */}
        <Modal open={modalOpen} title={editingId ? 'تعديل المكون' : 'إضافة مكون جديد'} onClose={() => setModalOpen(false)}>
          <div className="space-y-6">
            {/* الهوية */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">الهوية</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">الكود</label>
                  <input
                    className={cls(
                      "mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6",
                      !canEditCodes && "bg-gray-50 text-gray-500"
                    )}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123 (اختياري)"
                    disabled={!canEditCodes}
                  />
                  <p className="mt-1 text-xs text-gray-500">يجب أن يبدأ بـ ING- إذا تم إدخاله</p>
                  {!canEditCodes && (
                    <p className="mt-1 text-xs text-amber-600">حقول الكود خاصة بالمالك فقط.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">فئة الكود</label>
                  <input
                    className={cls(
                      "mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6",
                      !canEditCodes && "bg-gray-50 text-gray-500"
                    )}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={`مثال: ${suggestedCodeCategory} (اختياري)`}
                    disabled={!canEditCodes}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    حد أقصى 6 أحرف A–Z/0–9. مقترح: <span className="font-mono">{suggestedCodeCategory}</span>
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">الاسم</label>
                <input
                  className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="اسم المكون"
                />
              </div>
            </div>

            {/* التصنيف */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">التصنيف</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">الفئة</label>
                  <input
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="مثال: خضروات، لحوم..."
                    list="categories"
                  />
                  <datalist id="categories">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">المورد</label>
                  <input
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="اسم المورد"
                    list="suppliers"
                  />
                  <datalist id="suppliers">
                    {suppliers.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>
            </div>

            {/* العبوة */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">العبوة</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">حجم العبوة</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fPackSize}
                    onChange={(e) => setFPackSize(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">مطلوب</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">الوحدة</label>
                  <select
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fPackUnit}
                    onChange={(e) => setFPackUnit(e.target.value as UnitType)}
                  >
                    <option value="g">جرام</option>
                    <option value="kg">كيلو</option>
                    <option value="ml">ملليلتر</option>
                    <option value="l">لتر</option>
                    <option value="pcs">حبة</option>
                  </select>
                </div>
              </div>
            </div>

            {/* التكلفة */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">التكلفة</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">سعر العبوة</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fPackPrice}
                    onChange={(e) => setFPackPrice(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">مطلوب</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">تكلفة الوحدة</label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fNetUnitCost}
                    onChange={(e) => setFNetUnitCost(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">إذا كانت 0 → تُحسب تلقائياً</p>
                </div>
              </div>
            </div>

            {/* المخزون */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">المخزون</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fExpiryDate}
                    onChange={(e) => setFExpiryDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">الحد الأدنى</label>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fMinStock}
                    onChange={(e) => setFMinStock(e.target.value)}
                    placeholder="للتنبيه"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">المخزون الحالي</label>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 block w-full rounded-lg border-0 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6"
                    value={fCurrentStock}
                    onChange={(e) => setFCurrentStock(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* QR Code */}
            {editingId && (
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">رمز QR</span>
                  <div className="flex gap-2">
                    <QRCodeSVG
                      value={JSON.stringify({
                        id: editingId,
                        name: fName,
                        code: fCode
                      })}
                      size={64}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* المساعدة الذكية */}
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">مساعد ذكي</span>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  type="button"
                  onClick={smartRecalcNetCost}
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  إعادة حساب من العبوة
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">التكلفة = سعر العبوة ÷ حجم العبوة</p>
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
              <button
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                إلغاء
              </button>
              <button
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
                type="button"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal سجل التعديلات */}
        {showAuditLog && (
          <Modal open={showAuditLog} title="سجل التعديلات" onClose={() => setShowAuditLog(false)}>
            <div className="space-y-4">
              {auditLog.length === 0 ? (
                <p className="text-center text-gray-500 py-8">لا توجد تعديلات بعد</p>
              ) : (
                auditLog.map(log => (
                  <div key={log.id} className="border-b pb-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{log.ingredient_name}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString('ar-SA')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {log.action === 'create' && '➕ تم الإنشاء'}
                      {log.action === 'update' && '✏️ تم التعديل'}
                      {log.action === 'delete' && '🗑️ تم الحذف'}
                      {log.action === 'restore' && '🔄 تم الاستعادة'}
                      {' - '}{log.user}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Modal>
        )}

        {/* Modal سعر التاريخ */}
        {showPriceHistory && selectedIngredient && (
          <Modal open={showPriceHistory} title={`سعر ${selectedIngredient.name}`} onClose={() => setShowPriceHistory(false)}>
            <Suspense fallback={<div>جاري التحميل...</div>}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" stroke="#059669" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {priceHistory.map((h, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{h.date}</span>
                    <span>{money(h.price)}</span>
                    <span className="text-gray-500">{h.supplier}</span>
                  </div>
                ))}
              </div>
            </Suspense>
          </Modal>
        )}

        {/* Modal مقارنة */}
        {compareMode && (
          <Suspense fallback={null}>
            <ComparePanel
              ingredients={selectedForCompare.map(id => rows.find(r => r.id === id)).filter(Boolean)}
              onClose={() => {
                setCompareMode(false)
                setSelectedForCompare([])
              }}
            />
          </Suspense>
        )}

        {/* Toast */}
        <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
      </div>
    </div>
  )
}

// ==================== Hook مخصص ====================
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      return initialValue
    }
  })

  const setValue = (value: T) => {
    try {
      setStoredValue(value)
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.log(error)
    }
  }

  return [storedValue, setValue]
}
