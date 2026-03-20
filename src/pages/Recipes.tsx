// src/pages/recipes.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { useKitchen } from '../lib/kitchen'
import Button from '../components/ui/Button'
import EmptyState from '../components/EmptyState'
import { motion, AnimatePresence } from 'framer-motion'

// ==================== Types ====================
type LineType = 'ingredient' | 'subrecipe' | 'group'

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  notes: string | null
  position: number
  line_type: LineType
  group_title: string | null
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
  category?: string | null
}

type RecipeRow = {
  id: string
  code?: string | null
  code_category?: string | null
  kitchen_id: string
  name: string
  category: string | null
  cuisine?: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
  is_featured?: boolean
  is_favorite?: boolean
  photo_url: string | null
  description: string | null
  preparation_time?: number | null
  cooking_time?: number | null
  difficulty?: 'easy' | 'medium' | 'hard' | null
  tags?: string[] | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
  created_at?: string
  updated_at?: string
  version?: number
}

type CostPoint = {
  at: number
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  profit: number
  warnings: string[]
}

type Density = 'comfortable' | 'dense' | 'compact'
type ViewMode = 'grid' | 'list' | 'table'
type SortField = 'name' | 'code' | 'category' | 'price' | 'cost' | 'margin' | 'date'
type SortOrder = 'asc' | 'desc'
type FilterType = {
  categories: string[]
  cuisines: string[]
  difficulty: string[]
  isFeatured: boolean | null
  isFavorite: boolean | null
  isSubrecipe: boolean | null
}

// ==================== Utility Functions ====================
function toNum(x: any, fallback = 0): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string): string {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function convertQtyToPackUnit(qty: number, lineUnit: string, packUnit: string): number {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  let conv = qty
  if (u === 'g' && p === 'kg') conv = qty / 1000
  else if (u === 'kg' && p === 'g') conv = qty * 1000
  else if (u === 'ml' && p === 'l') conv = qty / 1000
  else if (u === 'l' && p === 'ml') conv = qty * 1000
  return conv
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100)
}

function formatTime(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function formatRecipeCode(code: string | null | undefined): string {
  if (!code) return ''
  return code.toUpperCase()
}

// ==================== Cache Management ====================
const CACHE_KEYS = {
  INGREDIENTS_REV: 'gc:ingredients:rev',
  COST_CACHE: 'gc:cost:cache',
  RECIPES_CACHE: 'gc:recipes:cache',
  USER_PREFERENCES: 'gc:user:prefs'
}

const CACHE_TTL = {
  COST: 10 * 60 * 1000,
  RECIPES: 5 * 60 * 1000,
  INGREDIENTS: 15 * 60 * 1000
}

class CacheManager {
  static get<T>(key: string, maxAge: number): T | null {
    try {
      const item = localStorage.getItem(key)
      if (!item) return null
      const { data, timestamp } = JSON.parse(item)
      if (Date.now() - timestamp > maxAge) {
        localStorage.removeItem(key)
        return null
      }
      return data as T
    } catch { return null }
  }
  static set(key: string, data: any): void {
    try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })) } catch {}
  }
  static clear(pattern: string): void {
    try { Object.keys(localStorage).forEach(key => { if (key.startsWith(pattern)) localStorage.removeItem(key) }) } catch {}
  }
}

// ==================== Custom Hooks ====================
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch { return initialValue }
  })
  const setValue = (value: T) => {
    try { setStoredValue(value); localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }
  return [storedValue, setValue]
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => { const timer = setTimeout(() => setDebouncedValue(value), delay); return () => clearTimeout(timer) }, [value, delay])
  return debouncedValue
}

