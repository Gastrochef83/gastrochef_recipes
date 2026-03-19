// src/pages/Ingredients.tsx
import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'
import { motion, AnimatePresence } from 'framer-motion'

// ==================== Type Definitions ====================
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
  created_at?: string
  updated_at?: string
  allergen_info?: string[] | null
  dietary_info?: string[] | null
  storage_instructions?: string | null
  minimum_stock?: number | null
  current_stock?: number | null
  stock_unit?: string | null
  image_url?: string | null
  barcode?: string | null
  organic_certified?: boolean
  local_sourced?: boolean
  seasonality?: string[] | null
}

type SortOption = 'name' | 'cost' | 'pack_price' | 'category' | 'supplier' | 'created'
type ViewMode = 'table' | 'grid' | 'compact'

// ==================== Utility Functions ====================
function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number, currency = 'USD') {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)
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

// ==================== Validation & Sanity Checks ====================
function sanityFlag(net: number, unit: string) {
  const u = safeUnit(unit)
  if (!Number.isFinite(net) || net <= 0) return { level: 'missing' as const, msg: 'Missing cost' }

  const thresholds = {
    'g': { warn: 1, critical: 5 },
    'ml': { warn: 1, critical: 5 },
    'kg': { warn: 200, critical: 1000 },
    'l': { warn: 200, critical: 1000 },
    'pcs': { warn: 500, critical: 2000 }
  }

  const threshold = thresholds[u as keyof typeof thresholds] || { warn: 100, critical: 500 }
  
  if (net > threshold.critical) return { level: 'critical' as const, msg: 'Extremely high cost - verify unit' }
  if (net > threshold.warn) return { level: 'warn' as const, msg: 'Unusually high cost' }
  return { level: 'ok' as const, msg: '' }
}

// ==================== Icon System ====================
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  grid: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  table: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 3h18v18H3z" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
  compact: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  download: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  duplicate: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  star: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  tag: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
}

// ==================== UI Components ====================
const UnitBadge = ({ unit, variant = 'default' }: { unit: string; variant?: 'default' | 'small' }) => {
  const unitMap: Record<string, string> = {
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'L',
    pcs: 'pcs',
  }

  const sizeClasses = variant === 'small' ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[10px]'

  return (
    <span className={cls(
      "inline-flex items-center rounded-lg font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700",
      sizeClasses
    )}>
      {unitMap[unit] || unit}
    </span>
  )
}

const PriceDisplay = ({ amount, unit, currency = 'USD' }: { amount: number; unit: string; currency?: string }) => (
  <div className="flex items-center justify-end gap-1.5">
    <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
      {money(amount, currency)}
    </span>
    <UnitBadge unit={unit} />
  </div>
)

const StatusBadge = ({ status, text }: { status: 'active' | 'inactive' | 'warning' | 'critical'; text: string }) => {
  const statusClasses = {
    active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  }

  return (
    <span className={cls(
      "inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-medium border",
      statusClasses[status]
    )}>
      {text}
    </span>
  )
}

