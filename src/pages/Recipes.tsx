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
import { recipeKind, displayCode } from '../lib/codes'

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
type SortField = 'name' | 'category' | 'price' | 'cost' | 'margin' | 'date'
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
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'easy': return '#10b981'
    case 'medium': return '#f59e0b'
    case 'hard': return '#ef4444'
    default: return '#6b7280'
  }
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
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch {}
  }

  static clear(pattern: string): void {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(pattern)) {
          localStorage.removeItem(key)
        }
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
      /* ===== CSS Variables ===== */
      .recipes-pro {
        --primary-50: #f0f9ff;
        --primary-100: #e0f2fe;
        --primary-200: #bae6fd;
        --primary-300: #7dd3fc;
        --primary-400: #38bdf8;
        --primary-500: #0ea5e9;
        --primary-600: #0284c7;
        --primary-700: #0369a1;
        --primary-800: #075985;
        --primary-900: #0c4a6e;
        
        --secondary-50: #fef3c7;
        --secondary-500: #f59e0b;
        --secondary-700: #b45309;
        
        --success-50: #f0fdf4;
        --success-500: #22c55e;
        --success-700: #15803d;
        
        --danger-50: #fef2f2;
        --danger-500: #ef4444;
        --danger-700: #b91c1c;
        
        --warning-50: #fffbeb;
        --warning-500: #f59e0b;
        --warning-700: #b45309;
        
        --gray-50: #f9fafb;
        --gray-100: #f3f4f6;
        --gray-200: #e5e7eb;
        --gray-300: #d1d5db;
        --gray-400: #9ca3af;
        --gray-500: #6b7280;
        --gray-600: #4b5563;
        --gray-700: #374151;
        --gray-800: #1f2937;
        --gray-900: #111827;
        
        --bg-primary: #ffffff;
        --bg-secondary: var(--gray-50);
        --text-primary: var(--gray-900);
        --text-secondary: var(--gray-600);
        --text-tertiary: var(--gray-400);
        --border-color: var(--gray-200);
        
        --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
        
        --radius-sm: 0.375rem;
        --radius-md: 0.5rem;
        --radius-lg: 0.75rem;
        --radius-xl: 1rem;
        --radius-2xl: 1.5rem;
        --radius-full: 9999px;
        
        --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @media (prefers-color-scheme: dark) {
        .recipes-pro {
          --bg-primary: var(--gray-800);
          --bg-secondary: var(--gray-900);
          --text-primary: var(--gray-100);
          --text-secondary: var(--gray-300);
          --text-tertiary: var(--gray-500);
          --border-color: var(--gray-700);
        }
      }

      .recipes-pro {
        min-height: 100vh;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 2rem;
      }

      .recipes-pro__container {
        max-width: 1600px;
        margin: 0 auto;
      }

      .recipes-pro__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        gap: 1rem;
      }

      .recipes-pro__header-left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .recipes-pro__header-icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-lg);
        background: linear-gradient(135deg, var(--primary-500), var(--primary-700));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 1.25rem;
        box-shadow: var(--shadow-md);
      }

      .recipes-pro__header-title {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, var(--primary-600), var(--primary-800));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
      }

      .recipes-pro__header-subtitle {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.125rem;
      }

      .recipes-pro__header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      /* ===== Stats Cards - مصغرة ===== */
      .recipes-pro__stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .stat-card {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
        padding: 1rem;
        box-shadow: var(--shadow-sm);
        transition: var(--transition);
        position: relative;
        overflow: hidden;
      }

      .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--primary-500), var(--primary-600));
        opacity: 0;
        transition: var(--transition);
      }

      .stat-card:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-lg);
        border-color: var(--primary-300);
      }

      .stat-card:hover::before {
        opacity: 1;
      }

      .stat-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
      }

      .stat-card__label {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
      }

      .stat-card__icon {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: var(--radius-md);
        background: var(--primary-50);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary-600);
      }

      .stat-card__icon svg {
        width: 1rem;
        height: 1rem;
      }

      .stat-card__value {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text-primary);
        line-height: 1.2;
      }

      .stat-card__change {
        font-size: 0.65rem;
        margin-top: 0.25rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--text-secondary);
      }

      .stat-card__change--positive {
        color: var(--success-500);
      }

      .stat-card__change--negative {
        color: var(--danger-500);
      }

      /* ===== Toolbar ===== */
      .recipes-pro__toolbar {
        background: var(--bg-primary);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-color);
        padding: 0.75rem 1rem;
        box-shadow: var(--shadow-sm);
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.75rem;
        backdrop-filter: blur(8px);
        background: rgba(255, 255, 255, 0.8);
      }

      .recipes-pro__search {
        flex: 1;
        min-width: 250px;
        position: relative;
      }

      .recipes-pro__search-icon {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-tertiary);
        width: 1rem;
        height: 1rem;
      }

      .recipes-pro__search-input {
        width: 100%;
        height: 2.25rem;
        padding: 0 0.75rem 0 2.25rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.85rem;
        transition: var(--transition);
      }

      .recipes-pro__search-input:focus {
        outline: none;
        border-color: var(--primary-400);
        box-shadow: 0 0 0 3px var(--primary-100);
      }

      .recipes-pro__search-clear {
        position: absolute;
        right: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-tertiary);
        cursor: pointer;
        padding: 0.125rem;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
      }

      .recipes-pro__search-clear:hover {
        background: var(--gray-100);
        color: var(--text-primary);
      }

      .recipes-pro__filters-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        height: 2.25rem;
        padding: 0 1rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        transition: var(--transition);
        white-space: nowrap;
      }

      .recipes-pro__filters-btn:hover {
        border-color: var(--primary-400);
        background: var(--primary-50);
        color: var(--primary-700);
      }

      .recipes-pro__filters-btn--active {
        background: var(--primary-500);
        border-color: var(--primary-500);
        color: white;
      }

      .recipes-pro__view-controls {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        background: var(--gray-100);
        border-radius: var(--radius-full);
        padding: 0.125rem;
        border: 1px solid var(--border-color);
      }

      .view-control-btn {
        padding: 0.375rem 0.75rem;
        border-radius: var(--radius-full);
        border: none;
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .view-control-btn:hover {
        color: var(--primary-600);
      }

      .view-control-btn--active {
        background: white;
        color: var(--primary-600);
        box-shadow: var(--shadow-sm);
      }

      .recipes-pro__density-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        height: 2.25rem;
        padding: 0 1rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        transition: var(--transition);
        white-space: nowrap;
      }

      .recipes-pro__density-btn:hover {
        border-color: var(--secondary-500);
        background: var(--secondary-50);
        color: var(--secondary-700);
      }

      .recipes-pro__filters {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
        padding: 0.75rem 1rem;
        box-shadow: var(--shadow-sm);
        margin-bottom: 1rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        animation: slideDown 0.2s ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-0.5rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .filter-group {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0 0.75rem;
        border-right: 1px solid var(--border-color);
      }

      .filter-group:last-child {
        border-right: none;
      }

      .filter-label {
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-tertiary);
      }

      .filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-full);
        background: var(--gray-100);
        border: 1px solid var(--border-color);
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        transition: var(--transition);
      }

      .filter-chip:hover {
        background: var(--gray-200);
      }

      .filter-chip--active {
        background: var(--primary-500);
        border-color: var(--primary-500);
        color: white;
      }

      .recipes-pro__sort {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.375rem 0;
        margin-bottom: 0.75rem;
      }

      .sort-label {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-tertiary);
      }

      .sort-select {
        padding: 0.375rem 1.5rem 0.375rem 0.75rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 0.5rem center;
      }

      .sort-select:focus {
        outline: none;
        border-color: var(--primary-400);
      }

      .sort-order-btn {
        padding: 0.375rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
      }

      .sort-order-btn:hover {
        border-color: var(--primary-400);
        color: var(--primary-600);
      }

      .recipes-pro__results-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
        color: var(--text-secondary);
        font-size: 0.75rem;
      }

      .recipes-pro__results-count {
        font-weight: 600;
      }

      .recipes-pro__results-actions {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .bulk-action-btn {
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-full);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-secondary);
        font-size: 0.65rem;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
      }

      .bulk-action-btn:hover {
        background: var(--gray-100);
      }

      .bulk-action-btn--danger:hover {
        background: var(--danger-500);
        border-color: var(--danger-500);
        color: white;
      }

      .recipes-pro__grid {
        display: grid;
        gap: 1rem;
        transition: var(--transition);
      }

      .recipes-pro__grid--comfortable {
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 0.875rem;
      }

      .recipes-pro__grid--dense {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0.75rem;
      }

      .recipes-pro__grid--compact {
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 0.625rem;
      }

      .recipe-card {
        background: var(--bg-primary);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-color);
        overflow: hidden;
        box-shadow: var(--shadow-sm);
        transition: var(--transition);
        position: relative;
        animation: cardAppear 0.3s ease-out;
      }

      @keyframes cardAppear {
        from {
          opacity: 0;
          transform: translateY(1rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .recipe-card:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-lg);
        border-color: var(--primary-300);
      }

      .recipe-card__accent {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(180deg, var(--primary-500), var(--primary-600));
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        opacity: 0;
        transition: var(--transition);
      }

      .recipe-card:hover .recipe-card__accent {
        opacity: 1;
      }

      .recipe-card__body {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .recipe-card__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .recipe-card__title-section {
        min-width: 0;
        flex: 1;
      }

      .recipe-card__title {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        color: var(--text-primary);
        letter-spacing: -0.02em;
        line-height: 1.3;
      }

      .recipe-card__code {
        margin-top: 4px;
      }

      .recipe-card__category {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-top: 0.125rem;
        color: var(--text-secondary);
        font-size: 0.7rem;
        font-weight: 600;
      }

      .recipe-card__badges {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.125rem;
        padding: 0.2rem 0.4rem;
        border-radius: var(--radius-full);
        font-size: 0.55rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
      }

      .badge--featured {
        background: var(--secondary-50);
        color: var(--secondary-700);
        border: 1px solid var(--secondary-500);
      }

      .badge--favorite {
        background: var(--danger-50);
        color: var(--danger-700);
        border: 1px solid var(--danger-500);
      }

      .badge--subrecipe {
        background: var(--primary-50);
        color: var(--primary-700);
        border: 1px solid var(--primary-500);
      }

      .badge--archived {
        background: var(--gray-100);
        color: var(--gray-600);
        border: 1px solid var(--gray-400);
      }

      .badge--warning {
        background: var(--warning-50);
        color: var(--warning-700);
        border: 1px solid var(--warning-500);
      }

      .badge svg {
        width: 8px;
        height: 8px;
      }

      .recipe-card__meta {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        flex-wrap: wrap;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.5rem;
        background: var(--gray-100);
        border-radius: var(--radius-full);
        font-size: 0.65rem;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .meta-item__icon {
        color: var(--text-tertiary);
      }

      .meta-item__icon svg {
        width: 12px;
        height: 12px;
      }

      .recipe-card__description {
        color: var(--text-secondary);
        font-size: 0.75rem;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0.125rem 0;
      }

      .recipe-card__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
      }

      .tag {
        font-size: 0.55rem;
        padding: 0.1rem 0.375rem;
        background: var(--gray-100);
        border-radius: var(--radius-full);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
      }

      .recipe-card__metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.375rem;
        margin-top: 0.25rem;
      }

      .metric {
        background: linear-gradient(135deg, var(--gray-50), var(--gray-100));
        border-radius: var(--radius-md);
        padding: 0.5rem;
        text-align: center;
        border: 1px solid var(--border-color);
        transition: var(--transition);
      }

      .metric:hover {
        background: var(--primary-50);
        border-color: var(--primary-300);
        transform: translateY(-1px);
      }

      .metric__label {
        color: var(--text-tertiary);
        font-size: 0.55rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 800;
      }

      .metric__value {
        margin-top: 0.125rem;
        color: var(--text-primary);
        font-size: 0.75rem;
        font-weight: 800;
        line-height: 1.2;
      }

      .metric__value--warning {
        color: var(--danger-500);
      }

      .metric__value--success {
        color: var(--success-500);
      }

      .recipe-card__nutrition {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0;
        border-top: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        font-size: 0.65rem;
      }

      .nutrition-item {
        flex: 1;
        text-align: center;
      }

      .nutrition-value {
        font-weight: 800;
        color: var(--text-primary);
        font-size: 0.7rem;
      }

      .nutrition-label {
        color: var(--text-tertiary);
        font-size: 0.55rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .recipe-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 0.25rem;
        gap: 0.375rem;
        flex-wrap: wrap;
      }

      .recipe-card__price {
        font-size: 0.85rem;
        font-weight: 800;
        color: var(--primary-600);
      }

      .recipe-card__price small {
        font-size: 0.55rem;
        color: var(--text-tertiary);
        font-weight: 500;
      }

      .recipe-card__actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .action-btn {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--transition);
      }

      .action-btn:hover {
        background: var(--gray-100);
        border-color: var(--primary-400);
        color: var(--primary-600);
        transform: translateY(-1px);
      }

      .action-btn--danger:hover {
        background: var(--danger-500);
        border-color: var(--danger-500);
        color: white;
      }

      .action-btn svg {
        width: 14px;
        height: 14px;
      }

      .select-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-md);
        border: 1px dashed var(--border-color);
        background: var(--bg-primary);
        color: var(--text-secondary);
        font-size: 0.65rem;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
      }

      .select-btn:hover {
        border-color: var(--primary-400);
        background: var(--primary-50);
        color: var(--primary-700);
      }

      .select-btn input {
        width: 0.875rem;
        height: 0.875rem;
        accent-color: var(--primary-500);
        cursor: pointer;
      }

      .recipes-pro__list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .recipe-list-item {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-color);
        padding: 0.75rem;
        transition: var(--transition);
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .recipe-list-item:hover {
        background: var(--gray-50);
        border-color: var(--primary-300);
        transform: translateX(0.25rem);
      }

      .recipe-list-item__icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-md);
        background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 1.125rem;
      }

      .recipe-list-item__content {
        flex: 1;
        min-width: 0;
      }

      .recipe-list-item__title {
        font-weight: 700;
        margin-bottom: 0.125rem;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-wrap: wrap;
        font-size: 0.85rem;
      }

      .recipe-list-item__code {
        font-family: monospace;
        font-size: 10px;
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 12px;
        color: #4b5563;
        display: inline-block;
      }

      .dark .recipe-list-item__code {
        background: #374151;
        color: #9ca3af;
      }

      .recipe-list-item__category {
        color: var(--text-tertiary);
        font-size: 0.65rem;
      }

      .recipe-list-item__meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-secondary);
        font-size: 0.7rem;
      }

      .recipe-list-item__stats {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .recipe-list-item__stat {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .recipe-list-item__price {
        font-weight: 700;
        color: var(--primary-600);
        font-size: 0.75rem;
      }

      .recipes-pro__table {
        width: 100%;
        border-collapse: collapse;
        background: var(--bg-primary);
        border-radius: var(--radius-xl);
        overflow: hidden;
        border: 1px solid var(--border-color);
        box-shadow: var(--shadow-sm);
        font-size: 0.8rem;
      }

      .recipes-pro__table th {
        background: var(--gray-100);
        padding: 0.75rem 0.5rem;
        text-align: left;
        font-size: 0.65rem;
        font-weight: 700;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 2px solid var(--border-color);
      }

      .recipes-pro__table td {
        padding: 0.75rem 0.5rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-secondary);
      }

      .recipes-pro__table tr:hover td {
        background: var(--gray-50);
      }

      .recipes-pro__table tr:last-child td {
        border-bottom: none;
      }

      .table-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .code-cell {
        font-family: monospace;
        font-size: 11px;
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 6px;
        display: inline-block;
      }

      .dark .code-cell {
        background: #374151;
        color: #9ca3af;
      }

      .recipes-pro__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: var(--bg-primary);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-color);
        box-shadow: var(--shadow-sm);
      }

      .loading-spinner {
        width: 2.5rem;
        height: 2.5rem;
        border: 3px solid var(--border-color);
        border-top-color: var(--primary-500);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .recipes-pro__error {
        background: var(--danger-50);
        border: 1px solid var(--danger-500);
        border-radius: var(--radius-lg);
        padding: 0.75rem 1rem;
        color: var(--danger-700);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        font-size: 0.85rem;
      }

      .recipes-pro__error-close {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--danger-700);
        cursor: pointer;
        padding: 0.125rem;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .recipes-pro__error-close:hover {
        background: var(--danger-100);
      }

      .toast-container {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 9999;
      }

      .toast {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        padding: 0.75rem 1rem;
        box-shadow: var(--shadow-lg);
        border-left: 4px solid var(--primary-500);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        animation: slideIn 0.3s ease-out;
        font-size: 0.85rem;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .toast--success {
        border-left-color: var(--success-500);
      }

      .toast--error {
        border-left-color: var(--danger-500);
      }

      .toast--warning {
        border-left-color: var(--warning-500);
      }

      .toast-close {
        background: none;
        border: none;
        color: var(--text-tertiary);
        cursor: pointer;
        padding: 0.125rem;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .toast-close:hover {
        background: var(--gray-100);
        color: var(--text-primary);
      }

      @media (max-width: 1280px) {
        .recipes-pro__grid--comfortable {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
        
        .recipes-pro__grid--dense {
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        }
        
        .recipes-pro__grid--compact {
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        }
      }

      @media (max-width: 1024px) {
        .recipes-pro {
          padding: 1.5rem;
        }

        .recipes-pro__stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 768px) {
        .recipes-pro {
          padding: 1rem;
        }

        .recipes-pro__header {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipes-pro__header-actions {
          width: 100%;
        }

        .recipes-pro__header-actions > * {
          flex: 1;
        }

        .recipes-pro__toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .recipes-pro__search {
          min-width: 100%;
        }

        .recipes-pro__filters {
          flex-direction: column;
          align-items: stretch;
        }

        .filter-group {
          border-right: none;
          border-bottom: 1px solid var(--border-color);
          padding: 0.5rem 0;
        }

        .filter-group:last-child {
          border-bottom: none;
        }

        .recipes-pro__grid {
          grid-template-columns: 1fr !important;
        }

        .recipe-card__metrics {
          grid-template-columns: 1fr;
        }

        .recipe-card__footer {
          flex-direction: column;
          align-items: stretch;
        }

        .recipe-card__actions {
          justify-content: space-between;
        }

        .recipes-pro__table {
          display: block;
          overflow-x: auto;
        }

        .recipe-list-item {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipe-list-item__meta {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
        }
      }

      @media (max-width: 480px) {
        .recipes-pro__stats {
          grid-template-columns: 1fr;
        }

        .recipes-pro__results-info {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .recipes-pro__results-actions {
          width: 100%;
        }

        .bulk-action-btn {
          flex: 1;
        }
      }

      @media print {
        .recipes-pro__header-actions,
        .recipes-pro__toolbar,
        .recipes-pro__filters,
        .recipes-pro__sort,
        .recipes-pro__results-actions,
        .recipe-card__actions,
        .action-btn,
        .select-btn,
        .toast-container {
          display: none !important;
        }

        .recipe-card {
          break-inside: avoid;
          border: 1px solid #000;
          box-shadow: none;
        }

        .recipes-pro__grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
      }

      ::-webkit-scrollbar {
        width: 0.5rem;
        height: 0.5rem;
      }

      ::-webkit-scrollbar-track {
        background: var(--gray-100);
      }

      ::-webkit-scrollbar-thumb {
        background: var(--gray-400);
        border-radius: var(--radius-full);
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--gray-500);
      }
    `}</style>
  )
}

// ==================== باقي الكود (منطق المكون) ====================
export default function Recipes() {
  const nav = useNavigate()
  const loc = useLocation()
  const { isKitchen } = useMode()
  const isMgmt = !isKitchen
  const k = useKitchen()

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null)
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
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => CacheManager.get(CACHE_KEYS.COST_CACHE, CACHE_TTL.COST) || {})

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

    if (filters.cuisines.length > 0) {
      list = list.filter(r => r.cuisine && filters.cuisines.includes(r.cuisine))
    }

    if (filters.difficulty.length > 0) {
      list = list.filter(r => r.difficulty && filters.difficulty.includes(r.difficulty))
    }

    if (filters.isFeatured !== null) {
      list = list.filter(r => r.is_featured === filters.isFeatured)
    }
    if (filters.isFavorite !== null) {
      list = list.filter(r => r.is_favorite === filters.isFavorite)
    }
    if (filters.isSubrecipe !== null) {
      list = list.filter(r => r.is_subrecipe === filters.isSubrecipe)
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
    
    return {
      total,
      active,
      archived,
      subrecipes,
      featured,
      favorites,
      totalCost,
      avgCost,
      avgMargin
    }
  }, [recipes, costCache])

  const loadAll = useCallback(async (sync = false) => {
    if (!mountedRef.current) return
    
    if (!sync) {
      setLoading(true)
    }
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

      const selectRecipes = `
        id,
        code,
        kitchen_id,
        name,
        category,
        cuisine,
        portions,
        yield_qty,
        yield_unit,
        is_subrecipe,
        is_archived,
        is_featured,
        is_favorite,
        photo_url,
        description,
        preparation_time,
        cooking_time,
        difficulty,
        tags,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        selling_price,
        currency,
        target_food_cost_pct,
        created_at,
        updated_at,
        version
      `

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(selectRecipes)
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
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  const ensureRecipeLinesLoaded = useCallback(async (ids: string[]) => {
    const need = ids.filter(
      id => !recipeLinesCache[id] && !loadingLinesRef.current.has(id)
    )
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
    if (loading) return
    if (!sortedRecipes.length) return

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
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          warnings.push('Ingredient without price')
        }

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
      const profit = margin

      nextCache[rid] = {
        at: now,
        totalCost,
        cpp,
        fcPct,
        margin,
        marginPct,
        profit,
        warnings
      }

      changed = true
    }

    if (changed) {
      if (mountedRef.current) setCostCache(nextCache)
      CacheManager.set(CACHE_KEYS.COST_CACHE, nextCache)
    }
  }, [loading, sortedRecipes, recipeLinesCache, ingById, costCache, ensureRecipeLinesLoaded])

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const createNewRecipe = useCallback(async () => {
    if (mountedRef.current) setErr(null)

    try {
      if (!k.kitchenId) {
        throw new Error('Kitchen not ready yet. Please wait a moment and try again.')
      }

      const payload: Partial<RecipeRow> = {
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
      showToast('success', 'Recipe created successfully. Opening editor...')
      
      CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      
      setTimeout(() => {
        nav(`/recipe?id=${encodeURIComponent(id)}`)
      }, 500)
      
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
        showToast('success', next ? 'Recipe archived' : 'Recipe restored')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to update recipe')
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
        showToast('success', next ? 'Recipe featured' : 'Recipe unfeatured')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to update recipe')
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
      showToast('error', e?.message || 'Failed to update recipe')
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const clearSelection = useCallback(() => {
    setSelected({})
  }, [])

  const selectAll = useCallback(() => {
    const newSelected: Record<string, boolean> = {}
    sortedRecipes.forEach(r => { newSelected[r.id] = true })
    setSelected(newSelected)
  }, [sortedRecipes])

  const bulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return
    
    const ok = window.confirm(`Archive ${selectedIds.length} selected recipes?`)
    if (!ok) return

    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .in('id', selectedIds)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes(prev =>
          prev.map(r =>
            selectedIds.includes(r.id) ? { ...r, is_archived: true } : r
          )
        )
        setSelected({})
        showToast('success', `${selectedIds.length} recipes archived`)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to archive recipes')
    }
  }, [selectedIds])

  const bulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    
    const ok = window.confirm(
      `Permanently delete ${selectedIds.length} selected recipes?\n\nThis action cannot be undone.`
    )
    if (!ok) return

    try {
      const { error: lErr } = await supabase
        .from('recipe_lines')
        .delete()
        .in('recipe_id', selectedIds)
      if (lErr) throw lErr

      const { error: rErr } = await supabase
        .from('recipes')
        .delete()
        .in('id', selectedIds)
      if (rErr) throw rErr

      if (mountedRef.current) {
        setRecipes(prev => prev.filter(r => !selectedIds.includes(r.id)))
        setRecipeLinesCache(prev => {
          const next = { ...prev }
          selectedIds.forEach(id => delete next[id])
          return next
        })
        setSelected({})
        showToast('success', `${selectedIds.length} recipes deleted`)
        
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to delete recipes')
    }
  }, [selectedIds])

  const deleteOneRecipe = useCallback(async (recipeId: string) => {
    const ok = window.confirm(
      'Delete this recipe permanently?\n\nThis will also delete its recipe lines.\nThis action cannot be undone.'
    )
    if (!ok) return

    try {
      const { error: lErr } = await supabase
        .from('recipe_lines')
        .delete()
        .eq('recipe_id', recipeId)
      if (lErr) throw lErr

      const { error: rErr } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId)
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
        showToast('success', 'Recipe deleted successfully')
        
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to delete recipe')
    }
  }, [])

  const renderGridView = () => (
    <div className={`recipes-pro__grid recipes-pro__grid--${density}`}>
      <AnimatePresence>
        {sortedRecipes.map(r => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const hasWarning = Boolean(c?.warnings?.length)
          const portions = toNum(r.portions, 1)
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              layout
            >
              <div className="recipe-card">
                <div className="recipe-card__accent" />

                <div className="recipe-card__body">
                  <div className="recipe-card__header">
                    <div className="recipe-card__title-section">
                      <h3 className="recipe-card__title">{r.name}</h3>
                      <div className="recipe-card__code mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-mono font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                          <span className="text-[9px]">🔖</span>
                          {r.code || displayCode(recipeKind(r.is_subrecipe), r.id)}
                        </span>
                      </div>
                      <div className="recipe-card__category">
                        <span>{r.category || 'Uncategorized'}</span>
                        {r.cuisine && <span>• {r.cuisine}</span>}
                      </div>
                    </div>

                    <div className="recipe-card__badges">
                      {r.is_featured && (
                        <span className="badge badge--featured">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          Featured
                        </span>
                      )}
                      {r.is_favorite && (
                        <span className="badge badge--favorite">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                          Favorite
                        </span>
                      )}
                      {r.is_subrecipe && (
                        <span className="badge badge--subrecipe">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                          </svg>
                          Subrecipe
                        </span>
                      )}
                      {r.is_archived && (
                        <span className="badge badge--archived">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="21 8 21 21 3 21 3 8" />
                            <rect x="1" y="3" width="22" height="5" rx="2" ry="2" />
                            <line x1="10" y1="12" x2="14" y2="12" />
                          </svg>
                          Archived
                        </span>
                      )}
                      {hasWarning && (
                        <span className="badge badge--warning">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          Missing Price
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="recipe-card__meta">
                    <div className="meta-item">
                      <svg className="meta-item__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M5.37 16c.92-1.52 2.84-2 5.37-2h2.52c2.53 0 4.45.48 5.37 2" />
                      </svg>
                      <span>{portions}</span>
                    </div>
                    <div className="meta-item">
                      <svg className="meta-item__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{formatTime(totalTime)}</span>
                    </div>
                    <div className="meta-item">
                      <svg className="meta-item__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                      </svg>
                      <span>{r.yield_qty ? `${r.yield_qty}${r.yield_unit ? ` ${r.yield_unit}` : ''}` : '—'}</span>
                    </div>
                  </div>

                  {r.description && (
                    <p className="recipe-card__description">{r.description}</p>
                  )}

                  {r.tags && r.tags.length > 0 && (
                    <div className="recipe-card__tags">
                      {r.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="recipe-card__metrics">
                    <div className="metric">
                      <div className="metric__label">Cost</div>
                      <div className="metric__value">
                        {c ? formatCurrency(c.cpp, cur) : '—'}
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric__label">FC%</div>
                      <div className={`metric__value ${c?.fcPct && c.fcPct > 30 ? 'metric__value--warning' : 'metric__value--success'}`}>
                        {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric__label">Margin</div>
                      <div className="metric__value">
                        {c ? formatCurrency(c.margin, cur) : '—'}
                      </div>
                    </div>
                  </div>

                  {(r.calories || r.protein_g || r.carbs_g || r.fat_g) && (
                    <div className="recipe-card__nutrition">
                      {r.calories && (
                        <div className="nutrition-item">
                          <div className="nutrition-value">{r.calories}</div>
                          <div className="nutrition-label">Cal</div>
                        </div>
                      )}
                      {r.protein_g && (
                        <div className="nutrition-item">
                          <div className="nutrition-value">{r.protein_g}g</div>
                          <div className="nutrition-label">Pro</div>
                        </div>
                      )}
                      {r.carbs_g && (
                        <div className="nutrition-item">
                          <div className="nutrition-value">{r.carbs_g}g</div>
                          <div className="nutrition-label">Car</div>
                        </div>
                      )}
                      {r.fat_g && (
                        <div className="nutrition-item">
                          <div className="nutrition-value">{r.fat_g}g</div>
                          <div className="nutrition-label">Fat</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="recipe-card__footer">
                    <div className="recipe-card__price">
                      {r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}
                    </div>
                    <div className="recipe-card__actions">
                      <button
                        className="action-btn"
                        onClick={() => toggleFavorite(r)}
                        title={r.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={r.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => toggleFeatured(r)}
                        title={r.is_featured ? 'Unfeature' : 'Feature'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => toggleArchive(r)}
                        title={r.is_archived ? 'Restore' : 'Archive'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="21 8 21 21 3 21 3 8" />
                          <rect x="1" y="3" width="22" height="5" rx="2" ry="2" />
                          <line x1="10" y1="12" x2="14" y2="12" />
                        </svg>
                      </button>
                      <button
                        className="action-btn action-btn--danger"
                        onClick={() => deleteOneRecipe(r.id)}
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <label className="select-btn">
                        <input
                          type="checkbox"
                          checked={!!selected[r.id]}
                          onChange={() => toggleSelect(r.id)}
                        />
                        <span>Sel</span>
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
    <div className="recipes-pro__list">
      <AnimatePresence>
        {sortedRecipes.map(r => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              layout
            >
              <div className="recipe-list-item">
                <div className="recipe-list-item__icon">
                  {r.cuisine === 'italian' && '🍝'}
                  {r.cuisine === 'asian' && '🍜'}
                  {r.cuisine === 'mexican' && '🌮'}
                  {r.cuisine === 'indian' && '🍛'}
                  {!r.cuisine && '🍽'}
                </div>
                
                <div className="recipe-list-item__content">
                  <div className="recipe-list-item__title">
                    <span className="recipe-list-item__code">
                      {r.code || displayCode(recipeKind(r.is_subrecipe), r.id)}
                    </span>
                    <span>{r.name}</span>
                    <span className="recipe-list-item__category">{r.category}</span>
                  </div>
                  
                  <div className="recipe-list-item__meta">
                    <span className="recipe-list-item__stat">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M5.37 16c.92-1.52 2.84-2 5.37-2h2.52c2.53 0 4.45.48 5.37 2" />
                      </svg>
                      {r.portions}
                    </span>
                    <span className="recipe-list-item__stat">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {formatTime(totalTime)}
                    </span>
                    <span className="recipe-list-item__price">
                      {c ? formatCurrency(c.cpp, cur) : '—'}
                    </span>
                  </div>
                </div>
                
                <div className="recipe-card__actions">
                  <button className="action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                  <label className="select-btn">
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
    <table className="recipes-pro__table">
      <thead>
        <tr>
          <th style={{ width: 30 }}>
            <input
              type="checkbox"
              checked={selectedIds.length === sortedRecipes.length && sortedRecipes.length > 0}
              onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
            />
          </th>
          <th>Code</th>
          <th>Name</th>
          <th>Category</th>
          <th>Portions</th>
          <th>Time</th>
          <th>Cost</th>
          <th>Price</th>
          <th>FC%</th>
          <th style={{ width: 60 }}></th>
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
              <td className="font-mono text-xs">
                <span className="code-cell">
                  {r.code || displayCode(recipeKind(r.is_subrecipe), r.id)}
                </span>
              </td>
              <td><strong>{r.name}</strong></td>
              <td>{r.category || '—'}</td>
              <td>{r.portions}</td>
              <td>{formatTime(totalTime)}</td>
              <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
              <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
              <td>{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</td>
              <td>
                <div className="table-actions">
                  <button className="action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <>
      <RecipesStyles />

      <div className="recipes-pro">
        <div className="recipes-pro__container">
          <div className="recipes-pro__header">
            <div className="recipes-pro__header-left">
              <div className="recipes-pro__header-icon">
                <span>🍳</span>
              </div>
              <div>
                <h1 className="recipes-pro__header-title">Recipe Management</h1>
                <p className="recipes-pro__header-subtitle">
                  {isMgmt ? 'Costing, pricing & analytics' : 'Kitchen operations & production'}
                </p>
              </div>
            </div>

            <div className="recipes-pro__header-actions">
              <Button size="small" onClick={createNewRecipe}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New
              </Button>

              <Button size="small" variant="secondary" onClick={() => loadAll(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Sync
              </Button>

              <Button size="small" variant="secondary" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>

          <div className="recipes-pro__stats">
            <div className="stat-card">
              <div className="stat-card__header">
                <span className="stat-card__label">Total Recipes</span>
                <div className="stat-card__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </div>
              </div>
              <div className="stat-card__value">{stats.total}</div>
              <div className="stat-card__change">
                <span className="stat-card__change--positive">↑ {stats.active} active</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card__header">
                <span className="stat-card__label">Featured</span>
                <div className="stat-card__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              </div>
              <div className="stat-card__value">{stats.featured}</div>
              <div className="stat-card__change">
                <span>{stats.favorites} fav</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card__header">
                <span className="stat-card__label">Avg Cost</span>
                <div className="stat-card__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="6" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              </div>
              <div className="stat-card__value">
                {formatCurrency(stats.avgCost)}
              </div>
              <div className="stat-card__change">
                <span>per recipe</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card__header">
                <span className="stat-card__label">Avg Margin</span>
                <div className="stat-card__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10" />
                    <line x1="18" y1="20" x2="18" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="16" />
                  </svg>
                </div>
              </div>
              <div className={`stat-card__value ${stats.avgMargin > 0 ? 'text-success' : 'text-danger'}`}>
                {formatPercentage(stats.avgMargin)}
              </div>
              <div className="stat-card__change">
                <span className="stat-card__change--negative">↓ {stats.archived}</span>
              </div>
            </div>
          </div>

          <div className="recipes-pro__toolbar">
            <div className="recipes-pro__search">
              <svg className="recipes-pro__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="recipes-pro__search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search..."
              />
              {q && (
                <button
                  className="recipes-pro__search-clear"
                  onClick={() => setQ('')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <button
              className={`recipes-pro__filters-btn ${showFilters ? 'recipes-pro__filters-btn--active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
              </svg>
              Filters
            </button>

            <div className="recipes-pro__view-controls">
              <button
                className={`view-control-btn ${viewMode === 'grid' ? 'view-control-btn--active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Grid
              </button>
              <button
                className={`view-control-btn ${viewMode === 'list' ? 'view-control-btn--active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                List
              </button>
              <button
                className={`view-control-btn ${viewMode === 'table' ? 'view-control-btn--active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                Table
              </button>
            </div>

            <button
              className="recipes-pro__density-btn"
              onClick={() => {
                const next = density === 'comfortable' ? 'dense' : density === 'dense' ? 'compact' : 'comfortable'
                setDensity(next)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              {density === 'comfortable' ? 'Comfort' : density === 'dense' ? 'Dense' : 'Compact'}
            </button>
          </div>

          {showFilters && (
            <motion.div
              className="recipes-pro__filters"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="filter-group">
                <span className="filter-label">Category</span>
                <button className="filter-chip filter-chip--active">All</button>
                <button className="filter-chip">Main</button>
                <button className="filter-chip">Dessert</button>
              </div>
              
              <div className="filter-group">
                <span className="filter-label">Difficulty</span>
                <button className="filter-chip">Easy</button>
                <button className="filter-chip">Medium</button>
                <button className="filter-chip">Hard</button>
              </div>

              <Button variant="ghost" size="small" onClick={() => setFilters({
                categories: [],
                cuisines: [],
                difficulty: [],
                isFeatured: null,
                isFavorite: null,
                isSubrecipe: null
              })}>
                Clear
              </Button>
            </motion.div>
          )}

          <div className="recipes-pro__sort">
            <span className="sort-label">Sort by:</span>
            <select
              className="sort-select"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
            >
              <option value="name">Name</option>
              <option value="category">Category</option>
              <option value="price">Price</option>
              <option value="cost">Cost</option>
            </select>
            <button
              className="sort-order-btn"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div className="recipes-pro__results-info">
            <span className="recipes-pro__results-count">
              {sortedRecipes.length} of {recipes.length}
            </span>
            {selectedIds.length > 0 && (
              <div className="recipes-pro__results-actions">
                <span>{selectedIds.length} selected</span>
                <button className="bulk-action-btn" onClick={bulkArchive}>Archive</button>
                <button className="bulk-action-btn bulk-action-btn--danger" onClick={bulkDelete}>Delete</button>
                <button className="bulk-action-btn" onClick={clearSelection}>Clear</button>
              </div>
            )}
          </div>

          {err && (
            <div className="recipes-pro__error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{err}</span>
              <button className="recipes-pro__error-close" onClick={() => setErr(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {loading ? (
            <div className="recipes-pro__loading">
              <div className="loading-spinner" />
            </div>
          ) : !sortedRecipes.length ? (
            <EmptyState
              title={
                !hasAnyRecipes
                  ? 'No recipes yet'
                  : showArchivedEmptyHint
                    ? 'Only archived recipes found'
                    : hasSearch
                      ? 'No matches'
                      : 'No recipes to show'
              }
              description={
                !hasAnyRecipes
                  ? 'Create your first recipe.'
                  : showArchivedEmptyHint
                    ? 'Show archived or create new.'
                    : hasSearch
                      ? 'Try another search.'
                      : 'Create a new recipe.'
              }
              primaryAction={{
                label: !hasAnyRecipes
                  ? 'Create first'
                  : showArchivedEmptyHint
                    ? 'Show archived'
                    : hasSearch
                      ? 'Clear search'
                      : 'New recipe',
                onClick: () => {
                  if (!hasAnyRecipes) {
                    createNewRecipe()
                    return
                  }
                  if (showArchivedEmptyHint) {
                    setShowArchived(true)
                    return
                  }
                  if (hasSearch) {
                    setQ('')
                    return
                  }
                  createNewRecipe()
                },
              }}
              secondaryAction={{
                label: !hasAnyRecipes ? 'Add ingredient' : 'Browse',
                onClick: !hasAnyRecipes ? () => nav('/ingredients') : () => nav('/ingredients'),
              }}
              icon="🍳"
            />
          ) : (
            <>
              {viewMode === 'grid' && renderGridView()}
              {viewMode === 'list' && renderListView()}
              {viewMode === 'table' && renderTableView()}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast-container"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
          >
            <div className={`toast toast--${toast.type}`}>
              <div className="toast-icon">
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✗'}
                {toast.type === 'info' && 'ℹ'}
              </div>
              <div className="toast-message">{toast.message}</div>
              <button className="toast-close" onClick={() => setToast(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