// ==================== Styles Component ====================
function DashboardStyles() {
  return (
    <style>{`
      /* ===== Modern Dashboard Design System ===== */
      .db-app {
        --db-bg: #F3F4F6;
        --db-bg-card: #FFFFFF;
        --db-text-primary: #111827;
        --db-text-secondary: #6B7280;
        --db-text-tertiary: #9CA3AF;
        --db-border: #E5E7EB;
        --db-accent: #2563EB;
        --db-accent-hover: #1D4ED8;
        --db-accent-light: #EFF6FF;
        --db-success: #10B981;
        --db-success-light: #ECFDF5;
        --db-danger: #EF4444;
        --db-danger-light: #FEF2F2;
        --db-warning: #F59E0B;
        --db-warning-light: #FFFBEB;
        
        --db-radius: 8px;
        --db-radius-lg: 12px;
        --db-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
        --db-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
        
        --db-transition: all 0.15s ease;
        
        min-height: 100vh;
        background: var(--db-bg);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        color: var(--db-text-primary);
      }

      /* ===== Container ===== */
      .db-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 32px;
      }

      @media (max-width: 768px) {
        .db-container { padding: 16px; }
      }

      /* ===== Header ===== */
      .db-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
      }

      .db-header-title {
        font-size: 24px;
        font-weight: 700;
        color: var(--db-text-primary);
        margin: 0;
      }

      .db-header-subtitle {
        font-size: 14px;
        color: var(--db-text-secondary);
        margin-top: 4px;
      }

      .db-header-actions {
        display: flex;
        gap: 12px;
      }

      /* ===== Buttons ===== */
      .db-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 40px;
        padding: 0 20px;
        border-radius: var(--db-radius);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--db-transition);
        border: 1px solid transparent;
        white-space: nowrap;
      }

      .db-btn-primary {
        background: var(--db-accent);
        color: #FFFFFF;
      }

      .db-btn-primary:hover {
        background: var(--db-accent-hover);
      }

      .db-btn-secondary {
        background: var(--db-bg-card);
        border-color: var(--db-border);
        color: var(--db-text-primary);
      }

      .db-btn-secondary:hover {
        background: #F9FAFB;
        border-color: var(--db-accent);
        color: var(--db-accent);
      }

      .db-btn-ghost {
        background: transparent;
        color: var(--db-text-secondary);
        padding: 0 12px;
      }

      .db-btn-ghost:hover {
        background: #F3F4F6;
        color: var(--db-text-primary);
      }

      /* ===== Stats Grid ===== */
      .db-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      @media (max-width: 1024px) { .db-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 640px) { .db-stats { grid-template-columns: 1fr; } }

      .db-stat-card {
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius-lg);
        padding: 20px;
        transition: var(--db-transition);
      }

      .db-stat-card:hover {
        box-shadow: var(--db-shadow-lg);
        transform: translateY(-2px);
      }

      .db-stat-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--db-text-tertiary);
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }

      .db-stat-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--db-text-primary);
      }

      .db-stat-change {
        font-size: 12px;
        color: var(--db-text-secondary);
        margin-top: 4px;
      }

      .db-stat-change.positive { color: var(--db-success); }
      .db-stat-change.negative { color: var(--db-danger); }

      /* ===== Toolbar ===== */
      .db-toolbar {
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius-lg);
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .db-search {
        flex: 1;
        min-width: 200px;
        position: relative;
      }

      .db-search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--db-text-tertiary);
        width: 18px;
        height: 18px;
      }

      .db-search-input {
        width: 100%;
        height: 40px;
        padding: 0 12px 0 38px;
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius);
        background: #F9FAFB;
        font-size: 14px;
        color: var(--db-text-primary);
        transition: var(--db-transition);
      }

      .db-search-input:focus {
        outline: none;
        background: #FFFFFF;
        border-color: var(--db-accent);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .db-clear-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--db-text-tertiary);
        padding: 4px;
      }

      .db-clear-btn:hover { color: var(--db-text-primary); }

      .db-view-toggle {
        display: flex;
        background: #F3F4F6;
        border-radius: var(--db-radius);
        padding: 2px;
      }

      .db-view-btn {
        padding: 8px 16px;
        border: none;
        background: transparent;
        border-radius: 6px;
        cursor: pointer;
        color: var(--db-text-secondary);
        font-size: 13px;
        font-weight: 600;
        transition: var(--db-transition);
      }

      .db-view-btn:hover { color: var(--db-text-primary); }

      .db-view-btn.active {
        background: #FFFFFF;
        color: var(--db-accent);
        box-shadow: var(--db-shadow);
      }

      /* ===== Sort & Filter Row ===== */
      .db-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }

      .db-control-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .db-select {
        height: 36px;
        padding: 0 32px 0 12px;
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius);
        background: #FFFFFF;
        font-size: 13px;
        font-weight: 600;
        color: var(--db-text-primary);
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
      }

      .db-select:hover { border-color: var(--db-accent); }

      .db-results-text {
        font-size: 13px;
        color: var(--db-text-secondary);
      }

      .db-results-text strong {
        font-weight: 700;
        color: var(--db-text-primary);
      }

      /* ===== Grid View ===== */
      .db-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      /* ===== Card ===== */
      .db-card {
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius-lg);
        transition: var(--db-transition);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .db-card:hover {
        border-color: #D1D5DB;
        box-shadow: var(--db-shadow-lg);
      }

      /* ===== Code Header Strip ===== */
      .db-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #F9FAFB;
        border-bottom: 1px solid var(--db-border);
      }

      .db-code-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: #FFFFFF;
        border: 1px solid var(--db-border);
        border-radius: 6px;
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 12px;
        font-weight: 700;
        color: var(--db-text-primary);
        letter-spacing: 0.02em;
      }

      .db-code-label {
        font-size: 10px;
        color: var(--db-text-tertiary);
        text-transform: uppercase;
      }

      .db-card-badges {
        display: flex;
        gap: 6px;
      }

      .db-mini-badge {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #F3F4F6;
        border-radius: 50%;
        font-size: 12px;
      }

      .db-mini-badge.is-favorite { background: #FEE2E2; color: #DC2626; }
      .db-mini-badge.is-featured { background: #FEF3C7; color: #D97706; }

      .db-card-body {
        padding: 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .db-card-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--db-text-primary);
        margin: 0 0 4px;
        line-height: 1.3;
      }

      .db-card-category {
        font-size: 12px;
        color: var(--db-text-secondary);
        margin-bottom: 12px;
      }

      .db-card-desc {
        font-size: 13px;
        color: var(--db-text-secondary);
        line-height: 1.5;
        margin-bottom: 12px;
        flex: 1;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .db-card-stats {
        display: flex;
        justify-content: space-between;
        padding-top: 12px;
        border-top: 1px solid var(--db-border);
        margin-top: auto;
      }

      .db-stat-item {
        text-align: center;
      }

      .db-stat-item-value {
        font-size: 16px;
        font-weight: 700;
        color: var(--db-text-primary);
        display: block;
      }

      .db-stat-item-label {
        font-size: 10px;
        color: var(--db-text-tertiary);
        text-transform: uppercase;
      }

      .db-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #FAFAFA;
        border-top: 1px solid var(--db-border);
      }

      .db-price {
        font-size: 18px;
        font-weight: 700;
        color: var(--db-accent);
      }

      .db-actions {
        display: flex;
        gap: 4px;
      }

      .db-action-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--db-border);
        border-radius: 6px;
        background: #FFFFFF;
        color: var(--db-text-secondary);
        cursor: pointer;
        transition: var(--db-transition);
      }

      .db-action-btn:hover {
        border-color: var(--db-accent);
        color: var(--db-accent);
      }

      .db-action-btn.danger:hover {
        border-color: #EF4444;
        color: #EF4444;
      }

      .db-checkbox {
        width: 16px;
        height: 16px;
        accent-color: var(--db-accent);
        cursor: pointer;
      }

      /* ===== List View ===== */
      .db-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .db-list-item {
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius);
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        transition: var(--db-transition);
      }

      .db-list-item:hover {
        border-color: #D1D5DB;
        box-shadow: var(--db-shadow);
      }

      .db-list-code {
        font-family: 'SF Mono', monospace;
        font-size: 12px;
        font-weight: 700;
        background: #F3F4F6;
        padding: 6px 12px;
        border-radius: 6px;
        color: var(--db-text-primary);
        min-width: 80px;
        text-align: center;
      }

      .db-list-content {
        flex: 1;
      }

      .db-list-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 2px;
      }

      .db-list-meta {
        font-size: 12px;
        color: var(--db-text-secondary);
      }

      .db-list-stats {
        display: flex;
        gap: 24px;
      }

      .db-list-stat-label {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--db-text-tertiary);
      }

      .db-list-stat-value {
        font-weight: 700;
        color: var(--db-text-primary);
      }

      /* ===== Table View ===== */
      .db-table-wrap {
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius-lg);
        overflow: hidden;
      }

      .db-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .db-table th {
        background: #F9FAFB;
        padding: 12px 16px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        color: var(--db-text-tertiary);
        text-transform: uppercase;
        border-bottom: 1px solid var(--db-border);
      }

      .db-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--db-border);
        color: var(--db-text-secondary);
      }

      .db-table tbody tr:hover {
        background: #FAFAFA;
      }

      .db-table-code {
        font-family: 'SF Mono', monospace;
        font-size: 11px;
        font-weight: 700;
        background: #F3F4F6;
        padding: 4px 8px;
        border-radius: 4px;
        color: var(--db-text-primary);
      }

      /* ===== Empty & Loading ===== */
      .db-empty {
        text-align: center;
        padding: 60px 20px;
        background: var(--db-bg-card);
        border: 1px dashed var(--db-border);
        border-radius: var(--db-radius-lg);
      }

      .db-empty-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--db-text-primary);
        margin-bottom: 8px;
      }

      .db-empty-text {
        font-size: 13px;
        color: var(--db-text-secondary);
        margin-bottom: 24px;
      }

      .db-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px;
      }

      .db-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--db-border);
        border-top-color: var(--db-accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .db-loading-text {
        font-size: 13px;
        color: var(--db-text-secondary);
      }

      /* ===== Toast ===== */
      .db-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--db-bg-card);
        border: 1px solid var(--db-border);
        border-radius: var(--db-radius);
        padding: 12px 16px;
        box-shadow: var(--db-shadow-lg);
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        z-index: 100;
        animation: slideIn 0.2s ease;
      }

      @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } }

      .db-toast-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #ECFDF5;
        color: #10B981;
      }

      .db-toast.error .db-toast-icon { background: #FEF2F2; color: #EF4444; }

      .db-toast-close {
        background: none;
        border: none;
        color: var(--db-text-tertiary);
        cursor: pointer;
        padding: 4px;
      }

      /* ===== Responsive ===== */
      @media (max-width: 768px) {
        .db-header { flex-direction: column; align-items: flex-start; gap: 16px; }
        .db-toolbar { flex-direction: column; }
        .db-grid { grid-template-columns: 1fr; }
        .db-list-item { flex-direction: column; align-items: flex-start; }
        .db-list-stats { flex-wrap: wrap; margin-top: 12px; }
      }
    `}</style>
  )
}

