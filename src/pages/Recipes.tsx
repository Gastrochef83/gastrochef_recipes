// src/pages/recipes.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { useKitchen } from '../lib/kitchen'
import Button from '../components/ui/Button'
import EmptyState from '../components/EmptyState'
import { motion, AnimatePresence, Reorder } from 'framer-motion'

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
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function getDifficultyConfig(difficulty: string | null): { color: string; bg: string; label: string } {
  switch (difficulty) {
    case 'easy': return { color: '#059669', bg: '#ECFDF5', label: 'Easy' }
    case 'medium': return { color: '#D97706', bg: '#FFFBEB', label: 'Medium' }
    case 'hard': return { color: '#DC2626', bg: '#FEF2F2', label: 'Hard' }
    default: return { color: '#6B7280', bg: '#F9FAFB', label: '—' }
  }
}

function formatRecipeCode(code: string | null | undefined): string {
  if (!code) return '—'
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
    } catch {
      return null
    }
  }

  static set(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
    } catch {}
  }

  static clear(pattern: string): void {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(pattern)) localStorage.removeItem(key)
      })
    } catch {}
  }
}

// ==================== Custom Hooks ====================
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = (value: T) => {
    try {
      setStoredValue(value)
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }

  return [storedValue, setValue]
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// ==================== Styles Component ====================
function RecipesStyles() {
  return (
    <style>{`
      /* ===== Chef Pro Design System ===== */
      .rp {
        --rp-bg: #F8FAFC;
        --rp-bg-card: #FFFFFF;
        --rp-bg-elevated: #FFFFFF;
        --rp-bg-hover: #F1F5F9;
        --rp-border: #E2E8F0;
        --rp-border-focus: #94A3B8;
        --rp-text: #0F172A;
        --rp-text-secondary: #475569;
        --rp-text-muted: #94A3B8;
        --rp-primary: #0EA5E9;
        --rp-primary-dark: #0284C7;
        --rp-primary-light: #E0F2FE;
        --rp-secondary: #8B5CF6;
        --rp-secondary-light: #EDE9FE;
        --rp-success: #10B981;
        --rp-success-light: #D1FAE5;
        --rp-warning: #F59E0B;
        --rp-warning-light: #FEF3C7;
        --rp-danger: #EF4444;
        --rp-danger-light: #FEE2E2;
        --rp-code-bg: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
        --rp-code-text: #FFFFFF;
        --rp-shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
        --rp-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
        --rp-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
        --rp-shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        --rp-radius: 8px;
        --rp-radius-lg: 16px;
        --rp-radius-xl: 24px;
        --rp-radius-full: 9999px;
        --rp-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        --rp-font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
        
        min-height: 100vh;
        background: var(--rp-bg);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
        color: var(--rp-text);
      }

      /* ===== Container ===== */
      .rp-container {
        max-width: 1440px;
        margin: 0 auto;
        padding: 24px;
      }

      @media (max-width: 768px) {
        .rp-container { padding: 16px; }
      }

      /* ===== Page Header ===== */
      .rp-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 32px;
        flex-wrap: wrap;
      }

      .rp-header-left {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .rp-header-icon {
        width: 56px;
        height: 56px;
        border-radius: var(--rp-radius-lg);
        background: linear-gradient(135deg, var(--rp-primary) 0%, var(--rp-primary-dark) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
        box-shadow: var(--rp-shadow-lg);
        flex-shrink: 0;
      }

      .rp-header-info h1 {
        font-size: 28px;
        font-weight: 800;
        color: var(--rp-text);
        margin: 0 0 4px;
        letter-spacing: -0.02em;
      }

      .rp-header-info p {
        font-size: 14px;
        color: var(--rp-text-secondary);
        margin: 0;
      }

      .rp-header-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .rp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 40px;
        padding: 0 20px;
        border-radius: var(--rp-radius-full);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--rp-transition);
        border: none;
        white-space: nowrap;
      }

      .rp-btn-primary {
        background: linear-gradient(135deg, var(--rp-primary) 0%, var(--rp-primary-dark) 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
      }

      .rp-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4);
      }

      .rp-btn-secondary {
        background: var(--rp-bg-card);
        color: var(--rp-text);
        border: 1px solid var(--rp-border);
      }

      .rp-btn-secondary:hover {
        border-color: var(--rp-primary);
        color: var(--rp-primary-dark);
      }

      .rp-btn-ghost {
        background: transparent;
        color: var(--rp-text-secondary);
        padding: 0 12px;
      }

      .rp-btn-ghost:hover {
        background: var(--rp-bg-hover);
        color: var(--rp-text);
      }

      .rp-btn-icon {
        width: 40px;
        padding: 0;
      }

      /* ===== Stats Row ===== */
      .rp-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      @media (max-width: 1024px) {
        .rp-stats { grid-template-columns: repeat(2, 1fr); }
      }

      @media (max-width: 640px) {
        .rp-stats { grid-template-columns: 1fr; }
      }

      .rp-stat {
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-lg);
        border: 1px solid var(--rp-border);
        padding: 20px;
        position: relative;
        overflow: hidden;
        transition: var(--rp-transition);
      }

      .rp-stat:hover {
        border-color: var(--rp-primary);
        box-shadow: var(--rp-shadow);
      }

      .rp-stat::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--rp-primary), var(--rp-secondary));
        opacity: 0;
        transition: var(--rp-transition);
      }

      .rp-stat:hover::before {
        opacity: 1;
      }

      .rp-stat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .rp-stat-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--rp-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .rp-stat-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--rp-radius);
        background: var(--rp-primary-light);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--rp-primary-dark);
      }

      .rp-stat-value {
        font-size: 32px;
        font-weight: 800;
        color: var(--rp-text);
        line-height: 1;
        margin-bottom: 4px;
      }

      .rp-stat-change {
        font-size: 12px;
        color: var(--rp-text-secondary);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .rp-stat-change.up { color: var(--rp-success); }
      .rp-stat-change.down { color: var(--rp-danger); }

      /* ===== Toolbar ===== */
      .rp-toolbar {
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-xl);
        border: 1px solid var(--rp-border);
        padding: 12px 16px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        box-shadow: var(--rp-shadow-sm);
      }

      .rp-search {
        flex: 1;
        min-width: 200px;
        position: relative;
      }

      .rp-search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--rp-text-muted);
        pointer-events: none;
      }

      .rp-search-input {
        width: 100%;
        height: 40px;
        padding: 0 40px 0 42px;
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius-full);
        background: var(--rp-bg);
        font-size: 14px;
        color: var(--rp-text);
        transition: var(--rp-transition);
      }

      .rp-search-input:focus {
        outline: none;
        border-color: var(--rp-primary);
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
      }

      .rp-search-clear {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: var(--rp-bg-hover);
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--rp-text-muted);
        transition: var(--rp-transition);
      }

      .rp-search-clear:hover {
        background: var(--rp-danger-light);
        color: var(--rp-danger);
      }

      .rp-toolbar-group {
        display: flex;
        align-items: center;
        gap: 4px;
        background: var(--rp-bg);
        padding: 4px;
        border-radius: var(--rp-radius-full);
      }

      .rp-toolbar-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 14px;
        border: none;
        border-radius: var(--rp-radius-full);
        background: transparent;
        color: var(--rp-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--rp-transition);
      }

      .rp-toolbar-btn:hover {
        background: var(--rp-bg-card);
        color: var(--rp-text);
      }

      .rp-toolbar-btn.active {
        background: var(--rp-bg-card);
        color: var(--rp-primary-dark);
        box-shadow: var(--rp-shadow-sm);
      }

      /* ===== Filter Bar ===== */
      .rp-filters {
        background: var(--rp-bg-card);
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius-lg);
        padding: 16px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        animation: rp-slide 0.2s ease;
      }

      @keyframes rp-slide {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .rp-filter-group {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-right: 16px;
        border-right: 1px solid var(--rp-border);
      }

      .rp-filter-group:last-child { border-right: none; padding-right: 0; }

      .rp-filter-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--rp-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .rp-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: var(--rp-radius-full);
        border: 1px solid var(--rp-border);
        background: var(--rp-bg-card);
        font-size: 12px;
        font-weight: 600;
        color: var(--rp-text-secondary);
        cursor: pointer;
        transition: var(--rp-transition);
      }

      .rp-chip:hover {
        border-color: var(--rp-primary);
        color: var(--rp-primary-dark);
      }

      .rp-chip.active {
        background: var(--rp-primary);
        border-color: var(--rp-primary);
        color: white;
      }

      /* ===== Sort Row ===== */
      .rp-sort-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }

      .rp-sort-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .rp-sort-label {
        font-size: 13px;
        color: var(--rp-text-secondary);
      }

      .rp-sort-select {
        padding: 8px 32px 8px 12px;
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius);
        background: var(--rp-bg-card);
        font-size: 13px;
        font-weight: 600;
        color: var(--rp-text);
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
      }

      .rp-sort-btn {
        width: 32px;
        height: 32px;
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius);
        background: var(--rp-bg-card);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--rp-text-secondary);
        transition: var(--rp-transition);
      }

      .rp-sort-btn:hover {
        border-color: var(--rp-primary);
        color: var(--rp-primary-dark);
      }

      .rp-results-count {
        font-size: 13px;
        color: var(--rp-text-secondary);
      }

      .rp-results-count strong {
        color: var(--rp-text);
        font-weight: 700;
      }

      .rp-bulk-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .rp-bulk-btn {
        padding: 6px 12px;
        border-radius: var(--rp-radius);
        border: 1px solid var(--rp-border);
        background: var(--rp-bg-card);
        font-size: 12px;
        font-weight: 600;
        color: var(--rp-text-secondary);
        cursor: pointer;
        transition: var(--rp-transition);
      }

      .rp-bulk-btn:hover {
        background: var(--rp-bg-hover);
      }

      .rp-bulk-btn.danger:hover {
        background: var(--rp-danger);
        border-color: var(--rp-danger);
        color: white;
      }

      /* ===== Grid View ===== */
      .rp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 20px;
      }

      .rp-grid.dense {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }

      .rp-grid.compact {
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
      }

      /* ===== Recipe Card ===== */
      .rp-card {
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-xl);
        border: 1px solid var(--rp-border);
        overflow: hidden;
        transition: var(--rp-transition);
        position: relative;
      }

      .rp-card:hover {
        border-color: var(--rp-primary);
        box-shadow: var(--rp-shadow-lg);
        transform: translateY(-2px);
      }

      /* Code Header Strip */
      .rp-card-code-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
        position: relative;
      }

      .rp-card-code-badge {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .rp-card-code-main {
        font-family: var(--rp-font-mono);
        font-size: 13px;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--rp-primary) 0%, var(--rp-secondary) 100%);
        padding: 4px 10px;
        border-radius: 6px;
        letter-spacing: 0.03em;
      }

      .rp-card-code-category {
        font-size: 10px;
        font-weight: 700;
        color: rgba(255,255,255,0.6);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .rp-card-flags {
        display: flex;
        gap: 4px;
      }

      .rp-card-flag {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        background: rgba(255,255,255,0.1);
        color: white;
      }

      .rp-card-flag.favorite { background: #EF4444; }
      .rp-card-flag.featured { background: #F59E0B; }
      .rp-card-flag.subrecipe { background: #8B5CF6; }

      .rp-card-body {
        padding: 16px;
      }

      .rp-card-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--rp-text);
        margin: 0 0 4px;
        line-height: 1.3;
      }

      .rp-card-category {
        font-size: 13px;
        color: var(--rp-text-secondary);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rp-card-desc {
        font-size: 13px;
        color: var(--rp-text-secondary);
        line-height: 1.5;
        margin-bottom: 12px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .rp-card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 16px;
      }

      .rp-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        background: var(--rp-bg);
        border-radius: var(--rp-radius-full);
        color: var(--rp-text-secondary);
      }

      .rp-card-meta {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .rp-meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--rp-text-secondary);
      }

      .rp-meta-icon {
        color: var(--rp-text-muted);
      }

      .rp-card-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--rp-border);
        margin-bottom: 16px;
      }

      .rp-metric {
        text-align: center;
        padding: 12px 8px;
        background: var(--rp-bg);
        border-radius: var(--rp-radius);
      }

      .rp-metric-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--rp-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }

      .rp-metric-value {
        font-size: 16px;
        font-weight: 800;
        color: var(--rp-text);
      }

      .rp-metric-value.warning { color: var(--rp-danger); }
      .rp-metric-value.success { color: var(--rp-success); }

      .rp-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .rp-card-price {
        font-size: 20px;
        font-weight: 800;
        color: var(--rp-primary-dark);
      }

      .rp-card-actions {
        display: flex;
        gap: 6px;
      }

      .rp-action-btn {
        width: 36px;
        height: 36px;
        border-radius: var(--rp-radius);
        border: 1px solid var(--rp-border);
        background: var(--rp-bg-card);
        color: var(--rp-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--rp-transition);
      }

      .rp-action-btn:hover {
        border-color: var(--rp-primary);
        color: var(--rp-primary-dark);
        background: var(--rp-primary-light);
      }

      .rp-action-btn.danger:hover {
        border-color: var(--rp-danger);
        color: var(--rp-danger);
        background: var(--rp-danger-light);
      }

      .rp-action-btn.active {
        background: var(--rp-primary);
        border-color: var(--rp-primary);
        color: white;
      }

      .rp-select-check {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: var(--rp-radius);
        border: 1px dashed var(--rp-border);
        cursor: pointer;
        font-size: 12px;
        color: var(--rp-text-secondary);
      }

      .rp-select-check input {
        width: 16px;
        height: 16px;
        accent-color: var(--rp-primary);
      }

      /* ===== List View ===== */
      .rp-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .rp-list-item {
        background: var(--rp-bg-card);
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius-lg);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        transition: var(--rp-transition);
      }

      .rp-list-item:hover {
        border-color: var(--rp-primary);
        background: var(--rp-bg-hover);
      }

      .rp-list-code {
        font-family: var(--rp-font-mono);
        font-size: 12px;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--rp-primary) 0%, var(--rp-primary-dark) 100%);
        padding: 6px 12px;
        border-radius: 8px;
        min-width: 80px;
        text-align: center;
        flex-shrink: 0;
      }

      .rp-list-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--rp-radius);
        background: linear-gradient(135deg, var(--rp-primary-light), var(--rp-secondary-light));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
      }

      .rp-list-content {
        flex: 1;
        min-width: 0;
      }

      .rp-list-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--rp-text);
        margin-bottom: 4px;
      }

      .rp-list-meta {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: var(--rp-text-secondary);
      }

      .rp-list-stats {
        display: flex;
        align-items: center;
        gap: 24px;
        flex-shrink: 0;
      }

      .rp-list-stat {
        text-align: center;
      }

      .rp-list-stat-label {
        font-size: 10px;
        color: var(--rp-text-muted);
        text-transform: uppercase;
      }

      .rp-list-stat-value {
        font-size: 14px;
        font-weight: 700;
        color: var(--rp-text);
      }

      /* ===== Table View ===== */
      .rp-table-wrap {
        background: var(--rp-bg-card);
        border: 1px solid var(--rp-border);
        border-radius: var(--rp-radius-lg);
        overflow: hidden;
      }

      .rp-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .rp-table th {
        background: var(--rp-bg);
        padding: 12px 16px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        color: var(--rp-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--rp-border);
      }

      .rp-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--rp-border);
        color: var(--rp-text-secondary);
        vertical-align: middle;
      }

      .rp-table tr:hover td {
        background: var(--rp-bg-hover);
      }

      .rp-table tr:last-child td {
        border-bottom: none;
      }

      .rp-table-code {
        font-family: var(--rp-font-mono);
        font-size: 12px;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--rp-primary) 0%, var(--rp-primary-dark) 100%);
        padding: 4px 10px;
        border-radius: 6px;
        display: inline-block;
      }

      .rp-table-name {
        font-weight: 700;
        color: var(--rp-text);
      }

      .rp-table-cat {
        font-size: 12px;
        color: var(--rp-text-muted);
      }

      .rp-table-actions {
        display: flex;
        gap: 4px;
      }

      /* ===== Empty State ===== */
      .rp-empty {
        text-align: center;
        padding: 80px 40px;
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-xl);
        border: 1px solid var(--rp-border);
      }

      .rp-empty-icon {
        font-size: 64px;
        margin-bottom: 20px;
        opacity: 0.5;
      }

      .rp-empty-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--rp-text);
        margin-bottom: 8px;
      }

      .rp-empty-text {
        font-size: 14px;
        color: var(--rp-text-secondary);
        margin-bottom: 24px;
      }

      .rp-empty-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
      }

      /* ===== Loading ===== */
      .rp-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-xl);
        border: 1px solid var(--rp-border);
      }

      .rp-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--rp-border);
        border-top-color: var(--rp-primary);
        border-radius: 50%;
        animation: rp-spin 0.8s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes rp-spin {
        to { transform: rotate(360deg); }
      }

      .rp-loading-text {
        font-size: 14px;
        color: var(--rp-text-secondary);
      }

      /* ===== Error ===== */
      .rp-error {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--rp-danger-light);
        border: 1px solid var(--rp-danger);
        border-radius: var(--rp-radius-lg);
        margin-bottom: 20px;
        color: var(--rp-danger);
        font-size: 14px;
        font-weight: 600;
      }

      .rp-error-close {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--rp-danger);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--rp-radius);
      }

      .rp-error-close:hover {
        background: rgba(239, 68, 68, 0.2);
      }

      /* ===== Toast ===== */
      .rp-toast-wrap {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
      }

      .rp-toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: var(--rp-bg-card);
        border-radius: var(--rp-radius-lg);
        box-shadow: var(--rp-shadow-xl);
        border-left: 4px solid var(--rp-primary);
        animation: rp-toast-in 0.3s ease;
        max-width: 360px;
      }

      @keyframes rp-toast-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      .rp-toast.success { border-left-color: var(--rp-success); }
      .rp-toast.error { border-left-color: var(--rp-danger); }

      .rp-toast-icon {
        font-size: 18px;
      }

      .rp-toast-msg {
        flex: 1;
        font-size: 14px;
        color: var(--rp-text);
      }

      .rp-toast-close {
        background: none;
        border: none;
        color: var(--rp-text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--rp-radius);
      }

      .rp-toast-close:hover {
        background: var(--rp-bg-hover);
      }

      /* ===== Responsive ===== */
      @media (max-width: 768px) {
        .rp-header {
          flex-direction: column;
          align-items: stretch;
        }

        .rp-header-left {
          flex-direction: column;
          align-items: flex-start;
        }

        .rp-toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .rp-search {
          width: 100%;
        }

        .rp-sort-row {
          flex-direction: column;
          align-items: stretch;
        }

        .rp-grid {
          grid-template-columns: 1fr !important;
        }

        .rp-list-item {
          flex-direction: column;
          align-items: stretch;
        }

        .rp-list-stats {
          flex-wrap: wrap;
        }
      }

      /* ===== Scrollbar ===== */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: var(--rp-bg);
      }

      ::-webkit-scrollbar-thumb {
        background: var(--rp-border);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--rp-text-muted);
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

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const loadingLinesRef = useRef<Set<string>>(new Set())
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => 
    CacheManager.get(CACHE_KEYS.COST_CACHE, CACHE_TTL.COST) || {}
  )

  const [density, setDensity] = useLocalStorage<Density>('gc:density', 'comfortable')
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('gc:view:mode', 'grid')
  const [sortField, setSortField] = useLocalStorage<SortField>('gc:sort:field', 'name')
  const [sortOrder, setSortOrder] = useLocalStorage<SortOrder>('gc:sort:order', 'asc')
  const [filters, setFilters] = useLocalStorage<FilterType>('gc:filters', {
    categories: [],
    cuisines: [],
    difficulty: [],
    isFeatured: null,
    isFavorite: null,
    isSubrecipe: null
  })

  const debouncedQ = useDebounce(q, 300)

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const filteredRecipes = useMemo(() => {
    let list = recipes

    if (debouncedQ) {
      const query = debouncedQ.toLowerCase()
      list = list.filter(r => 
        r.name.toLowerCase().includes(query) ||
        r.code?.toLowerCase().includes(query) ||
        r.category?.toLowerCase().includes(query) ||
        r.cuisine?.toLowerCase().includes(query) ||
        r.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    if (!showArchived) {
      list = list.filter(r => !r.is_archived)
    }

    if (filters.categories.length > 0) {
      list = list.filter(r => r.category && filters.categories.includes(r.category))
    }

    return list
  }, [recipes, debouncedQ, showArchived, filters])

  const sortedRecipes = useMemo(() => {
    return [...filteredRecipes].sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'code':
          comparison = (a.code || '').localeCompare(b.code || '')
          break
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '')
          break
        case 'price':
          comparison = (a.selling_price || 0) - (b.selling_price || 0)
          break
        case 'cost':
          comparison = (costCache[a.id]?.totalCost || 0) - (costCache[b.id]?.totalCost || 0)
          break
        case 'margin':
          comparison = (costCache[a.id]?.margin || 0) - (costCache[b.id]?.margin || 0)
          break
        case 'date':
          comparison = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          break
        default:
          comparison = 0
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredRecipes, sortField, sortOrder, costCache])

  const selectedIds = useMemo(
    () => Object.keys(selected).filter(key => selected[key]),
    [selected]
  )

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
        
        if (cachedRecipes && cachedIngredients) {
          setRecipes(cachedRecipes)
          setIngredients(cachedIngredients)
          setLoading(false)
          return
        }
      }

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select('id,code,code_category,kitchen_id,name,category,cuisine,portions,yield_qty,yield_unit,is_subrecipe,is_archived,is_featured,is_favorite,photo_url,description,preparation_time,cooking_time,difficulty,tags,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct,created_at,updated_at,version')
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (rErr) throw rErr
      
      const recipesData = (r ?? []) as RecipeRow[]
      if (mountedRef.current) {
        setRecipes(recipesData)
        CacheManager.set(CACHE_KEYS.RECIPES_CACHE, recipesData)
      }

      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active,category')
        .order('name', { ascending: true })

      if (iErr) throw iErr
      
      const ingredientsData = (i ?? []) as Ingredient[]
      if (mountedRef.current) {
        setIngredients(ingredientsData)
        CacheManager.set(CACHE_KEYS.INGREDIENTS_REV, ingredientsData)
      }
      
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to load recipes')
        setToast({ type: 'error', message: e?.message || 'Failed to load recipes' })
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  const ensureRecipeLinesLoaded = useCallback(async (ids: string[]) => {
    const need = ids.filter(id => !recipeLinesCache[id] && !loadingLinesRef.current.has(id))
    if (!need.length) return

    for (const id of need) loadingLinesRef.current.add(id)

    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title')
        .in('recipe_id', need)
        .order('position', { ascending: true })

      if (error) throw error

      const grouped: Record<string, Line[]> = {}
      for (const row of (data ?? []) as any[]) {
        const rid = row.recipe_id
        if (!grouped[rid]) grouped[rid] = []
        grouped[rid].push(row as Line)
      }

      if (mountedRef.current) {
        setRecipeLinesCache(prev => ({ ...prev, ...grouped }))
      }
    } finally {
      for (const id of need) loadingLinesRef.current.delete(id)
    }
  }, [recipeLinesCache])

  useEffect(() => {
    if (loading || !sortedRecipes.length) return

    const visible = sortedRecipes.slice(0, 50)
    ensureRecipeLinesLoaded(visible.map(r => r.id)).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id
      const hit = nextCache[rid]
      if (hit && now - hit.at < CACHE_TTL.COST) continue
      if (!recipeLinesCache[rid]) continue

      const lines = recipeLinesCache[rid] || []
      let totalCost = 0
      const warnings: string[] = []

      for (const l of lines) {
        if (l.line_type === 'group' || l.line_type === 'subrecipe') continue
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        if (!ing) continue

        const unitCost = toNum(ing.net_unit_cost, 0)
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')

        const netQty = Math.max(0, toNum(l.qty, 0))
        const packUnit = ing.pack_unit || l.unit
        const qtyInPack = convertQtyToPackUnit(netQty, l.unit, packUnit)
        const lineCost = qtyInPack * unitCost
        totalCost += Number.isFinite(lineCost) ? lineCost : 0
      }
      
      const portionsN = Math.max(1, toNum(r.portions, 1))
      const cpp = portionsN > 0 ? totalCost / portionsN : 0
      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell - cpp
      const marginPct = sell > 0 ? (margin / sell) * 100 : null

      nextCache[rid] = { at: now, totalCost, cpp, fcPct, margin, marginPct, profit: margin, warnings }
      changed = true
    }

    if (changed && mountedRef.current) {
      setCostCache(nextCache)
      CacheManager.set(CACHE_KEYS.COST_CACHE, nextCache)
    }
  }, [loading, sortedRecipes, recipeLinesCache, ingById, costCache, ensureRecipeLinesLoaded])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const createNewRecipe = useCallback(async () => {
    if (mountedRef.current) setErr(null)

    try {
      if (!k.kitchenId) {
        throw new Error('Kitchen not ready yet.')
      }

      const payload = {
        kitchen_id: k.kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 4,
        is_subrecipe: false,
        is_archived: false,
        is_featured: false,
        is_favorite: false,
        description: '',
        photo_url: null,
        preparation_time: 30,
        cooking_time: 20,
        difficulty: 'medium',
        tags: [],
        version: 1
      }

      const { data, error } = await supabase
        .from('recipes')
        .insert(payload as any)
        .select('id')
        .single()

      if (error) throw error

      const id = (data as any)?.id as string
      showToast('success', 'Recipe created!')
      
      CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      
      setTimeout(() => nav(`/recipe?id=${encodeURIComponent(id)}`), 400)
      
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to create recipe')
        showToast('error', e?.message || 'Failed to create recipe')
      }
    }
  }, [k.kitchenId, nav])

  const toggleArchive = useCallback(async (r: RecipeRow) => {
    try {
      const next = !r.is_archived
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: next, updated_at: new Date().toISOString() })
        .eq('id', r.id)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_archived: next } : x))
        showToast('success', next ? 'Archived' : 'Restored')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [])

  const toggleFeatured = useCallback(async (r: RecipeRow) => {
    try {
      const next = !r.is_featured
      const { error } = await supabase
        .from('recipes')
        .update({ is_featured: next, updated_at: new Date().toISOString() })
        .eq('id', r.id)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_featured: next } : x))
        showToast('success', next ? 'Featured' : 'Unfeatured')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [])

  const toggleFavorite = useCallback(async (r: RecipeRow) => {
    try {
      const next = !r.is_favorite
      const { error } = await supabase
        .from('recipes')
        .update({ is_favorite: next, updated_at: new Date().toISOString() })
        .eq('id', r.id)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x))
        showToast('success', next ? 'Added to favorites' : 'Removed from favorites')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const clearSelection = useCallback(() => setSelected({}), [])

  const selectAll = useCallback(() => {
    const newSelected: Record<string, boolean> = {}
    sortedRecipes.forEach(r => { newSelected[r.id] = true })
    setSelected(newSelected)
  }, [sortedRecipes])

  const bulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return
    
    if (!window.confirm(`Archive ${selectedIds.length} recipes?`)) return

    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .in('id', selectedIds)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, is_archived: true } : r))
        setSelected({})
        showToast('success', `${selectedIds.length} archived`)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [selectedIds])

  const bulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    
    if (!window.confirm(`Delete ${selectedIds.length} recipes permanently?`)) return

    try {
      await supabase.from('recipe_lines').delete().in('recipe_id', selectedIds)
      const { error: rErr } = await supabase.from('recipes').delete().in('id', selectedIds)
      if (rErr) throw rErr

      if (mountedRef.current) {
        setRecipes(prev => prev.filter(r => !selectedIds.includes(r.id)))
        setRecipeLinesCache(prev => {
          const next = { ...prev }
          selectedIds.forEach(id => delete next[id])
          return next
        })
        setSelected({})
        showToast('success', `${selectedIds.length} deleted`)
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [selectedIds])

  const deleteOneRecipe = useCallback(async (recipeId: string) => {
    if (!window.confirm('Delete this recipe?')) return

    try {
      await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId)
      const { error: rErr } = await supabase.from('recipes').delete().eq('id', recipeId)
      if (rErr) throw rErr

      if (mountedRef.current) {
        setRecipes(prev => prev.filter(r => r.id !== recipeId))
        setRecipeLinesCache(prev => {
          const next = { ...prev }
          delete next[recipeId]
          return next
        })
        setSelected(prev => {
          const next = { ...prev }
          delete next[recipeId]
          return next
        })
        showToast('success', 'Deleted')
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [])

  // ===== Render Functions =====
  const renderGridView = () => (
    <div className={`rp-grid ${density}`}>
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const hasWarning = Boolean(c?.warnings?.length)
          const portions = toNum(r.portions, 1)
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)
          const diff = getDifficultyConfig(r.difficulty)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.02 }}
              layout
            >
              <div className="rp-card">
                {/* Code Strip */}
                <div className="rp-card-code-strip">
                  <div className="rp-card-code-badge">
                    <span className="rp-card-code-main">{formatRecipeCode(r.code)}</span>
                    {r.code_category && (
                      <span className="rp-card-code-category">{r.code_category}</span>
                    )}
                  </div>
                  <div className="rp-card-flags">
                    {r.is_favorite && <span className="rp-card-flag favorite" title="Favorite">♥</span>}
                    {r.is_featured && <span className="rp-card-flag featured" title="Featured">★</span>}
                    {r.is_subrecipe && <span className="rp-card-flag subrecipe" title="Subrecipe">◈</span>}
                  </div>
                </div>

                <div className="rp-card-body">
                  <h3 className="rp-card-title">{r.name}</h3>
                  <div className="rp-card-category">
                    <span>{r.category || 'Uncategorized'}</span>
                    {r.cuisine && <span>• {r.cuisine}</span>}
                    {r.is_archived && <span style={{ color: 'var(--rp-danger)' }}>• Archived</span>}
                  </div>

                  {r.description && (
                    <p className="rp-card-desc">{r.description}</p>
                  )}

                  {r.tags && r.tags.length > 0 && (
                    <div className="rp-card-tags">
                      {r.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="rp-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="rp-card-meta">
                    <span className="rp-meta-item">
                      <svg className="rp-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="4"/>
                        <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
                      </svg>
                      {portions} portions
                    </span>
                    <span className="rp-meta-item">
                      <svg className="rp-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {formatTime(totalTime)}
                    </span>
                  </div>

                  <div className="rp-card-metrics">
                    <div className="rp-metric">
                      <div className="rp-metric-label">Cost</div>
                      <div className="rp-metric-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div>
                    </div>
                    <div className="rp-metric">
                      <div className="rp-metric-label">FC%</div>
                      <div className={`rp-metric-value ${c?.fcPct && c.fcPct > 30 ? 'warning' : 'success'}`}>
                        {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="rp-metric">
                      <div className="rp-metric-label">Margin</div>
                      <div className="rp-metric-value">{c ? formatCurrency(c.margin, cur) : '—'}</div>
                    </div>
                  </div>

                  <div className="rp-card-footer">
                    <div className="rp-card-price">
                      {r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}
                    </div>
                    <div className="rp-card-actions">
                      <button
                        className={`rp-action-btn ${r.is_favorite ? 'active' : ''}`}
                        onClick={() => toggleFavorite(r)}
                        title={r.is_favorite ? 'Remove favorite' : 'Add favorite'}
                      >
                        {r.is_favorite ? '♥' : '♡'}
                      </button>
                      <button
                        className={`rp-action-btn ${r.is_featured ? 'active' : ''}`}
                        onClick={() => toggleFeatured(r)}
                        title={r.is_featured ? 'Unfeature' : 'Feature'}
                      >
                        {r.is_featured ? '★' : '☆'}
                      </button>
                      <button
                        className="rp-action-btn"
                        onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        className="rp-action-btn"
                        onClick={() => toggleArchive(r)}
                        title={r.is_archived ? 'Restore' : 'Archive'}
                      >
                        {r.is_archived ? '↩' : '-archive'}
                      </button>
                      <button
                        className="rp-action-btn danger"
                        onClick={() => deleteOneRecipe(r.id)}
                        title="Delete"
                      >
                        ✕
                      </button>
                      <label className="rp-select-check">
                        <input
                          type="checkbox"
                          checked={!!selected[r.id]}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </label>
                    </div>
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
    <div className="rp-list">
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15, delay: index * 0.01 }}
              layout
            >
              <div className="rp-list-item">
                <div className="rp-list-code">{formatRecipeCode(r.code)}</div>
                
                <div className="rp-list-icon">
                  {r.cuisine === 'italian' && '🍝'}
                  {r.cuisine === 'asian' && '🍜'}
                  {r.cuisine === 'mexican' && '🌮'}
                  {r.cuisine === 'indian' && '🍛'}
                  {!r.cuisine && '🍽'}
                </div>
                
                <div className="rp-list-content">
                  <div className="rp-list-title">{r.name}</div>
                  <div className="rp-list-meta">
                    <span>{r.category || '—'}</span>
                    <span>•</span>
                    <span>{r.portions} portions</span>
                    <span>•</span>
                    <span>{formatTime(totalTime)}</span>
                  </div>
                </div>
                
                <div className="rp-list-stats">
                  <div className="rp-list-stat">
                    <div className="rp-list-stat-label">Cost</div>
                    <div className="rp-list-stat-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div>
                  </div>
                  <div className="rp-list-stat">
                    <div className="rp-list-stat-label">FC%</div>
                    <div className="rp-list-stat-value">{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div className="rp-list-stat">
                    <div className="rp-list-stat-label">Price</div>
                    <div className="rp-list-stat-value">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div>
                  </div>
                </div>

                <div className="rp-card-actions">
                  <button className="rp-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                  <label className="rp-select-check">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </label>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )

  const renderTableView = () => (
    <div className="rp-table-wrap">
      <table className="rp-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>✓</th>
            <th style={{ width: 100 }}>Code</th>
            <th>Name</th>
            <th>Category</th>
            <th style={{ width: 80 }}>Portions</th>
            <th style={{ width: 80 }}>Time</th>
            <th style={{ width: 100 }}>Cost</th>
            <th style={{ width: 100 }}>Price</th>
            <th style={{ width: 70 }}>FC%</th>
            <th style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedRecipes.map(r => {
            const c = costCache[r.id]
            const cur = (r.currency || 'USD').toUpperCase()
            const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

            return (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td>
                  <span className="rp-table-code">{formatRecipeCode(r.code)}</span>
                </td>
                <td>
                  <span className="rp-table-name">{r.name}</span>
                  <span className="rp-table-cat">{r.cuisine || ''}</span>
                </td>
                <td>{r.category || '—'}</td>
                <td>{r.portions}</td>
                <td>{formatTime(totalTime)}</td>
                <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
                <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
                <td>{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</td>
                <td>
                  <div className="rp-table-actions">
                    <button className="rp-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <RecipesStyles />

      <div className="rp">
        <div className="rp-container">
          {/* Header */}
          <header className="rp-header">
            <div className="rp-header-left">
              <div className="rp-header-icon">🍳</div>
              <div className="rp-header-info">
                <h1>Recipe Management</h1>
                <p>{isMgmt ? 'Cost analysis & pricing' : 'Kitchen operations'}</p>
              </div>
            </div>

            <div className="rp-header-actions">
              <button className="rp-btn rp-btn-primary" onClick={createNewRecipe}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Recipe
              </button>
              <button className="rp-btn rp-btn-secondary" onClick={() => loadAll(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Sync
              </button>
              <button className="rp-btn rp-btn-ghost" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide Archived' : 'Show Archived'}
              </button>
            </div>
          </header>

          {/* Stats */}
          <div className="rp-stats">
            <div className="rp-stat">
              <div className="rp-stat-header">
                <span className="rp-stat-label">Total Recipes</span>
                <div className="rp-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h10"/>
                  </svg>
                </div>
              </div>
              <div className="rp-stat-value">{stats.total}</div>
              <div className="rp-stat-change up">↑ {stats.active} active</div>
            </div>

            <div className="rp-stat">
              <div className="rp-stat-header">
                <span className="rp-stat-label">Featured</span>
                <div className="rp-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
              </div>
              <div className="rp-stat-value">{stats.featured}</div>
              <div className="rp-stat-change">{stats.favorites} favorites</div>
            </div>

            <div className="rp-stat">
              <div className="rp-stat-header">
                <span className="rp-stat-label">Average Cost</span>
                <div className="rp-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                </div>
              </div>
              <div className="rp-stat-value">{formatCurrency(stats.avgCost)}</div>
              <div className="rp-stat-change">per portion</div>
            </div>

            <div className="rp-stat">
              <div className="rp-stat-header">
                <span className="rp-stat-label">Avg Margin</span>
                <div className="rp-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10"/>
                    <line x1="18" y1="20" x2="18" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="16"/>
                  </svg>
                </div>
              </div>
              <div className="rp-stat-value">{formatPercentage(stats.avgMargin)}</div>
              <div className="rp-stat-change down">↓ {stats.archived} archived</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="rp-toolbar">
            <div className="rp-search">
              <svg className="rp-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="rp-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, code, category..."
              />
              {q && (
                <button className="rp-search-clear" onClick={() => setQ('')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            <button
              className={`rp-btn rp-btn-ghost ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3"/>
              </svg>
              Filters
            </button>

            <div className="rp-toolbar-group">
              <button
                className={`rp-toolbar-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                </svg>
                Grid
              </button>
              <button
                className={`rp-toolbar-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <circle cx="4" cy="6" r="1" fill="currentColor"/>
                  <circle cx="4" cy="12" r="1" fill="currentColor"/>
                  <circle cx="4" cy="18" r="1" fill="currentColor"/>
                </svg>
                List
              </button>
              <button
                className={`rp-toolbar-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
                Table
              </button>
            </div>

            <button
              className="rp-btn rp-btn-ghost"
              onClick={() => setDensity(d => d === 'comfortable' ? 'dense' : d === 'dense' ? 'compact' : 'comfortable')}
            >
              {density === 'comfortable' ? 'Comfort' : density === 'dense' ? 'Dense' : 'Compact'}
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <motion.div
              className="rp-filters"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="rp-filter-group">
                <span className="rp-filter-label">Category</span>
                <button className="rp-chip active">All</button>
                <button className="rp-chip">Main</button>
                <button className="rp-chip">Dessert</button>
              </div>
              <div className="rp-filter-group">
                <span className="rp-filter-label">Difficulty</span>
                <button className="rp-chip">Easy</button>
                <button className="rp-chip">Medium</button>
                <button className="rp-chip">Hard</button>
              </div>
              <button
                className="rp-btn rp-btn-ghost"
                onClick={() => setFilters({
                  categories: [],
                  cuisines: [],
                  difficulty: [],
                  isFeatured: null,
                  isFavorite: null,
                  isSubrecipe: null
                })}
              >
                Clear All
              </button>
            </motion.div>
          )}

          {/* Sort Row */}
          <div className="rp-sort-row">
            <div className="rp-sort-left">
              <span className="rp-sort-label">Sort by</span>
              <select
                className="rp-sort-select"
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
              >
                <option value="name">Name</option>
                <option value="code">Code</option>
                <option value="category">Category</option>
                <option value="price">Price</option>
                <option value="cost">Cost</option>
                <option value="date">Date</option>
              </select>
              <button className="rp-sort-btn" onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="rp-results-count">
                <strong>{sortedRecipes.length}</strong> of {recipes.length} recipes
              </span>

              {selectedIds.length > 0 && (
                <div className="rp-bulk-actions">
                  <span style={{ fontSize: '13px', color: 'var(--rp-text-secondary)' }}>
                    {selectedIds.length} selected
                  </span>
                  <button className="rp-bulk-btn" onClick={bulkArchive}>Archive</button>
                  <button className="rp-bulk-btn danger" onClick={bulkDelete}>Delete</button>
                  <button className="rp-bulk-btn" onClick={clearSelection}>Clear</button>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {err && (
            <div className="rp-error">
              <span>⚠️</span>
              <span>{err}</span>
              <button className="rp-error-close" onClick={() => setErr(null)}>✕</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="rp-loading">
              <div className="rp-spinner" />
              <div className="rp-loading-text">Loading recipes...</div>
            </div>
          ) : !sortedRecipes.length ? (
            <div className="rp-empty">
              <div className="rp-empty-icon">🍳</div>
              <div className="rp-empty-title">
                {!hasAnyRecipes
                  ? 'No recipes yet'
                  : showArchivedEmptyHint
                    ? 'All recipes are archived'
                    : hasSearch
                      ? 'No matches found'
                      : 'No recipes'}
              </div>
              <div className="rp-empty-text">
                {!hasAnyRecipes
                  ? 'Create your first recipe to get started'
                  : showArchivedEmptyHint
                    ? 'Toggle "Show Archived" or create a new recipe'
                    : hasSearch
                      ? 'Try a different search term'
                      : 'Start by creating a recipe'}
              </div>
              <div className="rp-empty-actions">
                <button className="rp-btn rp-btn-primary" onClick={createNewRecipe}>
                  Create Recipe
                </button>
              </div>
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
          <motion.div
            className="rp-toast-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className={`rp-toast ${toast.type}`}>
              <span className="rp-toast-icon">
                {toast.type === 'success' ? '✓' : '✕'}
              </span>
              <span className="rp-toast-msg">{toast.message}</span>
              <button className="rp-toast-close" onClick={() => setToast(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
