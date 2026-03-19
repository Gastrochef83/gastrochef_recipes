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

// ==================== NEO·KITCHEN Icons System ====================
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  dollar: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  alert: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  ingredient: (props: any) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  bolt: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  check: (props: any) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  sparkle: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
    </svg>
  ),
  history: (props: any) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
}

// ==================== Glass Card Component ====================
const GlassCard = ({ children, className, glow = false }: { children: ReactNode; className?: string; glow?: boolean }) => (
  <div className={cls(
    "relative overflow-hidden rounded-2xl",
    glow && "before:absolute before:inset-0 before:bg-gradient-to-r before:from-blue-500/20 before:to-purple-500/20 before:blur-xl before:opacity-0 before:transition-opacity hover:before:opacity-100",
    className
  )}>
    <div className="relative bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-white/30 dark:border-gray-800/30 shadow-xl rounded-2xl">
      {children}
    </div>
  </div>
)

// ==================== Unit Badge ====================
const UnitBadge = ({ unit, active = false }: { unit: string; active?: boolean }) => {
  const unitMap: Record<string, { symbol: string; label: string; color: string }> = {
    g: { symbol: 'g', label: 'gram', color: 'blue' },
    kg: { symbol: 'kg', label: 'kilogram', color: 'indigo' },
    ml: { symbol: 'ml', label: 'milliliter', color: 'cyan' },
    l: { symbol: 'L', label: 'liter', color: 'teal' },
    pcs: { symbol: 'pcs', label: 'pieces', color: 'amber' },
  }

  const u = unitMap[unit] || { symbol: unit, label: unit, color: 'gray' }

  return (
    <span className={cls(
      "inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-mono font-medium transition-all",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" 
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700/50"
    )}>
      {u.symbol}
    </span>
  )
}

// ==================== NeoKitchen Modal ====================
const NeoKitchenModal = ({ 
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
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
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
          {/* Dynamic backdrop with blur */}
          <motion.div 
            className="absolute inset-0 bg-gradient-to-br from-gray-900/60 via-gray-900/70 to-gray-900/60 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Animated background glow */}
          <motion.div 
            className="absolute w-96 h-96 bg-blue-500/30 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.2, 1],
              x: ['-50%', '-40%', '-50%'],
              y: ['-50%', '-60%', '-50%'],
            }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div 
            className="absolute w-96 h-96 bg-purple-500/30 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.3, 1],
              x: ['50%', '40%', '50%'],
              y: ['50%', '60%', '50%'],
            }}
            transition={{ duration: 10, repeat: Infinity }}
          />

          {/* Modal */}
          <motion.div 
            className={`relative w-full ${sizeClasses[size]} mx-auto`}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Glass container */}
            <div className="relative overflow-hidden rounded-3xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl border border-white/30 dark:border-gray-800/30 shadow-2xl">
              {/* Top gradient line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
              
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200/50 dark:border-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg">
                    <Icons.sparkle />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {title}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      NEO·KITCHEN · Smart Management
                    </p>
                  </div>
                </div>
                <motion.button 
                  className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  onClick={onClose}
                  whileHover={{ scale: 1.05, rotate: 90 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Icons.close />
                </motion.button>
              </div>

              {/* Content */}
              <div className="px-8 py-6 max-h-[calc(90vh-12rem)] overflow-y-auto custom-scrollbar">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==================== Smart Search Component ====================