// ==================== Main Component ====================
export default function Recipes() {
  const nav = useNavigate()
  const { isKitchen } = useMode()
  const isMgmt = !isKitchen
  const k = useKitchen()

  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const loadingLinesRef = useRef<Set<string>>(new Set())
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => CacheManager.get(CACHE_KEYS.COST_CACHE, CACHE_TTL.COST) || {})

  const [density, setDensity] = useLocalStorage<Density>('gc:density', 'comfortable')
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('gc:view:mode', 'grid')
  const [sortField, setSortField] = useLocalStorage<SortField>('gc:sort:field', 'name')
  const [sortOrder, setSortOrder] = useLocalStorage<SortOrder>('gc:sort:order', 'asc')
  const [filters, setFilters] = useLocalStorage<FilterType>('gc:filters', { categories: [], cuisines: [], difficulty: [], isFeatured: null, isFavorite: null, isSubrecipe: null })

  const debouncedQ = useDebounce(q, 300)

  const ingById = useMemo(() => { const m = new Map<string, Ingredient>(); for (const i of ingredients) m.set(i.id, i); return m }, [ingredients])

  const filteredRecipes = useMemo(() => {
    let list = recipes
    if (debouncedQ) { const query = debouncedQ.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(query) || r.code?.toLowerCase().includes(query) || r.category?.toLowerCase().includes(query) || r.tags?.some(tag => tag.toLowerCase().includes(query))) }
    if (!showArchived) list = list.filter(r => !r.is_archived)
    if (filters.categories.length > 0) list = list.filter(r => r.category && filters.categories.includes(r.category))
    return list
  }, [recipes, debouncedQ, showArchived, filters])

  const sortedRecipes = useMemo(() => {
    return [...filteredRecipes].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name': comparison = a.name.localeCompare(b.name); break
        case 'code': comparison = (a.code || '').localeCompare(b.code || ''); break
        case 'category': comparison = (a.category || '').localeCompare(b.category || ''); break
        case 'price': comparison = (a.selling_price || 0) - (b.selling_price || 0); break
        case 'cost': comparison = (costCache[a.id]?.totalCost || 0) - (costCache[b.id]?.totalCost || 0); break
        case 'margin': comparison = (costCache[a.id]?.margin || 0) - (costCache[b.id]?.margin || 0); break
        case 'date': comparison = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(); break
        default: comparison = 0
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredRecipes, sortField, sortOrder, costCache])

  const selectedIds = useMemo(() => Object.keys(selected).filter(key => selected[key]), [selected])

  const hasAnyRecipes = recipes.length > 0
  const hasActiveRecipes = useMemo(() => recipes.some(r => !r.is_archived), [recipes])
  const hasSearch = q.trim().length > 0
  const showArchivedEmptyHint = !showArchived && hasAnyRecipes && !hasActiveRecipes

  const stats = useMemo(() => {
    const total = recipes.length
    const active = recipes.filter(r => !r.is_archived).length
    const archived = total - active
    const subrecipes = recipes.filter(r => r.is_subrecipe).length
    const featured = recipes.filter(r => r.is_featured).length
    const favorites = recipes.filter(r => r.is_favorite).length
    const totalCost = Object.values(costCache).reduce((sum, c) => sum + c.totalCost, 0)
    const avgCost = active > 0 ? totalCost / active : 0
    const avgMargin = Object.values(costCache).reduce((sum, c) => sum + (c.margin || 0), 0) / (active || 1)
    return { total, active, archived, subrecipes, featured, favorites, totalCost, avgCost, avgMargin }
  }, [recipes, costCache])

  const loadAll = useCallback(async (sync = false) => {
    if (!mountedRef.current) return
    if (!sync) setLoading(true)
    setErr(null)

    try {
      if (!sync) {
        const cachedRecipes = CacheManager.get<RecipeRow[]>(CACHE_KEYS.RECIPES_CACHE, CACHE_TTL.RECIPES)
        const cachedIngredients = CacheManager.get<Ingredient[]>(CACHE_KEYS.INGREDIENTS_REV, CACHE_TTL.INGREDIENTS)
        if (cachedRecipes && cachedIngredients) { setRecipes(cachedRecipes); setIngredients(cachedIngredients); setLoading(false); return }
      }

      const { data: r, error: rErr } = await supabase.from('recipes').select('id,code,code_category,kitchen_id,name,category,cuisine,portions,yield_qty,yield_unit,is_subrecipe,is_archived,is_featured,is_favorite,photo_url,description,preparation_time,cooking_time,difficulty,tags,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct,created_at,updated_at,version').order('is_archived', { ascending: true }).order('name', { ascending: true })
      if (rErr) throw rErr
      const recipesData = (r ?? []) as RecipeRow[]
      if (mountedRef.current) { setRecipes(recipesData); CacheManager.set(CACHE_KEYS.RECIPES_CACHE, recipesData) }

      const { data: i, error: iErr } = await supabase.from('ingredients').select('id,name,pack_unit,net_unit_cost,is_active,category').order('name', { ascending: true })
      if (iErr) throw iErr
      const ingredientsData = (i ?? []) as Ingredient[]
      if (mountedRef.current) { setIngredients(ingredientsData); CacheManager.set(CACHE_KEYS.INGREDIENTS_REV, ingredientsData) }
    } catch (e: any) {
      if (mountedRef.current) { setErr(e?.message || 'Failed to load recipes'); setToast({ type: 'error', message: e?.message || 'Failed to load recipes' }) }
    } finally { if (mountedRef.current) setLoading(false) }
  }, [])

  useEffect(() => { loadAll().catch(() => {}) }, [loadAll])

  const ensureRecipeLinesLoaded = useCallback(async (ids: string[]) => {
    const need = ids.filter(id => !recipeLinesCache[id] && !loadingLinesRef.current.has(id))
    if (!need.length) return
    for (const id of need) loadingLinesRef.current.add(id)
    try {
      const { data, error } = await supabase.from('recipe_lines').select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title').in('recipe_id', need).order('position', { ascending: true })
      if (error) throw error
      const grouped: Record<string, Line[]> = {}
      for (const row of (data ?? []) as any[]) { const rid = row.recipe_id; if (!grouped[rid]) grouped[rid] = []; grouped[rid].push(row as Line) }
      if (mountedRef.current) setRecipeLinesCache(prev => ({ ...prev, ...grouped }))
    } finally { for (const id of need) loadingLinesRef.current.delete(id) }
  }, [recipeLinesCache])

  useEffect(() => {
    if (loading || !sortedRecipes.length) return
    const visible = sortedRecipes.slice(0, 50)
    ensureRecipeLinesLoaded(visible.map(r => r.id)).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id; const hit = nextCache[rid]
      if (hit && now - hit.at < CACHE_TTL.COST) continue
      if (!recipeLinesCache[rid]) continue

      const lines = recipeLinesCache[rid] || []
      let totalCost = 0; const warnings: string[] = []

      for (const l of lines) {
        if (l.line_type === 'group' || l.line_type === 'subrecipe') continue
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        if (!ing) continue

        const unitCost = toNum(ing.net_unit_cost, 0)
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Missing price')

        const netQty = Math.max(0, toNum(l.qty, 0))
        const packUnit = ing.pack_unit || l.unit
        const qtyInPack = convertQtyToPackUnit(netQty, l.unit, packUnit)
        totalCost += qtyInPack * unitCost
      }

      const portionsN = Math.max(1, toNum(r.portions, 1))
      const cpp = portionsN > 0 ? totalCost / portionsN : 0
      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell - cpp

      nextCache[rid] = { at: now, totalCost, cpp, fcPct, margin, marginPct: sell > 0 ? (margin / sell) * 100 : null, profit: margin, warnings }
      changed = true
    }

    if (changed && mountedRef.current) { setCostCache(nextCache); CacheManager.set(CACHE_KEYS.COST_CACHE, nextCache) }
  }, [loading, sortedRecipes, recipeLinesCache, ingById, costCache, ensureRecipeLinesLoaded])

  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }

  const createNewRecipe = useCallback(async () => {
    if (mountedRef.current) setErr(null)
    try {
      if (!k.kitchenId) throw new Error('Kitchen not ready.')
      const payload = { kitchen_id: k.kitchenId, name: 'New Recipe', category: null, portions: 4, is_subrecipe: false, is_archived: false, is_featured: false, is_favorite: false, description: '', photo_url: null, preparation_time: 30, cooking_time: 20, difficulty: 'medium', tags: [], version: 1 }

      const { data, error } = await supabase.from('recipes').insert(payload as any).select('id').single()
      if (error) throw error
      const id = (data as any)?.id as string
      showToast('success', 'Recipe created!')
      CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      setTimeout(() => nav(`/recipe?id=${encodeURIComponent(id)}`), 400)
    } catch (e: any) { if (mountedRef.current) { setErr(e?.message || 'Failed'); showToast('error', e?.message || 'Failed') } }
  }, [k.kitchenId, nav])

  const toggleArchive = useCallback(async (r: RecipeRow) => {
    try { const next = !r.is_archived; const { error } = await supabase.from('recipes').update({ is_archived: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_archived: next } : x)); showToast('success', next ? 'Archived' : 'Restored') } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])
  
  const toggleFeatured = useCallback(async (r: RecipeRow) => {
    try { const next = !r.is_featured; const { error } = await supabase.from('recipes').update({ is_featured: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_featured: next } : x)); showToast('success', next ? 'Featured' : 'Unfeatured') } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])
  
  const toggleFavorite = useCallback(async (r: RecipeRow) => {
    try { const next = !r.is_favorite; const { error } = await supabase.from('recipes').update({ is_favorite: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x)); showToast('success', next ? 'Favorited' : 'Unfavorited') } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])

  const toggleSelect = useCallback((id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] })), [])
  const clearSelection = useCallback(() => setSelected({}), [])
  const selectAll = useCallback(() => { const newSelected: Record<string, boolean> = {}; sortedRecipes.forEach(r => { newSelected[r.id] = true }); setSelected(newSelected) }, [sortedRecipes])

  const bulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return; if (!window.confirm(`Archive ${selectedIds.length} recipes?`)) return
    try { const { error } = await supabase.from('recipes').update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', selectedIds); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, is_archived: true } : r)); setSelected({}); showToast('success', `${selectedIds.length} archived`) } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [selectedIds])

  const bulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return; if (!window.confirm(`Delete ${selectedIds.length} recipes permanently?`)) return
    try { await supabase.from('recipe_lines').delete().in('recipe_id', selectedIds); const { error: rErr } = await supabase.from('recipes').delete().in('id', selectedIds); if (rErr) throw rErr; if (mountedRef.current) { setRecipes(prev => prev.filter(r => !selectedIds.includes(r.id))); setRecipeLinesCache(prev => { const next = { ...prev }; selectedIds.forEach(id => delete next[id]); return next }); setSelected({}); showToast('success', `${selectedIds.length} deleted`); CacheManager.clear(CACHE_KEYS.RECIPES_CACHE) } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [selectedIds])

  const deleteOneRecipe = useCallback(async (recipeId: string) => {
    if (!window.confirm('Delete this recipe?')) return
    try { await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId); const { error: rErr } = await supabase.from('recipes').delete().eq('id', recipeId); if (rErr) throw rErr; if (mountedRef.current) { setRecipes(prev => prev.filter(r => r.id !== recipeId)); setRecipeLinesCache(prev => { const next = { ...prev }; delete next[recipeId]; return next }); setSelected(prev => { const next = { ...prev }; delete next[recipeId]; return next }); showToast('success', 'Deleted'); CacheManager.clear(CACHE_KEYS.RECIPES_CACHE) } } catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])

  // ===== Render Functions =====
  const renderGridView = () => (
    <div className="db-grid">
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase();
          const portions = toNum(r.portions, 1); const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0);
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, delay: index * 0.02 }} layout>
              <div className="db-card">
                <div className="db-card-header">
                  <div>
                    {r.code && <span className="db-code-badge">{formatRecipeCode(r.code)}</span>}
                  </div>
                  <div className="db-card-badges">
                    {r.is_favorite && <span className="db-mini-badge is-favorite">♥</span>}
                    {r.is_featured && <span className="db-mini-badge is-featured">★</span>}
                  </div>
                </div>
                <div className="db-card-body">
                  <h3 className="db-card-title">{r.name}</h3>
                  <div className="db-card-category">{r.category || 'Uncategorized'} {r.is_archived && '• Archived'}</div>
                  {r.description && <p className="db-card-desc">{r.description}</p>}
                  
                  <div className="db-card-stats">
                    <div className="db-stat-item">
                      <span className="db-stat-item-value">{c ? formatCurrency(c.cpp, cur) : '—'}</span>
                      <span className="db-stat-item-label">Cost</span>
                    </div>
                    <div className="db-stat-item">
                      <span className="db-stat-item-value">{c?.fcPct != null ? `${c.fcPct.toFixed(0)}%` : '—'}</span>
                      <span className="db-stat-item-label">FC%</span>
                    </div>
                    <div className="db-stat-item">
                      <span className="db-stat-item-value">{formatTime(totalTime)}</span>
                      <span className="db-stat-item-label">Time</span>
                    </div>
                  </div>
                </div>
                <div className="db-card-footer">
                  <div className="db-price">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div>
                  <div className="db-actions">
                    <button className="db-action-btn" onClick={() => toggleFavorite(r)} title="Favorite">{r.is_favorite ? '♥' : '♡'}</button>
                    <button className="db-action-btn" onClick={() => toggleFeatured(r)} title="Featured">{r.is_featured ? '★' : '☆'}</button>
                    <button className="db-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                    <button className="db-action-btn danger" onClick={() => deleteOneRecipe(r.id)}>✕</button>
                    <input type="checkbox" className="db-checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )

  const renderListView = () => (
    <div className="db-list">
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase(); const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0);
          return (
            <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15, delay: index * 0.01 }} layout>
              <div className="db-list-item">
                <div className="db-list-code">{formatRecipeCode(r.code) || '—'}</div>
                <div className="db-list-content">
                  <div className="db-list-title">{r.name}</div>
                  <div className="db-list-meta">{r.category || '—'} • {portions} portions • {formatTime(totalTime)}</div>
                </div>
                <div className="db-list-stats">
                  <div><div className="db-list-stat-label">Cost</div><div className="db-list-stat-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div></div>
                  <div><div className="db-list-stat-label">Price</div><div className="db-list-stat-value">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div></div>
                </div>
                <div className="db-actions">
                  <button className="db-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                  <input type="checkbox" className="db-checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} />
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )

  const renderTableView = () => (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead><tr><th><input type="checkbox" className="db-checkbox" onChange={(e) => e.target.checked ? selectAll() : clearSelection()} /></th><th>Code</th><th>Name</th><th>Category</th><th>Portions</th><th>Cost</th><th>Price</th><th>FC%</th><th></th></tr></thead>
        <tbody>
          {sortedRecipes.map(r => {
            const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase();
            return (
              <tr key={r.id}>
                <td><input type="checkbox" className="db-checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)} /></td>
                <td><span className="db-table-code">{formatRecipeCode(r.code)}</span></td>
                <td><strong>{r.name}</strong></td>
                <td>{r.category || '—'}</td>
                <td>{r.portions}</td>
                <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
                <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
                <td>{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</td>
                <td><button className="db-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <DashboardStyles />
      <div className="db-app">
        <div className="db-container">
          {/* Header */}
          <header className="db-header">
            <div>
              <h1 className="db-header-title">Recipes</h1>
              <p className="db-header-subtitle">{stats.active} active recipes</p>
            </div>
            <div className="db-header-actions">
              <button className="db-btn db-btn-secondary" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide Archived' : 'Show Archived'}</button>
              <button className="db-btn db-btn-primary" onClick={createNewRecipe}>+ New Recipe</button>
            </div>
          </header>

          {/* Stats */}
          <div className="db-stats">
            <div className="db-stat-card">
              <div className="db-stat-label">Total Recipes</div>
              <div className="db-stat-value">{stats.total}</div>
              <div className="db-stat-change positive">↑ {stats.active} active</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">Featured</div>
              <div className="db-stat-value">{stats.featured}</div>
              <div className="db-stat-change">{stats.favorites} favorites</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">Avg Cost</div>
              <div className="db-stat-value">{formatCurrency(stats.avgCost)}</div>
              <div className="db-stat-change">per portion</div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-label">Avg Margin</div>
              <div className="db-stat-value">{formatPercentage(stats.avgMargin)}</div>
              <div className="db-stat-change negative">↓ {stats.archived} archived</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="db-toolbar">
            <div className="db-search">
              <svg className="db-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input className="db-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes..." />
              {q && <button className="db-clear-btn" onClick={() => setQ('')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>}
            </div>
            <div className="db-view-toggle">
              <button className={`db-view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>Grid</button>
              <button className={`db-view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>List</button>
              <button className={`db-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>Table</button>
            </div>
          </div>

          {/* Controls */}
          <div className="db-controls">
            <div className="db-control-group">
              <select className="db-select" value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                <option value="name">Sort: Name</option>
                <option value="code">Sort: Code</option>
                <option value="price">Sort: Price</option>
                <option value="cost">Sort: Cost</option>
              </select>
              <button className="db-btn db-btn-ghost" onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}>{sortOrder === 'asc' ? '↑' : '↓'}</button>
            </div>
            
            <div className="db-control-group">
              <span className="db-results-text"><strong>{sortedRecipes.length}</strong> recipes</span>
              {selectedIds.length > 0 && (
                <>
                  <button className="db-btn db-btn-secondary" onClick={bulkArchive}>Archive ({selectedIds.length})</button>
                  <button className="db-btn db-btn-secondary" style={{color: '#EF4444'}} onClick={bulkDelete}>Delete</button>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="db-loading"><div className="db-spinner" /><div className="db-loading-text">Loading recipes...</div></div>
          ) : !sortedRecipes.length ? (
            <div className="db-empty">
              <div className="db-empty-title">No recipes found</div>
              <div className="db-empty-text">Get started by creating your first recipe.</div>
              <button className="db-btn db-btn-primary" onClick={createNewRecipe}>Create Recipe</button>
            </div>
          ) : (
            <>
              {viewMode === 'grid' && renderGridView()}
              {viewMode === 'list' && renderListView()}
              {viewMode === 'table' && renderTableView()}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div className={`db-toast ${toast.type}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="db-toast-icon">{toast.type === 'success' ? '✓' : '!'}</span>
            <span>{toast.message}</span>
            <button className="db-toast-close" onClick={() => setToast(null)}>×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
