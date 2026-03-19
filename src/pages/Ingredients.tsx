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

// ==================== NUCLEUS DESIGN SYSTEM ====================

/* 
  ███╗   ██╗██╗   ██╗ ██████╗██╗     ███████╗██╗   ██╗███████╗
  ████╗  ██║██║   ██║██╔════╝██║     ██╔════╝██║   ██║██╔════╝
  ██╔██╗ ██║██║   ██║██║     ██║     █████╗  ██║   ██║███████╗
  ██║╚██╗██║██║   ██║██║     ██║     ██╔══╝  ██║   ██║╚════██║
  ██║ ╚████║╚██████╔╝╚██████╗███████╗███████╗╚██████╔╝███████║
  ╚═╝  ╚═══╝ ╚═════╝  ╚═════╝╚══════╝╚══════╝ ╚═════╝ ╚══════╝
  
  GASTROCHEF NUCLEUS - Professional Kitchen Operating System
  Ingredients Core Module
  Version 2.0.0
*/

// ==================== Color System ====================
const colors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    700: '#15803d',
    950: '#052e16',
  },
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    700: '#b45309',
    950: '#422006',
  },
  danger: {
    50: '#fef2f2',
    500: '#ef4444',
    700: '#b91c1c',
    950: '#450a0a',
  },
  accent: {
    cyan: '#06b6d4',
    purple: '#a855f7',
    amber: '#f59e0b',
    emerald: '#10b981',
  },
}

// ==================== Icons System ====================
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
  nucleus: (props: any) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" stroke="currentColor" strokeWidth="1.5" />
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
  spark: (props: any) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
    </svg>
  ),
  filter: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
    </svg>
  ),
  sort: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 9h14M3 15h10M17 5l4 4-4 4M7 19l-4-4 4-4" />
    </svg>
  ),
  more: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  reset: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
}

// ==================== Typography System ====================
const typography = {
  h1: 'text-2xl font-light tracking-tight',
  h2: 'text-lg font-medium',
  h3: 'text-sm font-medium',
  body: 'text-sm',
  small: 'text-xs',
  micro: 'text-[10px]',
  code: 'font-mono text-sm',
  label: 'text-xs font-medium uppercase tracking-wider',
}

// ==================== Spacing System ====================
const spacing = {
  section: 'mb-8',
  card: 'p-6',
  input: 'px-4 py-2.5',
  button: 'px-4 py-2',
  table: {
    cell: 'px-4 py-3',
    header: 'px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider',
  },
}

// ==================== Core Components ====================

// Card Component
const Card = ({ children, className, onClick, interactive = false }: { children: ReactNode; className?: string; onClick?: () => void; interactive?: boolean }) => (
  <motion.div
    className={cls(
      'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm',
      interactive && 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all cursor-pointer',
      className
    )}
    whileHover={interactive ? { y: -1 } : {}}
    onClick={onClick}
  >
    {children}
  </motion.div>
)

