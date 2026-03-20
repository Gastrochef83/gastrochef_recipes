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
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
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
function RecipesStyles() {
  return (
    <style>{`
      /* ===== Organic Kitchen Design System ===== */
      .ok-app {
        --ok-bg: #FFFBF5;
        --ok-bg-card: #FFFFFF;
        --ok-bg-elevated: #FFFFFF;
        --ok-bg-hover: #F5F0E8;
        --ok-border: #E6DFD5;
        --ok-border-dark: #D4C9BA;
        --ok-text: #2C3E2D;
        --ok-text-secondary: #5F6D52;
        --ok-text-muted: #8A957D;
        --ok-primary: #3D5A3D;
        --ok-primary-dark: #2E4530;
        --ok-primary-light: #E8F0E8;
        --ok-secondary: #8B7355;
        --ok-secondary-dark: #6B5A43;
        --ok-secondary-light: #F5EFE9;
        --ok-accent: #C0562F;
        --ok-accent-light: #FAE8E2;
        --ok-success: #4A7C59;
        --ok-success-light: #E6F0E9;
        --ok-danger: #A63D40;
        --ok-danger-light: #F8E8E8;
        --ok-warning: #D4A055;
        --ok-warning-light: #FFF3E0;
        --ok-shadow: 0 2px 8px rgba(60, 50, 30, 0.06);
        --ok-shadow-lg: 0 8px 24px rgba(60, 50, 30, 0.1);
        --ok-radius: 12px;
        --ok-radius-lg: 20px;
        --ok-radius-sm: 6px;
        --ok-radius-full: 9999px;
        --ok-transition: all 0.25s ease;
        --ok-font-display: Georgia, 'Times New Roman', serif;
        --ok-font-mono: 'JetBrains Mono', 'Courier New', monospace;
        
        min-height: 100vh;
        background: var(--ok-bg);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: var(--ok-text);
      }

      /* ===== Container ===== */
      .ok-container {
        max-width: 1440px;
        margin: 0 auto;
        padding: 32px 40px;
      }

      @media (max-width: 768px) {
        .ok-container { padding: 20px; }
      }

      /* ===== Header ===== */
      .ok-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 40px;
        gap: 24px;
        flex-wrap: wrap;
      }

      .ok-header-left {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .ok-header-icon {
        width: 64px;
        height: 64px;
        border-radius: var(--ok-radius-lg);
        background: linear-gradient(135deg, var(--ok-primary) 0%, var(--ok-primary-dark) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        color: #fff;
        box-shadow: var(--ok-shadow-lg);
        border: 2px solid rgba(255,255,255,0.2);
      }

      .ok-header-info h1 {
        font-family: var(--ok-font-display);
        font-size: 32px;
        font-weight: 700;
        color: var(--ok-primary-dark);
        margin: 0 0 4px;
        letter-spacing: -0.02em;
      }

      .ok-header-info p {
        font-size: 15px;
        color: var(--ok-text-secondary);
        margin: 0;
      }

      .ok-header-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .ok-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 44px;
        padding: 0 24px;
        border-radius: var(--ok-radius);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--ok-transition);
        border: none;
        white-space: nowrap;
      }

      .ok-btn-primary {
        background: var(--ok-primary);
        color: #fff;
        box-shadow: 0 4px 12px rgba(61, 90, 61, 0.25);
      }

      .ok-btn-primary:hover {
        background: var(--ok-primary-dark);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(61, 90, 61, 0.3);
      }

      .ok-btn-secondary {
        background: var(--ok-secondary-light);
        color: var(--ok-secondary-dark);
        border: 1px solid var(--ok-border);
      }

      .ok-btn-secondary:hover {
        background: var(--ok-secondary);
        color: #fff;
        border-color: var(--ok-secondary);
      }

      .ok-btn-ghost {
        background: transparent;
        color: var(--ok-text-secondary);
        padding: 0 16px;
      }

      .ok-btn-ghost:hover {
        background: var(--ok-secondary-light);
        color: var(--ok-secondary-dark);
      }

      /* ===== Stats ===== */
      .ok-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
        margin-bottom: 32px;
      }

      @media (max-width: 1024px) { .ok-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 640px) { .ok-stats { grid-template-columns: 1fr; } }

      .ok-stat {
        background: var(--ok-bg-card);
        border-radius: var(--ok-radius);
        border: 1px solid var(--ok-border);
        padding: 24px;
        transition: var(--ok-transition);
        position: relative;
        overflow: hidden;
      }

      .ok-stat::before {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 4px; height: 100%;
        background: var(--ok-primary);
        opacity: 0;
        transition: var(--ok-transition);
      }

      .ok-stat:hover {
        border-color: var(--ok-secondary);
        transform: translateY(-2px);
        box-shadow: var(--ok-shadow);
      }

      .ok-stat:hover::before { opacity: 1; }

      .ok-stat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .ok-stat-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--ok-text-muted);
      }

      .ok-stat-icon {
        width: 40px; height: 40px;
        border-radius: var(--ok-radius);
        background: var(--ok-primary-light);
        color: var(--ok-primary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ok-stat-value {
        font-family: var(--ok-font-display);
        font-size: 36px;
        font-weight: 700;
        color: var(--ok-primary-dark);
        line-height: 1;
        margin-bottom: 4px;
      }

      .ok-stat-change {
        font-size: 12px;
        color: var(--ok-text-secondary);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .ok-stat-change.up { color: var(--ok-success); }
      .ok-stat-change.down { color: var(--ok-danger); }

      /* ===== Toolbar ===== */
      .ok-toolbar {
        background: var(--ok-bg-card);
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        padding: 12px 20px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        box-shadow: var(--ok-shadow);
      }

      .ok-search {
        flex: 1;
        min-width: 220px;
        position: relative;
      }

      .ok-search-icon {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--ok-text-muted);
      }

      .ok-search-input {
        width: 100%;
        height: 44px;
        padding: 0 44px 0 48px;
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        background: var(--ok-bg);
        font-size: 15px;
        color: var(--ok-text);
        transition: var(--ok-transition);
      }

      .ok-search-input:focus {
        outline: none;
        border-color: var(--ok-secondary);
        background: #fff;
      }

      .ok-search-clear {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: var(--ok-bg-hover);
        border: none;
        border-radius: 50%;
        width: 26px; height: 26px;
        cursor: pointer;
        color: var(--ok-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--ok-transition);
      }

      .ok-search-clear:hover { background: var(--ok-danger-light); color: var(--ok-danger); }

      .ok-toolbar-group {
        display: flex;
        background: var(--ok-bg);
        border-radius: var(--ok-radius);
        padding: 4px;
        border: 1px solid var(--ok-border);
      }

      .ok-toolbar-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 16px;
        border: none;
        border-radius: calc(var(--ok-radius) - 2px);
        background: transparent;
        color: var(--ok-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--ok-transition);
      }

      .ok-toolbar-btn:hover { background: var(--ok-bg-card); color: var(--ok-primary); }
      .ok-toolbar-btn.active { background: var(--ok-bg-card); color: var(--ok-primary); box-shadow: var(--ok-shadow); }

      /* ===== Filters ===== */
      .ok-filters {
        background: var(--ok-secondary-light);
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        padding: 16px 20px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        animation: ok-slide 0.2s ease;
      }

      @keyframes ok-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

      .ok-filter-group { display: flex; align-items: center; gap: 10px; }
      
      .ok-filter-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--ok-secondary-dark);
      }

      .ok-chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 14px;
        border-radius: var(--ok-radius-full);
        border: 1px solid var(--ok-border);
        background: var(--ok-bg-card);
        font-size: 12px;
        font-weight: 600;
        color: var(--ok-text-secondary);
        cursor: pointer;
        transition: var(--ok-transition);
      }

      .ok-chip:hover { border-color: var(--ok-primary); color: var(--ok-primary); }
      .ok-chip.active { background: var(--ok-primary); border-color: var(--ok-primary); color: #fff; }

      /* ===== Sort Row ===== */
      .ok-sort-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 16px;
      }

      .ok-sort-left { display: flex; align-items: center; gap: 12px; }

      .ok-sort-select {
        padding: 8px 36px 8px 14px;
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        background: var(--ok-bg-card);
        font-size: 13px;
        font-weight: 600;
        color: var(--ok-text);
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A957D' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
      }

      .ok-sort-btn {
        width: 36px; height: 36px;
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        background: var(--ok-bg-card);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ok-text-muted);
        transition: var(--ok-transition);
      }

      .ok-sort-btn:hover { border-color: var(--ok-primary); color: var(--ok-primary); }

      .ok-results-count { font-size: 14px; color: var(--ok-text-secondary); }
      .ok-results-count strong { color: var(--ok-primary); font-weight: 700; }

      .ok-bulk-actions { display: flex; align-items: center; gap: 8px; }

      .ok-bulk-btn {
        padding: 8px 14px;
        border-radius: var(--ok-radius);
        border: 1px solid var(--ok-border);
        background: var(--ok-bg-card);
        font-size: 12px;
        font-weight: 600;
        color: var(--ok-text-secondary);
        cursor: pointer;
        transition: var(--ok-transition);
      }
      .ok-bulk-btn:hover { background: var(--ok-bg-hover); }
      .ok-bulk-btn.danger:hover { background: var(--ok-danger); border-color: var(--ok-danger); color: #fff; }

      /* ===== Grid View ===== */
      .ok-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 24px;
      }
      .ok-grid.dense { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
      .ok-grid.compact { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

      /* ===== Card ===== */
      .ok-card {
        background: var(--ok-bg-card);
        border-radius: var(--ok-radius);
        border: 1px solid var(--ok-border);
        overflow: hidden;
        transition: var(--ok-transition);
        display: flex;
        flex-direction: column;
      }

      .ok-card:hover {
        border-color: var(--ok-secondary);
        box-shadow: var(--ok-shadow-lg);
        transform: translateY(-4px);
      }

      /* Code Strip */
      .ok-card-code-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        background: var(--ok-secondary);
        color: #fff;
      }

      .ok-card-code-main {
        font-family: var(--ok-font-mono);
        font-size: 14px;
        font-weight: 700;
        background: rgba(255,255,255,0.2);
        padding: 6px 12px;
        border-radius: var(--ok-radius-sm);
        letter-spacing: 0.04em;
      }

      .ok-card-code-cat {
        font-size: 10px;
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .ok-card-flags { display: flex; gap: 6px; }

      .ok-card-flag {
        width: 28px; height: 28px;
        border-radius: 50%;
        background: rgba(255,255,255,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      .ok-card-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }

      .ok-card-title {
        font-family: var(--ok-font-display);
        font-size: 20px;
        font-weight: 700;
        color: var(--ok-primary-dark);
        margin: 0 0 6px;
        line-height: 1.3;
      }

      .ok-card-category {
        font-size: 13px;
        color: var(--ok-secondary-dark);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }

      .ok-card-desc {
        font-size: 14px;
        color: var(--ok-text-secondary);
        line-height: 1.5;
        margin-bottom: 12px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        flex: 1;
      }

      .ok-card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }

      .ok-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        background: var(--ok-primary-light);
        border-radius: var(--ok-radius-full);
        color: var(--ok-primary-dark);
      }

      .ok-card-meta {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px dashed var(--ok-border);
      }

      .ok-meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--ok-text-secondary);
      }

      .ok-card-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 20px;
      }

      .ok-metric {
        text-align: center;
        padding: 14px 8px;
        background: var(--ok-bg);
        border-radius: var(--ok-radius);
      }

      .ok-metric-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--ok-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }

      .ok-metric-value {
        font-family: var(--ok-font-mono);
        font-size: 16px;
        font-weight: 700;
        color: var(--ok-primary);
      }
      .ok-metric-value.warn { color: var(--ok-danger); }

      .ok-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: auto;
        padding-top: 16px;
        border-top: 1px solid var(--ok-border);
      }

      .ok-card-price {
        font-family: var(--ok-font-display);
        font-size: 22px;
        font-weight: 700;
        color: var(--ok-primary-dark);
      }

      .ok-card-actions { display: flex; gap: 6px; }

      .ok-action-btn {
        width: 38px; height: 38px;
        border-radius: var(--ok-radius);
        border: 1px solid var(--ok-border);
        background: var(--ok-bg-card);
        color: var(--ok-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--ok-transition);
        font-size: 16px;
      }

      .ok-action-btn:hover { border-color: var(--ok-primary); color: var(--ok-primary); background: var(--ok-primary-light); }
      .ok-action-btn.danger:hover { border-color: var(--ok-danger); color: var(--ok-danger); background: var(--ok-danger-light); }
      .ok-action-btn.active { background: var(--ok-primary); border-color: var(--ok-primary); color: #fff; }

      .ok-select-check {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: var(--ok-radius);
        border: 1px dashed var(--ok-border);
        cursor: pointer;
        font-size: 12px;
        color: var(--ok-text-muted);
      }
      .ok-select-check input { width: 16px; height: 16px; accent-color: var(--ok-primary); }

      /* ===== List View ===== */
      .ok-list { display: flex; flex-direction: column; gap: 10px; }

      .ok-list-item {
        background: var(--ok-bg-card);
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 20px;
        transition: var(--ok-transition);
      }

      .ok-list-item:hover { border-color: var(--ok-secondary); background: #fff; }

      .ok-list-code {
        font-family: var(--ok-font-mono);
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        background: var(--ok-secondary);
        padding: 8px 14px;
        border-radius: var(--ok-radius);
        min-width: 90px;
        text-align: center;
      }

      .ok-list-icon {
        width: 50px; height: 50px;
        border-radius: var(--ok-radius);
        background: var(--ok-primary-light);
        color: var(--ok-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
      }

      .ok-list-content { flex: 1; min-width: 0; }

      .ok-list-title {
        font-family: var(--ok-font-display);
        font-size: 17px;
        font-weight: 700;
        color: var(--ok-primary-dark);
        margin-bottom: 4px;
      }

      .ok-list-meta {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: var(--ok-text-secondary);
      }

      .ok-list-stats {
        display: flex;
        align-items: center;
        gap: 24px;
      }

      .ok-list-stat-label {
        font-size: 10px;
        color: var(--ok-text-muted);
        text-transform: uppercase;
      }
      .ok-list-stat-value { font-family: var(--ok-font-mono); font-size: 15px; font-weight: 700; color: var(--ok-primary); }

      /* ===== Table View ===== */
      .ok-table-wrap {
        background: var(--ok-bg-card);
        border: 1px solid var(--ok-border);
        border-radius: var(--ok-radius);
        overflow: hidden;
      }

      .ok-table { width: 100%; border-collapse: collapse; font-size: 14px; }

      .ok-table th {
        background: var(--ok-secondary-light);
        padding: 14px 16px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        color: var(--ok-secondary-dark);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 2px solid var(--ok-border);
      }

      .ok-table td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--ok-border);
        color: var(--ok-text-secondary);
        vertical-align: middle;
      }

      .ok-table tr:hover td { background: var(--ok-bg-hover); }
      .ok-table tr:last-child td { border-bottom: none; }

      .ok-table-code {
        font-family: var(--ok-font-mono);
        font-size: 12px;
        font-weight: 700;
        color: #fff;
        background: var(--ok-secondary);
        padding: 6px 12px;
        border-radius: var(--ok-radius-sm);
        display: inline-block;
      }

      .ok-table-name { font-weight: 700; color: var(--ok-text); font-family: var(--ok-font-display); }
      .ok-table-cat { font-size: 12px; color: var(--ok-text-muted); display: block; }

      /* ===== Empty State ===== */
      .ok-empty {
        text-align: center;
        padding: 80px 40px;
        background: var(--ok-bg-card);
        border-radius: var(--ok-radius);
        border: 1px dashed var(--ok-border);
      }

      .ok-empty-icon { font-size: 56px; margin-bottom: 16px; display: block; }
      .ok-empty-title { font-family: var(--ok-font-display); font-size: 22px; font-weight: 700; color: var(--ok-primary-dark); margin-bottom: 8px; }
      .ok-empty-text { font-size: 15px; color: var(--ok-text-secondary); margin-bottom: 24px; }
      .ok-empty-actions { display: flex; gap: 12px; justify-content: center; }

      /* ===== Loading ===== */
      .ok-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: var(--ok-bg-card);
        border-radius: var(--ok-radius);
        border: 1px solid var(--ok-border);
      }

      .ok-spinner {
        width: 48px; height: 48px;
        border: 3px solid var(--ok-border);
        border-top-color: var(--ok-primary);
        border-radius: 50%;
        animation: ok-spin 0.8s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes ok-spin { to { transform: rotate(360deg); } }
      .ok-loading-text { font-size: 15px; color: var(--ok-text-secondary); }

      /* ===== Error ===== */
      .ok-error {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: var(--ok-danger-light);
        border: 1px solid rgba(166, 61, 64, 0.3);
        border-radius: var(--ok-radius);
        margin-bottom: 24px;
        color: var(--ok-danger);
        font-size: 14px;
        font-weight: 600;
      }
      .ok-error-close { margin-left: auto; background: none; border: none; color: var(--ok-danger); cursor: pointer; padding: 4px; border-radius: 4px; }
      .ok-error-close:hover { background: rgba(166, 61, 64, 0.1); }

      /* ===== Toast ===== */
      .ok-toast-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 9999; }

      .ok-toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 24px;
        background: var(--ok-bg-card);
        border-radius: var(--ok-radius);
        box-shadow: var(--ok-shadow-lg);
        border-left: 4px solid var(--ok-primary);
        animation: ok-toast-in 0.3s ease;
        max-width: 380px;
      }

      @keyframes ok-toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      .ok-toast.success { border-left-color: var(--ok-success); }
      .ok-toast.error { border-left-color: var(--ok-danger); }

      .ok-toast-icon { font-size: 18px; width: 24px; text-align: center; }
      .ok-toast-msg { flex: 1; font-size: 14px; color: var(--ok-text); }
      .ok-toast-close { background: none; border: none; color: var(--ok-text-muted); cursor: pointer; padding: 4px; border-radius: 4px; }
      .ok-toast-close:hover { background: var(--ok-bg-hover); }

      /* ===== Responsive ===== */
      @media (max-width: 768px) {
        .ok-header { flex-direction: column; align-items: stretch; }
        .ok-header-left { flex-direction: column; align-items: flex-start; }
        .ok-toolbar { flex-direction: column; align-items: stretch; }
        .ok-search { width: 100%; }
        .ok-sort-row { flex-direction: column; align-items: stretch; }
        .ok-grid { grid-template-columns: 1fr !important; }
        .ok-list-item { flex-direction: column; align-items: stretch; }
        .ok-list-stats { flex-wrap: wrap; }
      }

      /* ===== Scrollbar ===== */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: var(--ok-bg); }
      ::-webkit-scrollbar-thumb { background: var(--ok-border-dark); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--ok-secondary); }
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
  const [filters, setFilters] = useLocalStorage<FilterType>('gc:filters', { categories: [], cuisines: [], difficulty: [], isFeatured: null, isFavorite: null, isSubrecipe: null })

  const debouncedQ = useDebounce(q, 300)

  const ingById = useMemo(() => { const m = new Map<string, Ingredient>(); for (const i of ingredients) m.set(i.id, i); return m }, [ingredients])

  const filteredRecipes = useMemo(() => {
    let list = recipes
    if (debouncedQ) { const query = debouncedQ.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(query) || r.code?.toLowerCase().includes(query) || r.category?.toLowerCase().includes(query) || r.cuisine?.toLowerCase().includes(query) || r.tags?.some(tag => tag.toLowerCase().includes(query))) }
    if (!showArchived) list = list.filter(r => !r.is_archived)
    if (filters.categories.length > 0) list = list.filter(r => r.category && filters.categories.includes(r.category))
    return list
  }, [recipes, debouncedQ, showArchived, filters])

  const sortedRecipes = useMemo(() => {
    return [...filteredRecipes].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name': comparison = a.name.localeCompare(b.name); break;
        case 'code': comparison = (a.code || '').localeCompare(b.code || ''); break;
        case 'category': comparison = (a.category || '').localeCompare(b.category || ''); break;
        case 'price': comparison = (a.selling_price || 0) - (b.selling_price || 0); break;
        case 'cost': comparison = (costCache[a.id]?.totalCost || 0) - (costCache[b.id]?.totalCost || 0); break;
        case 'margin': comparison = (costCache[a.id]?.margin || 0) - (costCache[b.id]?.margin || 0); break;
        case 'date': comparison = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(); break;
        default: comparison = 0;
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
    try { const next = !r.is_archived; const { error } = await supabase.from('recipes').update({ is_archived: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_archived: next } : x)); showToast('success', next ? 'Archived' : 'Restored') } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])
  
  const toggleFeatured = useCallback(async (r: RecipeRow) => {
    try { const next = !r.is_featured; const { error } = await supabase.from('recipes').update({ is_featured: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_featured: next } : x)); showToast('success', next ? 'Featured' : 'Unfeatured') } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])
  
  const toggleFavorite = useCallback(async (r: RecipeRow) => {
    try { const next = !r.is_favorite; const { error } = await supabase.from('recipes').update({ is_favorite: next, updated_at: new Date().toISOString() }).eq('id', r.id); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x)); showToast('success', next ? 'Favorited' : 'Unfavorited') } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])

  const toggleSelect = useCallback((id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] })), [])
  const clearSelection = useCallback(() => setSelected({}), [])
  const selectAll = useCallback(() => { const newSelected: Record<string, boolean> = {}; sortedRecipes.forEach(r => { newSelected[r.id] = true }); setSelected(newSelected) }, [sortedRecipes])

  const bulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return; if (!window.confirm(`Archive ${selectedIds.length} recipes?`)) return
    try { const { error } = await supabase.from('recipes').update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', selectedIds); if (error) throw error; if (mountedRef.current) { setRecipes(prev => prev.map(r => selectedIds.includes(r.id) ? { ...r, is_archived: true } : r)); setSelected({}); showToast('success', `${selectedIds.length} archived`) } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [selectedIds])

  const bulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return; if (!window.confirm(`Delete ${selectedIds.length} recipes permanently?`)) return
    try { await supabase.from('recipe_lines').delete().in('recipe_id', selectedIds); const { error: rErr } = await supabase.from('recipes').delete().in('id', selectedIds); if (rErr) throw rErr; if (mountedRef.current) { setRecipes(prev => prev.filter(r => !selectedIds.includes(r.id))); setRecipeLinesCache(prev => { const next = { ...prev }; selectedIds.forEach(id => delete next[id]); return next }); setSelected({}); showToast('success', `${selectedIds.length} deleted`); CacheManager.clear(CACHE_KEYS.RECIPES_CACHE) } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [selectedIds])

  const deleteOneRecipe = useCallback(async (recipeId: string) => {
    if (!window.confirm('Delete this recipe?')) return
    try { await supabase.from('recipe_lines').delete().eq('recipe_id', recipeId); const { error: rErr } = await supabase.from('recipes').delete().eq('id', recipeId); if (rErr) throw rErr; if (mountedRef.current) { setRecipes(prev => prev.filter(r => r.id !== recipeId)); setRecipeLinesCache(prev => { const next = { ...prev }; delete next[recipeId]; return next }); setSelected(prev => { const next = { ...prev }; delete next[recipeId]; return next }); showToast('success', 'Deleted'); CacheManager.clear(CACHE_KEYS.RECIPES_CACHE) } }
    catch (e: any) { showToast('error', e?.message || 'Failed') }
  }, [])

  // ===== Render Functions =====
  const renderGridView = () => (
    <div className={`ok-grid ${density}`}>
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase();
          const portions = toNum(r.portions, 1); const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0);
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2, delay: index * 0.02 }} layout>
              <div className="ok-card">
                <div className="ok-card-code-strip">
                  <div><span className="ok-card-code-main">{formatRecipeCode(r.code)}</span> {r.code_category && <span className="ok-card-code-cat">{r.code_category}</span>}</div>
                  <div className="ok-card-flags">
                    {r.is_favorite && <span className="ok-card-flag" title="Favorite">♥</span>}
                    {r.is_featured && <span className="ok-card-flag" title="Featured">★</span>}
                    {r.is_subrecipe && <span className="ok-card-flag" title="Subrecipe">◈</span>}
                  </div>
                </div>
                <div className="ok-card-body">
                  <h3 className="ok-card-title">{r.name}</h3>
                  <div className="ok-card-category">
                    <span>{r.category || 'Uncategorized'}</span>
                    {r.cuisine && <span>• {r.cuisine}</span>}
                    {r.is_archived && <span style={{ color: 'var(--ok-danger)' }}>• Archived</span>}
                  </div>
                  {r.description && <p className="ok-card-desc">{r.description}</p>}
                  {r.tags && r.tags.length > 0 && (<div className="ok-card-tags">{r.tags.slice(0, 3).map(tag => <span key={tag} className="ok-tag">{tag}</span>)}</div>)}
                  <div className="ok-card-meta">
                    <span className="ok-meta-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg> {portions}</span>
                    <span className="ok-meta-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {formatTime(totalTime)}</span>
                  </div>
                  <div className="ok-card-metrics">
                    <div className="ok-metric"><div className="ok-metric-label">Cost</div><div className="ok-metric-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div></div>
                    <div className="ok-metric"><div className="ok-metric-label">FC%</div><div className={`ok-metric-value ${c?.fcPct && c.fcPct > 30 ? 'warn' : ''}`}>{c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}</div></div>
                    <div className="ok-metric"><div className="ok-metric-label">Margin</div><div className="ok-metric-value">{c ? formatCurrency(c.margin, cur) : '—'}</div></div>
                  </div>
                  <div className="ok-card-footer">
                    <div className="ok-card-price">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div>
                    <div className="ok-card-actions">
                      <button className={`ok-action-btn ${r.is_favorite ? 'active' : ''}`} onClick={() => toggleFavorite(r)} title="Favorite">{r.is_favorite ? '♥' : '♡'}</button>
                      <button className={`ok-action-btn ${r.is_featured ? 'active' : ''}`} onClick={() => toggleFeatured(r)} title="Featured">{r.is_featured ? '★' : '☆'}</button>
                      <button className="ok-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)} title="Edit">✎</button>
                      <button className="ok-action-btn" onClick={() => toggleArchive(r)} title="Archive">{r.is_archived ? '↩' : '📥'}</button>
                      <button className="ok-action-btn danger" onClick={() => deleteOneRecipe(r.id)} title="Delete">✕</button>
                      <label className="ok-select-check"><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/></label>
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
    <div className="ok-list">
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase(); const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0);
          return (
            <motion.div key={r.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.15, delay: index * 0.01 }} layout>
              <div className="ok-list-item">
                <div className="ok-list-code">{formatRecipeCode(r.code)}</div>
                <div className="ok-list-icon">{r.cuisine === 'italian' ? '🍝' : r.cuisine === 'asian' ? '🍜' : '🍽'}</div>
                <div className="ok-list-content">
                  <div className="ok-list-title">{r.name}</div>
                  <div className="ok-list-meta"><span>{r.category || '—'}</span> <span>•</span> <span>{r.portions} portions</span> <span>•</span> <span>{formatTime(totalTime)}</span></div>
                </div>
                <div className="ok-list-stats">
                  <div className="ok-list-stat"><div className="ok-list-stat-label">Cost</div><div className="ok-list-stat-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div></div>
                  <div className="ok-list-stat"><div className="ok-list-stat-label">Price</div><div className="ok-list-stat-value">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div></div>
                </div>
                <div className="ok-card-actions">
                  <button className="ok-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                  <label className="ok-select-check"><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/></label>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )

  const renderTableView = () => (
    <div className="ok-table-wrap">
      <table className="ok-table">
        <thead><tr><th style={{width:40}}>✓</th><th style={{width:100}}>Code</th><th>Name</th><th>Category</th><th style={{width:80}}>Portions</th><th style={{width:80}}>Time</th><th style={{width:100}}>Cost</th><th style={{width:100}}>Price</th><th style={{width:70}}>FC%</th><th style={{width:80}}></th></tr></thead>
        <tbody>
          {sortedRecipes.map(r => {
            const c = costCache[r.id]; const cur = (r.currency || 'USD').toUpperCase(); const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0);
            return (
              <tr key={r.id}>
                <td><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/></td>
                <td><span className="ok-table-code">{formatRecipeCode(r.code)}</span></td>
                <td><span className="ok-table-name">{r.name}</span><span className="ok-table-cat">{r.cuisine || ''}</span></td>
                <td>{r.category || '—'}</td>
                <td>{r.portions}</td>
                <td>{formatTime(totalTime)}</td>
                <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
                <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
                <td>{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</td>
                <td><div className="ok-card-actions"><button className="ok-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button></div></td>
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
      <div className="ok-app">
        <div className="ok-container">
          {/* Header */}
          <header className="ok-header">
            <div className="ok-header-left">
              <div className="ok-header-icon">🌿</div>
              <div className="ok-header-info"><h1>Recipe Collection</h1><p>{isMgmt ? 'Costing & Analytics' : 'Kitchen Operations'}</p></div>
            </div>
            <div className="ok-header-actions">
              <button className="ok-btn ok-btn-primary" onClick={createNewRecipe}>+ New Recipe</button>
              <button className="ok-btn ok-btn-secondary" onClick={() => loadAll(true)}>↻ Sync</button>
              <button className="ok-btn ok-btn-ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide Archived' : 'Show Archived'}</button>
            </div>
          </header>

          {/* Stats */}
          <div className="ok-stats">
            <div className="ok-stat"><div className="ok-stat-header"><span className="ok-stat-label">Total Recipes</span><div className="ok-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg></div></div><div className="ok-stat-value">{stats.total}</div><div className="ok-stat-change up">↑ {stats.active} active</div></div>
            <div className="ok-stat"><div className="ok-stat-header"><span className="ok-stat-label">Featured</span><div className="ok-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div></div><div className="ok-stat-value">{stats.featured}</div><div className="ok-stat-change">{stats.favorites} favorites</div></div>
            <div className="ok-stat"><div className="ok-stat-header"><span className="ok-stat-label">Average Cost</span><div className="ok-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div></div><div className="ok-stat-value">{formatCurrency(stats.avgCost)}</div><div className="ok-stat-change">per portion</div></div>
            <div className="ok-stat"><div className="ok-stat-header"><span className="ok-stat-label">Avg Margin</span><div className="ok-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg></div></div><div className="ok-stat-value">{formatPercentage(stats.avgMargin)}</div><div className="ok-stat-change down">↓ {stats.archived} archived</div></div>
          </div>

          {/* Toolbar */}
          <div className="ok-toolbar">
            <div className="ok-search">
              <svg className="ok-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="ok-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code, category..."/>
              {q && <button className="ok-search-clear" onClick={() => setQ('')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            </div>
            <button className={`ok-btn ok-btn-ghost ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}>Filters</button>
            <div className="ok-toolbar-group">
              <button className={`ok-toolbar-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>Grid</button>
              <button className={`ok-toolbar-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>List</button>
              <button className={`ok-toolbar-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>Table</button>
            </div>
            <button className="ok-btn ok-btn-ghost" onClick={() => setDensity(d => d === 'comfortable' ? 'dense' : d === 'dense' ? 'compact' : 'comfortable')}>{density === 'comfortable' ? 'Comfort' : density === 'dense' ? 'Dense' : 'Compact'}</button>
          </div>

          {/* Filters */}
          {showFilters && (
            <motion.div className="ok-filters" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="ok-filter-group"><span className="ok-filter-label">Category</span><button className="ok-chip active">All</button><button className="ok-chip">Main</button><button className="ok-chip">Dessert</button></div>
              <div className="ok-filter-group"><span className="ok-filter-label">Difficulty</span><button className="ok-chip">Easy</button><button className="ok-chip">Medium</button><button className="ok-chip">Hard</button></div>
              <button className="ok-btn ok-btn-ghost" onClick={() => setFilters({ categories: [], cuisines: [], difficulty: [], isFeatured: null, isFavorite: null, isSubrecipe: null })}>Clear All</button>
            </motion.div>
          )}

          {/* Sort Row */}
          <div className="ok-sort-row">
            <div className="ok-sort-left">
              <span style={{fontSize: '13px', color: 'var(--ok-text-secondary)'}}>Sort by</span>
              <select className="ok-sort-select" value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                <option value="name">Name</option><option value="code">Code</option><option value="category">Category</option><option value="price">Price</option><option value="cost">Cost</option><option value="date">Date</option>
              </select>
              <button className="ok-sort-btn" onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}>{sortOrder === 'asc' ? '↑' : '↓'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="ok-results-count"><strong>{sortedRecipes.length}</strong> of {recipes.length} recipes</span>
              {selectedIds.length > 0 && (<div className="ok-bulk-actions"><span style={{fontSize: '13px', color: 'var(--ok-text-secondary)' }}>{selectedIds.length} selected</span><button className="ok-bulk-btn" onClick={bulkArchive}>Archive</button><button className="ok-bulk-btn danger" onClick={bulkDelete}>Delete</button><button className="ok-bulk-btn" onClick={clearSelection}>Clear</button></div>)}
            </div>
          </div>

          {/* Error */}
          {err && <div className="ok-error"><span>⚠️</span><span>{err}</span><button className="ok-error-close" onClick={() => setErr(null)}>✕</button></div>}

          {/* Content */}
          {loading ? (
            <div className="ok-loading"><div className="ok-spinner"/><div className="ok-loading-text">Loading recipes...</div></div>
          ) : !sortedRecipes.length ? (
            <div className="ok-empty">
              <span className="ok-empty-icon">🌿</span>
              <div className="ok-empty-title">{!hasAnyRecipes ? 'No recipes yet' : showArchivedEmptyHint ? 'All recipes are archived' : hasSearch ? 'No matches found' : 'No recipes'}</div>
              <div className="ok-empty-text">{!hasAnyRecipes ? 'Create your first recipe to get started' : showArchivedEmptyHint ? 'Toggle "Show Archived" or create a new recipe' : hasSearch ? 'Try a different search term' : 'Start by creating a recipe'}</div>
              <div className="ok-empty-actions"><button className="ok-btn ok-btn-primary" onClick={createNewRecipe}>Create Recipe</button></div>
            </div>
          ) : (<>{viewMode === 'grid' && renderGridView()}{viewMode === 'list' && renderListView()}{viewMode === 'table' && renderTableView()}</>)}
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>{toast && <motion.div className="ok-toast-wrap" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}><div className={`ok-toast ${toast.type}`}><span className="ok-toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span><span className="ok-toast-msg">{toast.message}</span><button className="ok-toast-close" onClick={() => setToast(null)}>✕</button></div></motion.div>}</AnimatePresence>
    </>
  )
}