const SmartSearch = ({ value, onChange, onClear }: { value: string; onChange: (v: string) => void; onClear: () => void }) => {
  const [recentSearches] = useState(['Olive Oil', 'Tomatoes', 'Flour'])
  const [showSuggestions, setShowSuggestions] = useState(false)

  return (
    <div className="relative">
      <div className="relative group">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
          <Icons.search />
        </span>
        <input
          className="w-full pl-11 pr-10 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Search ingredients, codes, categories..."
        />
        {value && (
          <button 
            type="button" 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full p-1"
            onClick={onClear}
          >
            <Icons.close width={14} height={14} />
          </button>
        )}
      </div>

      {/* Search suggestions */}
      <AnimatePresence>
        {showSuggestions && !value && (
          <motion.div 
            className="absolute top-full left-0 right-0 mt-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl overflow-hidden z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">🔥 Recent searches</span>
            </div>
            {recentSearches.map((search) => (
              <button
                key={search}
                className="w-full px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
                onClick={() => onChange(search)}
              >
                <Icons.history className="text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{search}</span>
              </button>
            ))}
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">⚡ Quick filters: </span>
              <button className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-2">Category: Oils</button>
              <button className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-2">Price < $10</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ==================== Measurement Hub Component ====================
const MeasurementHub = ({ 
  unit, 
  onUnitChange,
  packSize,
  onPackSizeChange,
  packPrice,
  onPackPriceChange,
  unitPrice,
  onUnitPriceChange
}: {
  unit: string
  onUnitChange: (u: string) => void
  packSize: string
  onPackSizeChange: (v: string) => void
  packPrice: string
  onPackPriceChange: (v: string) => void
  unitPrice: string
  onUnitPriceChange: (v: string) => void
}) => {
  const units = ['g', 'kg', 'ml', 'l', 'pcs']

  const recalcUnitPrice = () => {
    const ps = Math.max(1, toNum(packSize, 1))
    const pp = Math.max(0, toNum(packPrice, 0))
    const net = pp / ps
    onUnitPriceChange(String(Math.round(net * 1000000) / 1000000))
  }

  return (
    <GlassCard glow className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">📐 Measurement Hub</h3>
        <span className="text-[9px] font-mono bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full ml-auto">
          NEO·UNIT
        </span>
      </div>

      {/* Unit Selector */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {units.map((u) => (
          <motion.button
            key={u}
            type="button"
            onClick={() => onUnitChange(u)}
            className={cls(
              "py-3 rounded-xl text-sm font-mono transition-all",
              unit === u
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200/50 dark:border-gray-700/50"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {u}
          </motion.button>
        ))}
      </div>

      {/* Measurements */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">
            PACK SIZE
          </label>
          <div className="relative">
            <input
              type="number"
              min={1}
              step="1"
              value={packSize}
              onChange={(e) => onPackSizeChange(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
              {unit}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">
            UNIT
          </label>
          <div className="px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white font-mono">
            {unit}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">
            PACK PRICE
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              value={packPrice}
              onChange={(e) => onPackPriceChange(e.target.value)}
              className="w-full pl-8 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">
            UNIT PRICE
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              step="0.000001"
              value={unitPrice}
              onChange={(e) => onUnitPriceChange(e.target.value)}
              className="w-full pl-8 pr-16 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400 dark:text-gray-500">
              /{unit}
            </span>
          </div>
        </div>
      </div>

      {/* Smart Calculation */}
      {parseFloat(packPrice) > 0 && parseFloat(packSize) > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border border-blue-200/50 dark:border-blue-800/50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icons.bolt className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Smart Calculation</span>
            </div>
            <span className="text-xs font-mono text-blue-900 dark:text-blue-300">
              ${parseFloat(packPrice)} ÷ {parseFloat(packSize)} {unit} = ${(parseFloat(packPrice) / parseFloat(packSize)).toFixed(4)} /{unit}
            </span>
          </div>
          <motion.button
            className="mt-3 w-full py-2 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all flex items-center justify-center gap-2"
            onClick={recalcUnitPrice}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <Icons.bolt width={14} height={14} />
            Apply to unit price
          </motion.button>
        </motion.div>
      )}
    </GlassCard>
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
        'group relative border-b border-gray-100/50 dark:border-gray-800/30 last:border-0 hover:bg-gradient-to-r hover:from-gray-50/80 hover:to-white/50 dark:hover:from-gray-800/50 dark:hover:to-gray-900/50 transition-all',
        !active && 'opacity-40'
      )}
    >
      {/* Hover glow effect */}
      <td className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
            {ingredient.code || '—'}
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className={cls(
            "text-sm font-medium text-gray-900 dark:text-white",
            !active && "line-through"
          )}>
            {ingredient.name ?? '—'}
          </span>
          {flag.level === 'warn' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20">
              <Icons.alert width={10} height={10} />
              unit?
            </span>
          )}
        </div>
        {isDebug && (
          <div className="text-[9px] font-mono text-gray-400 dark:text-gray-500 mt-1">
            {ingredient.id.slice(0, 8)}...
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
        {ingredient.category ?? '—'}
      </td>
      <td className="px-4 py-4 text-center">
        <span className="text-sm font-mono text-gray-900 dark:text-white">
          {Math.max(1, toNum(ingredient.pack_size, 1))}
        </span>
      </td>
      <td className="px-4 py-4">
        <UnitBadge unit={unit} />
      </td>
      <td className="px-4 py-4 text-right">
        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
          {money(toNum(ingredient.pack_price, 0))}
        </span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">/{unit}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
          {money(net)}
        </span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">/{unit}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <motion.button 
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
            onClick={() => onEdit(ingredient)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Icons.edit />
          </motion.button>
          <motion.button 
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
            onClick={() => onDelete(ingredient.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Icons.delete />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  )
})

// ==================== Metric Card ====================
const MetricCard = ({ label, value, sublabel, trend, icon }: { 
  label: string
  value: string | number
  sublabel: string
  trend?: { value: number; positive: boolean }
  icon: ReactNode
}) => (
  <GlassCard glow className="p-6">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-light text-gray-900 dark:text-white">
            {value}
          </span>
          {trend && (
            <span className={cls(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              trend.positive 
                ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/50 dark:border-emerald-500/20" 
                : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200/50 dark:border-red-500/20"
            )}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          {sublabel}
        </div>
      </div>
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg">
        {icon}
      </div>
    </div>
  </GlassCard>
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
      transition: { staggerChildren: 0.03 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-2xl shadow-blue-600/30">
                <Icons.ingredient />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-light text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                NEO·KITCHEN
                <span className="text-[8px] font-mono bg-gradient-to-r from-blue-600 to-purple-600 text-white px-2 py-1 rounded-full">
                  BETA
                </span>
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                <span>{filtered.length} active ingredients</span>
                <span className="w-1 h-1 bg-gray-400 rounded-full" />
                <span>{stats.missingCost} need pricing</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              className="px-4 py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all flex items-center gap-2"
              onClick={() => setShowInactive(!showInactive)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cls(
                "w-4 h-4 rounded border transition-colors",
                showInactive 
                  ? "bg-blue-600 border-blue-600" 
                  : "border-gray-300 dark:border-gray-600"
              )}>
                {showInactive && <Icons.check width={12} height={12} className="text-white" />}
              </div>
              <span>Show inactive</span>
            </motion.button>

            <GlassCard className="!p-0">
              <select 
                className="px-4 py-2 bg-transparent text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="name">Sort by name</option>
                <option value="cost">Sort by unit price</option>
                <option value="pack_price">Sort by pack price</option>
              </select>
            </GlassCard>

            <motion.button 
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-600/30 hover:shadow-xl transition-all flex items-center gap-2"
              onClick={openCreate}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icons.plus />
              New ingredient
            </motion.button>
          </div>
        </motion.div>

        {/* Search & Filters */}
        <motion.div variants={itemVariants} className="grid grid-cols-12 gap-4 mb-8">
          <div className="col-span-6">
            <SmartSearch value={search} onChange={setSearch} onClear={() => setSearch('')} />
          </div>
          <div className="col-span-3">
            <GlassCard className="!p-0">
              <select 
                className="w-full px-4 py-3 bg-transparent text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </GlassCard>
          </div>
          <div className="col-span-3 flex items-center justify-end gap-2">
            <motion.button 
              className="px-4 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
              onClick={bulkRecalcNetCosts} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Recalc
            </motion.button>
            <motion.button 
              className="px-4 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
              onClick={() => bulkSetActive(true)} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Activate
            </motion.button>
            <motion.button 
              className="px-4 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
              onClick={() => bulkSetActive(false)} 
              disabled={bulkWorking}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Deactivate
            </motion.button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-6 mb-8">
          <MetricCard
            label="Total items"
            value={stats.items}
            sublabel="filtered results"
            icon={<Icons.ingredient width={18} height={18} />}
          />
          <MetricCard
            label="Average unit price"
            value={money(stats.avgNet)}
            sublabel="per unit"
            icon={<Icons.dollar width={18} height={18} />}
          />
          <MetricCard
            label="Missing prices"
            value={stats.missingCost}
            sublabel="need attention"
            trend={stats.missingCost > 0 ? { value: stats.missingCost, positive: false } : undefined}
            icon={<Icons.alert width={18} height={18} />}
          />
          <MetricCard
            label="Unit warnings"
            value={stats.warnUnits}
            sublabel="possible mismatch"
            trend={stats.warnUnits > 0 ? { value: stats.warnUnits, positive: false } : undefined}
            icon={<Icons.bolt width={18} height={18} />}
          />
        </motion.div>

        {/* Loading/Error */}
        {loading && (
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="grid grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <GlassCard key={i} className="p-6">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </GlassCard>
              ))}
            </div>
            <GlassCard className="p-6">
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-48 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {err && (
          <motion.div variants={itemVariants}>
            <GlassCard className="p-6 bg-red-50/80 dark:bg-red-950/30 border-red-200/50 dark:border-red-800/50">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                <Icons.alert />
                <span className="text-sm">{err}</span>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Table */}
        {!loading && !err && (
          <motion.div variants={itemVariants}>
            {filtered.length === 0 ? (
              <GlassCard className="p-12 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center text-4xl">
                  🥗
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {rows.length === 0 ? 'No ingredients yet' : 'No results found'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
                  {rows.length === 0 
                    ? 'Get started by adding your first ingredient to NEO·KITCHEN.'
                    : 'Try adjusting your search or filters to find what you\'re looking for.'}
                </p>
                {rows.length === 0 && (
                  <motion.button 
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-600/30 hover:shadow-xl transition-all inline-flex items-center gap-2"
                    onClick={openCreate}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icons.plus />
                    Add ingredient
                  </motion.button>
                )}
              </GlassCard>
            ) : (
              <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200/50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-800/50">
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-4 text-left text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-4 text-center text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack</th>
                        <th className="px-4 py-4 text-center text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pack Price</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit Price</th>
                        <th className="px-4 py-4 text-right text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50 dark:divide-gray-800/50">
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
              </GlassCard>
            )}
          </motion.div>
        )}

        {/* NeoKitchen Modal - Perfectly Centered */}
        <NeoKitchenModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit ingredient' : 'New ingredient'}
          size="lg"
        >
          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Basic Information
                </h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="e.g. Extra Virgin Olive Oil"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Category
                    </label>
                    <input
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                      value={fCategory}
                      onChange={(e) => setFCategory(e.target.value)}
                      placeholder="e.g. Oils"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Supplier
                    </label>
                    <input
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                      value={fSupplier}
                      onChange={(e) => setFSupplier(e.target.value)}
                      placeholder="e.g. Sysco"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Code Section - No Duplication */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Code System
                </h3>
                <span className="text-[8px] font-mono bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full ml-auto">
                  OPTIONAL
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ingredient Code
                  </label>
                  <div className="relative">
                    <input
                      className={cls(
                        "w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all font-mono",
                        !canEditCodes && "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900"
                      )}
                      value={fCode}
                      onChange={(e) => setFCode(e.target.value)}
                      placeholder="ING-000123"
                      disabled={!canEditCodes}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">
                      ING-XXXXX
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category Code
                  </label>
                  <div className="relative">
                    <input
                      className={cls(
                        "w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all font-mono",
                        !canEditCodes && "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900"
                      )}
                      value={fCodeCategory}
                      onChange={(e) => setFCodeCategory(e.target.value)}
                      placeholder={suggestedCodeCategory}
                      disabled={!canEditCodes}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">
                      e.g. {suggestedCodeCategory}
                    </span>
                  </div>
                </div>
              </div>
              {!canEditCodes && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <Icons.alert width={12} height={12} />
                  Code fields are owner-only
                </p>
              )}
            </div>

            {/* Measurement Hub - حل مشكلة الوحدات بشكل نهائي */}
            <MeasurementHub
              unit={fPackUnit}
              onUnitChange={setFPackUnit}
              packSize={fPackSize}
              onPackSizeChange={setFPackSize}
              packPrice={fPackPrice}
              onPackPriceChange={setFPackPrice}
              unitPrice={fNetUnitCost}
              onUnitPriceChange={setFNetUnitCost}
            />

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/50 dark:border-gray-800/50">
              <motion.button
                className="px-5 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                onClick={() => setModalOpen(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-xl transition-all flex items-center gap-2"
                onClick={save}
                disabled={saving}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Icons.check />
                    {editingId ? 'Update' : 'Create'} ingredient
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </NeoKitchenModal>

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
          background: #374151;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4b5563;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </motion.div>
  )
}