// ==================== Modal Component ====================
function Modal({
  open,
  title,
  children,
  onClose,
  size = 'default',
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  size?: 'default' | 'large' | 'full'
}) {
  if (!open) return null

  const sizeClasses = {
    default: 'max-w-lg',
    large: 'max-w-2xl',
    full: 'max-w-4xl',
  }

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
            className="absolute inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cls("relative w-full mx-auto", sizeClasses[size])}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-base font-medium text-gray-900 dark:text-white">{title}</h2>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
                  onClick={onClose}
                >
                  <Icons.close width={16} height={16} />
                </button>
              </div>
              <div className="px-6 py-5 max-h-[calc(90vh-8rem)] overflow-y-auto custom-scrollbar">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Form Components ====================
const FormField = ({
  label,
  required,
  children,
  hint,
  error,
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
    {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
  </div>
)

const Input = ({
  type = 'text',
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  className,
  disabled,
  min,
  step,
  ...props
}: {
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  className?: string
  disabled?: boolean
  min?: number
  step?: string
}) => (
  <div className="relative">
    {prefix && (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{prefix}</span>
    )}
    <input
      type={type}
      className={cls(
        "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all",
        prefix && "pl-7",
        suffix && "pr-12",
        disabled && "opacity-50 bg-gray-100 dark:bg-gray-900 cursor-not-allowed",
        className
      )}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      step={step}
      {...props}
    />
    {suffix && (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500">
        {suffix}
      </span>
    )}
  </div>
)

// ==================== Table Row Component ====================
const IngredientTableRow = memo(function IngredientTableRow({
  ingredient,
  isDebug,
  onEdit,
  onDeactivate,
  onHardDelete,
  onDuplicate,
  selected,
  onSelect,
}: {
  ingredient: IngredientRow
  isDebug: boolean
  onEdit: (ingredient: IngredientRow) => void
  onDeactivate: (id: string) => void
  onHardDelete: (id: string) => void
  onDuplicate: (ingredient: IngredientRow) => void
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}) {
  const active = ingredient.is_active !== false
  const net = toNum(ingredient.net_unit_cost, 0)
  const unit = ingredient.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)

  const handleDeleteClick = () => {
    if (window.confirm('Delete permanently? This cannot be undone.')) {
      onHardDelete(ingredient.id)
    }
  }

  const handleDeactivateClick = () => {
    if (active) {
      onDeactivate(ingredient.id)
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className={cls(
        'group border-b border-gray-100 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors',
        !active && 'opacity-40',
        selected && 'bg-blue-50 dark:bg-blue-900/10'
      )}
    >
      {onSelect && (
        <td className="px-2 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(ingredient.id, e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {ingredient.code || '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-sm font-medium text-gray-900 dark:text-white",
            !active && "line-through text-gray-400"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {flag.level === 'warn' && (
            <StatusBadge status="warning" text="High cost" />
          )}
          {flag.level === 'critical' && (
            <StatusBadge status="critical" text="Verify unit" />
          )}
          {ingredient.organic_certified && (
            <span className="text-green-600 dark:text-green-400" title="Organic">🌱</span>
          )}
          {ingredient.local_sourced && (
            <span className="text-blue-600 dark:text-blue-400" title="Local sourced">📍</span>
          )}
        </div>
        {isDebug && (
          <div className="text-[9px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
            {ingredient.id.slice(0, 8)}...
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-mono text-gray-900 dark:text-white">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-3">
        <UnitBadge unit={unit} />
      </td>
      <td className="px-4 py-3">
        <PriceDisplay amount={toNum(ingredient.pack_price, 0)} unit={unit} />
      </td>
      <td className="px-4 py-3">
        <PriceDisplay amount={net} unit={unit} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={() => onEdit(ingredient)}
            title="Edit"
          >
            <Icons.edit />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            onClick={() => onDuplicate(ingredient)}
            title="Duplicate"
          >
            <Icons.duplicate />
          </button>
          {active && (
            <button
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              onClick={handleDeactivateClick}
              title="Deactivate"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
          )}
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            onClick={handleDeleteClick}
            title="Delete permanently"
          >
            <Icons.delete />
          </button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Grid Card Component ====================
const IngredientGridCard = memo(function IngredientGridCard({
  ingredient,
  onEdit,
  onDeactivate,
  onHardDelete,
  onDuplicate,
  selected,
  onSelect,
}: {
  ingredient: IngredientRow
  onEdit: (ingredient: IngredientRow) => void
  onDeactivate: (id: string) => void
  onHardDelete: (id: string) => void
  onDuplicate: (ingredient: IngredientRow) => void
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}) {
  const active = ingredient.is_active !== false
  const net = toNum(ingredient.net_unit_cost, 0)
  const unit = ingredient.pack_unit ?? 'g'
  const flag = sanityFlag(net, unit)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className={cls(
        "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-all hover:shadow-lg",
        !active && "opacity-40",
        selected && "ring-2 ring-blue-500"
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {onSelect && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onSelect(ingredient.id, e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
              )}
              <h3 className={cls(
                "text-sm font-medium text-gray-900 dark:text-white truncate",
                !active && "line-through text-gray-400"
              )}>
                {ingredient.name ?? '—'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {ingredient.code || 'No code'} · {ingredient.category || 'Uncategorized'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {flag.level === 'warn' && (
              <span className="text-amber-500" title="High cost">⚠️</span>
            )}
            {flag.level === 'critical' && (
              <span className="text-red-500" title="Critical">🔴</span>
            )}
            {ingredient.organic_certified && (
              <span className="text-green-600" title="Organic">🌱</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Pack Size</div>
            <div className="text-sm font-mono text-gray-900 dark:text-white">
              {ingredient.pack_size} {ingredient.pack_unit}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Pack Price</div>
            <div className="text-sm font-mono text-gray-900 dark:text-white">
              {money(toNum(ingredient.pack_price, 0))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Unit Price</div>
            <div className="text-sm font-mono text-gray-900 dark:text-white">
              {money(net)}/{unit}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Supplier</div>
            <div className="text-sm text-gray-900 dark:text-white truncate">
              {ingredient.supplier || '—'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <UnitBadge unit={unit} variant="small" />
            {ingredient.allergen_info && ingredient.allergen_info.length > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Contains allergens">
                ⚠️
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={() => onEdit(ingredient)}
              title="Edit"
            >
              <Icons.edit width={14} height={14} />
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              onClick={() => onDuplicate(ingredient)}
              title="Duplicate"
            >
              <Icons.duplicate width={14} height={14} />
            </button>
            {active && (
              <button
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                onClick={() => onDeactivate(ingredient.id)}
                title="Deactivate"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

// ==================== Compact Row Component ====================
const IngredientCompactRow = memo(function IngredientCompactRow({
  ingredient,
  onEdit,
  onDeactivate,
  onHardDelete,
  onDuplicate,
  selected,
  onSelect,
}: {
  ingredient: IngredientRow
  onEdit: (ingredient: IngredientRow) => void
  onDeactivate: (id: string) => void
  onHardDelete: (id: string) => void
  onDuplicate: (ingredient: IngredientRow) => void
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}) {
  const active = ingredient.is_active !== false
  const net = toNum(ingredient.net_unit_cost, 0)
  const unit = ingredient.pack_unit ?? 'g'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cls(
        "flex items-center gap-4 p-2 border-b border-gray-100 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30",
        !active && "opacity-40",
        selected && "bg-blue-50 dark:bg-blue-900/10"
      )}
    >
      {onSelect && (
        <div className="w-8">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(ingredient.id, e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
        </div>
      )}
      <div className="w-24 text-xs font-mono text-gray-500 dark:text-gray-400">
        {ingredient.code || '—'}
      </div>
      <div className="flex-1 min-w-0">
        <span className={cls(
          "text-sm font-medium text-gray-900 dark:text-white",
          !active && "line-through text-gray-400"
        )}>
          {ingredient.name ?? '—'}
        </span>
      </div>
      <div className="w-24 text-sm text-gray-600 dark:text-gray-400">
        {ingredient.category || '—'}
      </div>
      <div className="w-24 text-sm font-mono text-gray-900 dark:text-white text-right">
        {money(net)}/{unit}
      </div>
      <div className="w-24 flex items-center justify-end gap-1">
        <button
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          onClick={() => onEdit(ingredient)}
        >
          <Icons.edit width={12} height={12} />
        </button>
        <button
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          onClick={() => onDuplicate(ingredient)}
        >
          <Icons.duplicate width={12} height={12} />
        </button>
      </div>
    </motion.div>
  )
})

// ==================== Stats Card Component ====================
const StatsCard = ({ label, value, sublabel, icon, warning }: {
  label: string
  value: string | number
  sublabel: string
  icon: ReactNode
  warning?: boolean
}) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cls(
            "text-2xl font-light",
            warning ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"
          )}>
            {value}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          {sublabel}
        </div>
      </div>
      <div className={cls(
        "w-10 h-10 rounded-xl flex items-center justify-center",
        warning
          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
      )}>
        {icon}
      </div>
    </div>
  </div>
)

// ==================== Empty State Component ====================
const EmptyState = ({ onAdd, hasFilters, onClearFilters }: { onAdd: () => void; hasFilters: boolean; onClearFilters: () => void }) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-800">
    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl flex items-center justify-center text-3xl border border-blue-100 dark:border-blue-800">
      🥗
    </div>
    <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
      {hasFilters ? 'No results found' : 'No ingredients yet'}
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
      {hasFilters
        ? 'Try adjusting your search or filters to find what you\'re looking for.'
        : 'Start building your kitchen database by adding your first ingredient.'}
    </p>
    <div className="flex items-center justify-center gap-3">
      <button
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
        onClick={onAdd}
      >
        <Icons.plus />
        Add ingredient
      </button>
      {hasFilters && (
        <button
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={onClearFilters}
        >
          <Icons.reset />
          Clear filters
        </button>
      )}
    </div>
  </div>
)

// ==================== Loading State Component ====================
const LoadingState = ({ viewMode }: { viewMode: ViewMode }) => {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-4 w-24 mb-2" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
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
}

// ==================== Error State Component ====================
const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-8 border border-red-200 dark:border-red-800 text-center">
    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center text-3xl">
      ⚠️
    </div>
    <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
      Something went wrong
    </h3>
    <p className="text-sm text-red-600 dark:text-red-400 mb-6">{message}</p>
    <button
      className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      onClick={onRetry}
    >
      <Icons.reset />
      Try again
    </button>
  </div>
)

// ==================== Filter Bar Component ====================
const FilterBar = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  sortBy,
  onSortChange,
  showInactive,
  onShowInactiveChange,
  viewMode,
  onViewModeChange,
  onClearFilters,
  hasActiveFilters,
  onExport,
  onImport,
}: {
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  categories: string[]
  sortBy: SortOption
  onSortChange: (value: SortOption) => void
  showInactive: boolean
  onShowInactiveChange: (value: boolean) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
  onExport: () => void
  onImport: () => void
}) => {
  const sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'name', label: 'Name' },
    { value: 'cost', label: 'Unit cost' },
    { value: 'pack_price', label: 'Pack price' },
    { value: 'category', label: 'Category' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'created', label: 'Date added' },
  ]

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Icons.search />
            </span>
            <input
              className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search ingredients..."
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => onSearchChange('')}
              >
                <Icons.close width={14} height={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter */}
        <select
          className="px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          className="px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Sort by: {option.label}
            </option>
          ))}
        </select>

        {/* Show Inactive Toggle */}
        <button
          className={cls(
            "inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors",
            showInactive
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
              : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
          onClick={() => onShowInactiveChange(!showInactive)}
        >
          <div className={cls(
            "w-4 h-4 rounded border flex items-center justify-center",
            showInactive ? "bg-blue-600 border-blue-600" : "border-gray-400"
          )}>
            {showInactive && <Icons.check width={12} height={12} className="text-white" />}
          </div>
          <span>Show inactive</span>
        </button>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button
            className={cls(
              "p-2 rounded-lg transition-colors",
              viewMode === 'table' 
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            )}
            onClick={() => onViewModeChange('table')}
            title="Table view"
          >
            <Icons.table />
          </button>
          <button
            className={cls(
              "p-2 rounded-lg transition-colors",
              viewMode === 'grid' 
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            )}
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
          >
            <Icons.grid />
          </button>
          <button
            className={cls(
              "p-2 rounded-lg transition-colors",
              viewMode === 'compact' 
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            )}
            onClick={() => onViewModeChange('compact')}
            title="Compact view"
          >
            <Icons.compact />
          </button>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            onClick={onClearFilters}
            title="Clear filters"
          >
            <Icons.reset />
          </button>
        )}

        {/* Export/Import */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            onClick={onExport}
            title="Export"
          >
            <Icons.download />
          </button>
          <button
            className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            onClick={onImport}
            title="Import"
          >
            <Icons.upload />
          </button>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Active filters:</span>
          {search && (
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg">
              Search: "{search}"
            </span>
          )}
          {category && (
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg">
              Category: {category}
            </span>
          )}
        </div>
      )}
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

  // State
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const loc = useLocation()

  // UI State
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

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
  const [duplicateFrom, setDuplicateFrom] = useState<IngredientRow | null>(null)

  // Form state
  const [fCode, setFCode] = useState('')
  const [fCodeCategory, setFCodeCategory] = useState('')
  const [fName, setFName] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [fPackSize, setFPackSize] = useState('1')
  const [fPackPrice, setFPackPrice] = useState('0')
  const [fPackUnit, setFPackUnit] = useState('g')
  const [fNetUnitCost, setFNetUnitCost] = useState('0')
  const [fAllergens, setFAllergens] = useState<string[]>([])
  const [fDietary, setFDietary] = useState<string[]>([])
  const [fStorage, setFStorage] = useState('')
  const [fMinStock, setFMinStock] = useState('')
  const [fOrganic, setFOrganic] = useState(false)
  const [fLocal, setFLocal] = useState(false)

  const [saving, setSaving] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)

  const progressiveRunRef = useRef<number>(0)

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

  const FIELDS = 'id,code,code_category,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active,created_at,updated_at,allergen_info,dietary_info,storage_instructions,minimum_stock,current_stock,stock_unit,image_url,barcode,organic_certified,local_sourced,seasonality'

  const PAGE_SIZE = 200

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

  // Data processing
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
      const cat = (r.category ?? '').toLowerCase()
      const okSearch = !s || name.includes(s) || sup.includes(s) || code.includes(s) || cat.includes(s)
      const okCat = !category || (r.category ?? '') === category
      return okSearch && okCat
    })

    if (sortBy === 'name') {
      list = list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    } else if (sortBy === 'cost') {
      list = list.sort((a, b) => toNum(b.net_unit_cost, 0) - toNum(a.net_unit_cost, 0))
    } else if (sortBy === 'pack_price') {
      list = list.sort((a, b) => toNum(b.pack_price, 0) - toNum(a.pack_price, 0))
    } else if (sortBy === 'category') {
      list = list.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''))
    } else if (sortBy === 'supplier') {
      list = list.sort((a, b) => (a.supplier ?? '').localeCompare(b.supplier ?? ''))
    } else if (sortBy === 'created') {
      list = list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    }

    return list
  }, [normalized, deferredSearch, category, sortBy])

  const stats = useMemo(() => {
    const items = filtered.length
    const avgNet = items > 0 ? filtered.reduce((a, r) => a + toNum(r.net_unit_cost, 0), 0) / items : 0
    const missingCost = filtered.filter((r) => toNum(r.net_unit_cost, 0) <= 0).length
    const warnUnits = filtered.filter((r) => sanityFlag(toNum(r.net_unit_cost, 0), r.pack_unit ?? 'g').level !== 'ok').length
    const organicCount = filtered.filter((r) => r.organic_certified).length
    const localCount = filtered.filter((r) => r.local_sourced).length

    return { items, avgNet, missingCost, warnUnits, organicCount, localCount }
  }, [filtered])

  const hasActiveFilters = search !== '' || category !== ''
  const hasFilteredItems = filtered.length > 0

  // Selection handling
  const handleSelectAll = () => {
    if (selectedRows.size === filtered.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filtered.map(r => r.id)))
    }
  }

  const handleSelectRow = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedRows)
    if (selected) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedRows(newSelected)
  }

  const clearSelection = () => setSelectedRows(new Set())

  // CRUD Operations
  const openCreate = () => {
    setEditingId(null)
    setDuplicateFrom(null)
    setFCode('')
    setFCodeCategory('')
    setFName('')
    setFCategory('')
    setFSupplier('')
    setFPackSize('1')
    setFPackPrice('0')
    setFPackUnit('g')
    setFNetUnitCost('0')
    setFAllergens([])
    setFDietary([])
    setFStorage('')
    setFMinStock('')
    setFOrganic(false)
    setFLocal(false)
    setModalOpen(true)
  }

  const openEdit = (r: IngredientRow) => {
    setEditingId(r.id)
    setDuplicateFrom(null)
    setFCode((r.code ?? '').toUpperCase())
    setFCodeCategory((r.code_category ?? '').toUpperCase())
    setFName(r.name ?? '')
    setFCategory(r.category ?? '')
    setFSupplier(r.supplier ?? '')
    setFPackSize(String(Math.max(1, toNum(r.pack_size, 1))))
    setFPackPrice(String(Math.max(0, toNum(r.pack_price, 0))))
    setFPackUnit(r.pack_unit ?? 'g')
    setFNetUnitCost(String(Math.max(0, toNum(r.net_unit_cost, 0))))
    setFAllergens(r.allergen_info ?? [])
    setFDietary(r.dietary_info ?? [])
    setFStorage(r.storage_instructions ?? '')
    setFMinStock(String(r.minimum_stock ?? ''))
    setFOrganic(r.organic_certified ?? false)
    setFLocal(r.local_sourced ?? false)
    setModalOpen(true)
  }

  const openDuplicate = (r: IngredientRow) => {
    setEditingId(null)
    setDuplicateFrom(r)
    setFCode('')
    setFCodeCategory(r.code_category ?? '')
    setFName(`${r.name} (Copy)`)
    setFCategory(r.category ?? '')
    setFSupplier(r.supplier ?? '')
    setFPackSize(String(Math.max(1, toNum(r.pack_size, 1))))
    setFPackPrice(String(Math.max(0, toNum(r.pack_price, 0))))
    setFPackUnit(r.pack_unit ?? 'g')
    setFNetUnitCost(String(Math.max(0, toNum(r.net_unit_cost, 0))))
    setFAllergens(r.allergen_info ?? [])
    setFDietary(r.dietary_info ?? [])
    setFStorage(r.storage_instructions ?? '')
    setFMinStock(String(r.minimum_stock ?? ''))
    setFOrganic(r.organic_certified ?? false)
    setFLocal(r.local_sourced ?? false)
    setModalOpen(true)
  }

  const smartRecalcNetCost = () => {
    const ps = Math.max(1, toNum(fPackSize, 1))
    const pp = Math.max(0, toNum(fPackPrice, 0))
    const net = calcNetUnitCost(pp, ps)
    setFNetUnitCost(String(Math.round(net * 1000000) / 1000000))
    showToast('Unit price recalculated')
  }

  const validateForm = () => {
    if (!fName.trim()) return 'Name is required'
    
    const codeInput = (fCode || '').trim().toUpperCase()
    if (codeInput && !codeInput.startsWith('ING-')) {
      return 'Code must start with ING-'
    }

    const packSize = toNum(fPackSize, 1)
    if (packSize <= 0) return 'Pack size must be positive'

    const packPrice = toNum(fPackPrice, 0)
    if (packPrice < 0) return 'Pack price cannot be negative'

    return null
  }

  const save = async () => {
    const validationError = validateForm()
    if (validationError) {
      showToast(validationError)
      return
    }

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
        allergen_info: fAllergens.length ? fAllergens : null,
        dietary_info: fDietary.length ? fDietary : null,
        storage_instructions: fStorage.trim() || null,
        minimum_stock: fMinStock ? toNum(fMinStock) : null,
        organic_certified: fOrganic,
        local_sourced: fLocal,
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
      clearSelection()
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (id: string) => {
    const ok = window.confirm('Deactivate ingredient? It will be hidden from pickers.')
    if (!ok) return
    const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
    if (error) return showToast(error.message)
    showToast('Ingredient deactivated')
    clearSelection()
    await load()
  }

  const hardDelete = async (id: string) => {
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
    clearSelection()
    await load()
  }

  const bulkDeactivate = async () => {
    if (selectedRows.size === 0) return
    const ok = window.confirm(`Deactivate ${selectedRows.size} selected items?`)
    if (!ok) return

    setBulkWorking(true)
    try {
      for (const id of selectedRows) {
        const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast(`Deactivated ${selectedRows.size} items`)
      clearSelection()
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Bulk operation failed')
    } finally {
      setBulkWorking(false)
    }
  }

  const bulkDelete = async () => {
    if (selectedRows.size === 0) return
    const ok = window.confirm(`Permanently delete ${selectedRows.size} selected items? This cannot be undone.`)
    if (!ok) return

    setBulkWorking(true)
    try {
      for (const id of selectedRows) {
        const { error } = await supabase.from('ingredients').delete().eq('id', id)
        if (error) throw error
      }

      invalidateIngredientsCache()
      showToast(`Deleted ${selectedRows.size} items`)
      clearSelection()
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Bulk operation failed')
    } finally {
      setBulkWorking(false)
    }
  }

  const bulkExport = () => {
    const data = filtered.map(r => ({
      Code: r.code || '',
      Name: r.name || '',
      Category: r.category || '',
      Supplier: r.supplier || '',
      'Pack Size': r.pack_size || '',
      'Pack Unit': r.pack_unit || '',
      'Pack Price': r.pack_price || '',
      'Unit Cost': r.net_unit_cost || '',
      Organic: r.organic_certified ? 'Yes' : 'No',
      'Local Sourced': r.local_sourced ? 'Yes' : 'No'
    }))

    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ingredients-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

    showToast('Export started')
  }

  const bulkImport = () => {
    showToast('Import feature coming soon')
  }

  const suggestedCodeCategory = useMemo(() => {
    const raw = (fCategory || 'GEN').toUpperCase()
    const norm = raw.replace(/[^A-Z0-9]/g, '')
    return (norm || 'GEN').slice(0, 6)
  }, [fCategory])

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
      className="min-h-screen bg-gray-50 dark:bg-gray-950"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-light text-gray-900 dark:text-white tracking-tight">
                Ingredients
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                <span>{filtered.length} items</span>
                {stats.missingCost > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    · {stats.missingCost} missing costs
                  </span>
                )}
                {stats.warnUnits > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    · {stats.warnUnits} warnings
                  </span>
                )}
              </p>
            </div>
          </div>

          {isDebug && kitchenId && (
            <span className="text-[10px] font-mono bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg">
              {kitchenId.slice(0, 8)}...
            </span>
          )}
        </motion.div>

        {/* Selection Bar */}
        {selectedRows.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-blue-700 dark:text-blue-400">
                {selectedRows.size} item{selectedRows.size !== 1 ? 's' : ''} selected
              </span>
              <button
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                onClick={bulkDeactivate}
                disabled={bulkWorking}
              >
                Deactivate
              </button>
              <button
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                onClick={bulkDelete}
                disabled={bulkWorking}
              >
                Delete
              </button>
            </div>
          </motion.div>
        )}

        {/* Action Bar */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
              onClick={openCreate}
            >
              <Icons.plus />
              New ingredient
            </button>

            {hasFilteredItems && (
              <>
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1" />
                <button
                  className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                  onClick={handleSelectAll}
                >
                  {selectedRows.size === filtered.length ? 'Deselect all' : 'Select all'}
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Filter Bar */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          categories={categories}
          sortBy={sortBy}
          onSortChange={setSortBy}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onClearFilters={() => {
            setSearch('')
            setCategory('')
            setSortBy('name')
          }}
          hasActiveFilters={hasActiveFilters}
          onExport={bulkExport}
          onImport={bulkImport}
        />

        {/* Stats Cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <StatsCard
            label="Total items"
            value={stats.items}
            sublabel="filtered results"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          />
          <StatsCard
            label="Average cost"
            value={money(stats.avgNet)}
            sublabel="per unit"
            icon={<Icons.dollar />}
          />
          <StatsCard
            label="Missing costs"
            value={stats.missingCost}
            sublabel="need attention"
            icon={<Icons.alert />}
            warning={stats.missingCost > 0}
          />
          <StatsCard
            label="Warnings"
            value={stats.warnUnits}
            sublabel="unit mismatches"
            icon={<Icons.bolt />}
            warning={stats.warnUnits > 0}
          />
          <StatsCard
            label="Organic"
            value={stats.organicCount}
            sublabel="certified items"
            icon={<Icons.star />}
          />
          <StatsCard
            label="Local"
            value={stats.localCount}
            sublabel="sourced locally"
            icon={<Icons.tag />}
          />
        </motion.div>

        {/* Main Content */}
        {loading && <LoadingState viewMode={viewMode} />}

        {err && <ErrorState message={err} onRetry={load} />}

        {!loading && !err && (
          <motion.div variants={itemVariants}>
            {filtered.length === 0 ? (
              <EmptyState 
                onAdd={openCreate} 
                hasFilters={hasActiveFilters || !showInactive}
                onClearFilters={() => {
                  setSearch('')
                  setCategory('')
                  setShowInactive(false)
                }}
              />
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {viewMode === 'table' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                          <th className="px-2 py-3 w-8">
                            <input
                              type="checkbox"
                              checked={selectedRows.size === filtered.length && filtered.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                          <th className="px-4 py-3 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                          <th className="px-4 py-3 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack</th>
                          <th className="px-4 py-3 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                          <th className="px-4 py-3 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack Price</th>
                          <th className="px-4 py-3 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit Price</th>
                          <th className="px-4 py-3 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        <AnimatePresence>
                          {filtered.map((r) => (
                            <IngredientTableRow
                              key={r.id}
                              ingredient={r}
                              isDebug={isDebug}
                              onEdit={openEdit}
                              onDeactivate={deactivate}
                              onHardDelete={hardDelete}
                              onDuplicate={openDuplicate}
                              selected={selectedRows.has(r.id)}
                              onSelect={handleSelectRow}
                            />
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}

                {viewMode === 'grid' && (
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientGridCard
                            key={r.id}
                            ingredient={r}
                            onEdit={openEdit}
                            onDeactivate={deactivate}
                            onHardDelete={hardDelete}
                            onDuplicate={openDuplicate}
                            selected={selectedRows.has(r.id)}
                            onSelect={handleSelectRow}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {viewMode === 'compact' && (
                  <div className="p-2">
                    <div className="space-y-1">
                      <AnimatePresence>
                        {filtered.map((r) => (
                          <IngredientCompactRow
                            key={r.id}
                            ingredient={r}
                            onEdit={openEdit}
                            onDeactivate={deactivate}
                            onHardDelete={hardDelete}
                            onDuplicate={openDuplicate}
                            selected={selectedRows.has(r.id)}
                            onSelect={handleSelectRow}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Modal */}
        <Modal open={modalOpen} title={editingId ? 'Edit ingredient' : duplicateFrom ? 'Duplicate ingredient' : 'New ingredient'} onClose={() => setModalOpen(false)} size="large">
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Basic Information</h3>
              
              <FormField label="Name" required>
                <Input
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="e.g. Extra Virgin Olive Oil"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Category">
                  <Input
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    placeholder="e.g. Oils"
                  />
                </FormField>
                <FormField label="Supplier">
                  <Input
                    value={fSupplier}
                    onChange={(e) => setFSupplier(e.target.value)}
                    placeholder="e.g. Sysco"
                  />
                </FormField>
              </div>

              <FormField label="Barcode">
                <Input
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="e.g. 123456789012"
                />
              </FormField>
            </div>

            {/* Code Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code System</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Ingredient Code" hint="ING-000123">
                  <Input
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                </FormField>
                <FormField label="Category Code" hint={`e.g. ${suggestedCodeCategory}`}>
                  <Input
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormField>
              </div>
              {!canEditCodes && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Icons.alert width={12} height={12} />
                  Code fields are owner-only
                </p>
              )}
            </div>

            {/* Pack & Cost */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack & Cost</h3>

              {/* Unit Selector */}
              <div className="flex gap-2">
                {['g', 'kg', 'ml', 'l', 'pcs'].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setFPackUnit(unit)}
                    className={cls(
                      "flex-1 px-3 py-2 text-xs font-mono rounded-lg border transition-all",
                      fPackUnit === unit
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Pack Size" required>
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    value={fPackSize}
                    onChange={(e) => setFPackSize(e.target.value)}
                    suffix={fPackUnit}
                  />
                </FormField>
                <FormField label="Unit" required>
                  <div className="px-3 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 font-mono text-sm">
                    {fPackUnit}
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Pack Price" required>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={fPackPrice}
                    onChange={(e) => setFPackPrice(e.target.value)}
                    prefix="$"
                  />
                </FormField>
                <FormField label="Unit Price" hint={`per ${fPackUnit}`}>
                  <Input
                    type="number"
                    step="0.000001"
                    min={0}
                    value={fNetUnitCost}
                    onChange={(e) => setFNetUnitCost(e.target.value)}
                    prefix="$"
                    suffix={`/${fPackUnit}`}
                  />
                </FormField>
              </div>

              {/* Calculation Preview */}
              {parseFloat(fPackPrice) > 0 && parseFloat(fPackSize) > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-700 dark:text-blue-400">Preview:</span>
                    <span className="font-mono text-blue-900 dark:text-blue-300">
                      ${parseFloat(fPackPrice)} ÷ {parseFloat(fPackSize)} {fPackUnit} = ${(parseFloat(fPackPrice) / parseFloat(fPackSize)).toFixed(4)} /{fPackUnit}
                    </span>
                  </div>
                  <button
                    className="w-full mt-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center justify-center gap-1"
                    onClick={smartRecalcNetCost}
                  >
                    <Icons.bolt width={12} height={12} />
                    Apply calculation
                  </button>
                </div>
              )}
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Additional Information</h3>

              <FormField label="Storage Instructions">
                <textarea
                  className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
                  value={fStorage}
                  onChange={(e) => setFStorage(e.target.value)}
                  placeholder="e.g. Store in cool, dry place"
                />
              </FormField>

              <FormField label="Minimum Stock">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={fMinStock}
                  onChange={(e) => setFMinStock(e.target.value)}
                  placeholder="e.g. 10"
                  suffix={fPackUnit}
                />
              </FormField>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fOrganic}
                    onChange={(e) => setFOrganic(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Organic certified</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fLocal}
                    onChange={(e) => setFLocal(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Local sourced</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20 disabled:opacity-40"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Saving...' : editingId ? 'Update' : duplicateFrom ? 'Duplicate' : 'Create'}
              </button>
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
          background: #4b5563;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </motion.div>
  )
}