// Button Component
const Button = ({ 
  variant = 'default', 
  size = 'default', 
  children, 
  className, 
  icon,
  onClick,
  disabled,
  title,
  fullWidth = false
}: { 
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'default' | 'lg'
  children?: ReactNode
  className?: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  fullWidth?: boolean
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
    ghost: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/20',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    default: 'px-4 py-2 text-sm rounded-xl',
    lg: 'px-5 py-2.5 text-base rounded-xl',
  }

  return (
    <motion.button
      className={cls(
        'inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
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

// Input Component
const Input = ({ className, icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) => (
  <div className="relative">
    {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}
    <input
      className={cls(
        'w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all',
        icon ? 'pl-9' : 'px-4',
        props.type === 'number' ? 'pr-12' : 'pr-4',
        'py-2.5 text-sm',
        className
      )}
      {...props}
    />
  </div>
)

// Select Component
const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select
      className={cls(
        'w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all appearance-none',
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

// Badge Component
const Badge = ({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const variants = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400',
    warning: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
    danger: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400',
    info: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
  }

  return (
    <span className={cls(
      'inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-medium',
      variants[variant]
    )}>
      {children}
    </span>
  )
}

// Unit Badge Component
const UnitBadge = ({ unit }: { unit: string }) => {
  const unitMap: Record<string, { symbol: string; label: string }> = {
    g: { symbol: 'g', label: 'gram' },
    kg: { symbol: 'kg', label: 'kilogram' },
    ml: { symbol: 'ml', label: 'milliliter' },
    l: { symbol: 'L', label: 'liter' },
    pcs: { symbol: 'pcs', label: 'pieces' },
  }

  const u = unitMap[unit] || { symbol: unit, label: unit }

  return (
    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      {u.symbol}
    </span>
  )
}

// Price Display Component
const PriceDisplay = ({ amount, unit }: { amount: number; unit: string }) => (
  <div className="flex items-center justify-end gap-1.5">
    <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}
    </span>
    <UnitBadge unit={unit} />
  </div>
)

// ==================== Modern Modal ====================
const ModernModal = ({ 
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
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) => {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
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
          {/* Backdrop */}
          <motion.div 
            className="absolute inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div 
            className={`relative w-full ${sizes[size]} mx-auto`}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <Card className="overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-base font-medium text-gray-900 dark:text-white">{title}</h2>
                <Button variant="ghost" size="sm" onClick={onClose} icon={<Icons.close />} />
              </div>

              {/* Content */}
              <div className="px-6 py-5 max-h-[calc(90vh-12rem)] overflow-y-auto custom-scrollbar">
                {children}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Form Section ====================
const FormSection = ({ title, optional = false, children }: { title: string; optional?: boolean; children: ReactNode }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
      {optional && (
        <Badge variant="default">Optional</Badge>
      )}
    </div>
    {children}
  </div>
)

// ==================== Form Field ====================
const FormField = ({ 
  label, 
  required, 
  children,
  hint
}: { 
  label: string
  required?: boolean
  children: ReactNode
  hint?: string
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
  </div>
)

// ==================== Table Row ====================
const TableRow = memo(function TableRow({
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
        'group border-b border-gray-100 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors',
        !active && 'opacity-40'
      )}
    >
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
            <Badge variant="warning" icon={<Icons.alert />}>
              Unit?
            </Badge>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(ingredient)}
            icon={<Icons.edit />}
            title="Edit ingredient"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ingredient.id)}
            icon={<Icons.delete />}
            title="Delete ingredient"
            className="hover:text-red-600 dark:hover:text-red-400"
          />
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Metric Card ====================
const MetricCard = ({ label, value, sublabel, icon, trend }: { 
  label: string
  value: string | number
  sublabel: string
  icon: ReactNode
  trend?: { value: number; positive: boolean }
}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-light text-gray-900 dark:text-white">
            {value}
          </span>
          {trend && (
            <Badge variant={trend.positive ? 'success' : 'danger'}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          {sublabel}
        </div>
      </div>
      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
        {icon}
      </div>
    </div>
  </Card>
)

// ==================== Empty State ====================
const EmptyState = ({ onAdd }: { onAdd: () => void }) => (
  <Card className="p-12 text-center">
    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl flex items-center justify-center text-3xl border border-blue-100 dark:border-blue-800">
      🥗
    </div>
    <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
      No ingredients yet
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
      Start building your kitchen database by adding your first ingredient.
    </p>
    <Button variant="primary" onClick={onAdd} icon={<Icons.plus />}>
      Add ingredient
    </Button>
  </Card>
)

// ==================== Loading State ====================
const LoadingState = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </div>
    <Card className="p-5">
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
    </Card>
  </div>
)

// ==================== Error State ====================
const ErrorState = ({ message }: { message: string }) => (
  <Card className="p-6 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
    <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
      <Icons.alert />
      <span className="text-sm">{message}</span>
    </div>
  </Card>
)

// ==================== Filter Bar ====================
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
  onClearFilters,
  hasActiveFilters
}: {
  search: string
  onSearchChange: (v: string) => void
  category: string
  onCategoryChange: (v: string) => void
  categories: string[]
  sortBy: string
  onSortChange: (v: any) => void
  showInactive: boolean
  onShowInactiveChange: (v: boolean) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}) => (
  <div className="flex items-center gap-3">
    {/* Search */}
    <div className="flex-1 max-w-sm">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search ingredients..."
        icon={<Icons.search />}
      />
    </div>

    {/* Category Filter */}
    <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </Select>

    {/* Sort */}
    <Select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
      <option value="name">Sort by name</option>
      <option value="cost">Sort by cost</option>
      <option value="pack_price">Sort by pack price</option>
    </Select>

    {/* Show Inactive Toggle */}
    <Button
      variant={showInactive ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => onShowInactiveChange(!showInactive)}
      icon={<div className={cls(
        "w-3 h-3 rounded border",
        showInactive ? "bg-blue-600 border-blue-600" : "border-gray-400"
      )}>
        {showInactive && <Icons.check width={10} height={10} className="text-white" />}
      </div>}
    >
      Show inactive
    </Button>

    {/* Clear Filters */}
    {hasActiveFilters && (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearFilters}
        icon={<Icons.reset />}
      >
        Clear
      </Button>
    )}
  </div>
)

// ==================== Action Bar ====================
const ActionBar = ({ 
  onAdd,
  onBulkRecalc,
  onBulkActivate,
  onBulkDeactivate,
  bulkWorking,
  hasSelection
}: {
  onAdd: () => void
  onBulkRecalc: () => void
  onBulkActivate: () => void
  onBulkDeactivate: () => void
  bulkWorking: boolean
  hasSelection: boolean
}) => (
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        onClick={onAdd}
        icon={<Icons.plus />}
      >
        New ingredient
      </Button>

      {hasSelection && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBulkRecalc}
            disabled={bulkWorking}
            icon={<Icons.bolt />}
          >
            Recalculate
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBulkActivate}
            disabled={bulkWorking}
          >
            Activate
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBulkDeactivate}
            disabled={bulkWorking}
          >
            Deactivate
          </Button>
        </>
      )}
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
    const ok = confirm('Deactivate ingredient?')
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

  // Check if any filters are active
  const hasActiveFilters = search !== '' || category !== ''

  // Check if any items are selected for bulk actions
  const hasSelection = filtered.length > 0

  // Animation variants
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Icons.nucleus />
            </div>
            <div>
              <h1 className="text-xl font-light text-gray-900 dark:text-white tracking-tight">
                Ingredients
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {filtered.length} items · {stats.missingCost} missing costs
              </p>
            </div>
          </div>

          {/* Debug info */}
          {isDebug && kitchenId && (
            <Badge variant="info">Kitchen: {kitchenId.slice(0, 8)}</Badge>
          )}
        </motion.div>

        {/* Action Bar - Primary actions only */}
        <motion.div variants={itemVariants}>
          <ActionBar
            onAdd={openCreate}
            onBulkRecalc={bulkRecalcNetCosts}
            onBulkActivate={() => bulkSetActive(true)}
            onBulkDeactivate={() => bulkSetActive(false)}
            bulkWorking={bulkWorking}
            hasSelection={hasSelection}
          />
        </motion.div>

        {/* Filter Bar - Clean and organized */}
        <motion.div variants={itemVariants} className="mb-6">
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
            onClearFilters={() => {
              setSearch('')
              setCategory('')
            }}
            hasActiveFilters={hasActiveFilters}
          />
        </motion.div>

        {/* Stats Cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="Total items"
            value={stats.items}
            sublabel="filtered results"
            icon={<Icons.nucleus width={18} height={18} />}
          />
          <MetricCard
            label="Average cost"
            value={money(stats.avgNet)}
            sublabel="per unit"
            icon={<Icons.dollar width={18} height={18} />}
          />
          <MetricCard
            label="Missing costs"
            value={stats.missingCost}
            sublabel="need attention"
            icon={<Icons.alert width={18} height={18} />}
            trend={stats.missingCost > 0 ? { value: stats.missingCost, positive: false } : undefined}
          />
          <MetricCard
            label="Warnings"
            value={stats.warnUnits}
            sublabel="unit mismatches"
            icon={<Icons.bolt width={18} height={18} />}
            trend={stats.warnUnits > 0 ? { value: stats.warnUnits, positive: false } : undefined}
          />
        </motion.div>

        {/* Main Content - All states handled */}
        {loading && <LoadingState />}

        {err && <ErrorState message={err} />}

        {!loading && !err && (
          <motion.div variants={itemVariants}>
            {filtered.length === 0 ? (
              <EmptyState onAdd={openCreate} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
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
                          <TableRow
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
              </Card>
            )}
          </motion.div>
        )}

        {/* Modal - Perfectly centered */}
        <ModernModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit ingredient' : 'New ingredient'}
          size="lg"
        >
          <div className="space-y-6">
            {/* Basic Information */}
            <FormSection title="Basic Information">
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
            </FormSection>

            {/* Code System - Optional */}
            <FormSection title="Code System" optional>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Ingredient Code" hint="ING-000123">
                  <Input
                    className={!canEditCodes ? "opacity-50 bg-gray-100 dark:bg-gray-900" : ""}
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    placeholder="ING-000123"
                    disabled={!canEditCodes}
                  />
                </FormField>
                <FormField label="Category Code" hint={`e.g. ${suggestedCodeCategory}`}>
                  <Input
                    className={!canEditCodes ? "opacity-50 bg-gray-100 dark:bg-gray-900" : ""}
                    value={fCodeCategory}
                    onChange={(e) => setFCodeCategory(e.target.value)}
                    placeholder={suggestedCodeCategory}
                    disabled={!canEditCodes}
                  />
                </FormField>
              </div>
              {!canEditCodes && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <Icons.alert width={12} height={12} />
                  Code fields are owner-only
                </p>
              )}
            </FormSection>

            {/* Pack & Cost */}
            <FormSection title="Pack & Cost">
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
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      value={fPackSize}
                      onChange={(e) => setFPackSize(e.target.value)}
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                      {fPackUnit}
                    </span>
                  </div>
                </FormField>
                <FormField label="Unit" required>
                  <div className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-mono text-sm">
                    {fPackUnit}
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Pack Price" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={fPackPrice}
                      onChange={(e) => setFPackPrice(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </FormField>
                <FormField label="Unit Price" hint={`per ${fPackUnit}`}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <Input
                      type="number"
                      step="0.000001"
                      value={fNetUnitCost}
                      onChange={(e) => setFNetUnitCost(e.target.value)}
                      className="pl-7 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500">
                      /{fPackUnit}
                    </span>
                  </div>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                    onClick={smartRecalcNetCost}
                    icon={<Icons.bolt />}
                  >
                    Apply calculation
                  </Button>
                </div>
              )}
            </FormSection>

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </ModernModal>

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
