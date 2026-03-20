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
function HeritageStyles() {
  return (
    <style>{`
      /* ===== Heritage Kitchen Design System ===== */
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
      
      .hk {
        /* === Color Palette === */
        --hk-burgundy: #6B2D3C;
        --hk-burgundy-dark: #4A1F2A;
        --hk-burgundy-light: #8B3D4F;
        --hk-gold: #B8860B;
        --hk-gold-dark: #8B6914;
        --hk-gold-light: #DAA520;
        --hk-sage: #2D6A4F;
        --hk-sage-light: #40916C;
        --hk-espresso: #3D261A;
        --hk-parchment: #FAF6F0;
        --hk-cream: #FFF8EE;
        --hk-cinnamon: #A0522D;
        --hk-cinnamon-light: #CD853F;
        
        /* === Functional Colors === */
        --hk-bg: var(--hk-parchment);
        --hk-bg-card: #FFFFFF;
        --hk-bg-elevated: #FFFFFF;
        --hk-bg-hover: #F5EFE6;
        --hk-border: #E8DFD4;
        --hk-border-dark: #D4C9BA;
        --hk-text: var(--hk-espresso);
        --hk-text-secondary: #6B5B4F;
        --hk-text-muted: #9A8A7A;
        --hk-primary: var(--hk-burgundy);
        --hk-primary-dark: var(--hk-burgundy-dark);
        --hk-primary-light: #F5E6EA;
        --hk-secondary: var(--hk-gold);
        --hk-secondary-dark: var(--hk-gold-dark);
        --hk-secondary-light: #FDF5E6;
        --hk-success: var(--hk-sage);
        --hk-success-light: #E8F5ED;
        --hk-danger: #8B3A3A;
        --hk-danger-light: #FAE8E8;
        --hk-warning: var(--hk-cinnamon);
        --hk-warning-light: #FDF0E6;
        
        /* === Typography === */
        --hk-font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
        --hk-font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        --hk-font-mono: 'JetBrains Mono', 'SF Mono', 'Courier New', monospace;
        
        /* === Spacing & Sizing === */
        --hk-shadow-sm: 0 1px 3px rgba(61, 38, 26, 0.04);
        --hk-shadow: 0 4px 12px rgba(61, 38, 26, 0.06);
        --hk-shadow-lg: 0 12px 32px rgba(61, 38, 26, 0.1);
        --hk-shadow-xl: 0 20px 40px rgba(61, 38, 26, 0.12);
        --hk-radius-sm: 4px;
        --hk-radius: 8px;
        --hk-radius-lg: 16px;
        --hk-radius-xl: 24px;
        --hk-radius-full: 9999px;
        --hk-transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        
        min-height: 100vh;
        background: var(--hk-bg);
        font-family: var(--hk-font-body);
        color: var(--hk-text);
        line-height: 1.5;
      }

      /* ===== Background Pattern ===== */
      .hk::before {
        content: '';
        position: fixed;
        inset: 0;
        background-image: 
          radial-gradient(circle at 20% 80%, rgba(184, 134, 11, 0.03) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(107, 45, 60, 0.03) 0%, transparent 50%);
        pointer-events: none;
        z-index: 0;
      }

      /* ===== Container ===== */
      .hk-container {
        position: relative;
        z-index: 1;
        max-width: 1440px;
        margin: 0 auto;
        padding: 40px 48px;
      }

      @media (max-width: 768px) {
        .hk-container { padding: 20px; }
      }

      /* ===== Page Header ===== */
      .hk-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 32px;
        margin-bottom: 48px;
        flex-wrap: wrap;
      }

      .hk-header-left {
        display: flex;
        align-items: center;
        gap: 24px;
      }

      .hk-header-emblem {
        width: 72px;
        height: 72px;
        background: linear-gradient(135deg, var(--hk-burgundy) 0%, var(--hk-burgundy-dark) 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 
          0 4px 16px rgba(107, 45, 60, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        position: relative;
        flex-shrink: 0;
      }

      .hk-header-emblem::before {
        content: '';
        position: absolute;
        inset: -3px;
        border: 2px solid var(--hk-gold);
        border-radius: 50%;
        opacity: 0.4;
      }

      .hk-header-emblem span {
        font-size: 28px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
      }

      .hk-header-info h1 {
        font-family: var(--hk-font-display);
        font-size: 36px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
        margin: 0 0 6px;
        letter-spacing: -0.02em;
        line-height: 1.1;
      }

      .hk-header-info p {
        font-size: 15px;
        color: var(--hk-text-secondary);
        margin: 0;
        font-weight: 500;
      }

      .hk-header-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      /* ===== Buttons ===== */
      .hk-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 46px;
        padding: 0 24px;
        border-radius: var(--hk-radius);
        font-family: var(--hk-font-body);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--hk-transition);
        border: none;
        white-space: nowrap;
        text-decoration: none;
      }

      .hk-btn-primary {
        background: linear-gradient(135deg, var(--hk-burgundy) 0%, var(--hk-burgundy-dark) 100%);
        color: #FFFFFF;
        box-shadow: 0 4px 12px rgba(107, 45, 60, 0.25);
      }

      .hk-btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(107, 45, 60, 0.35);
      }

      .hk-btn-secondary {
        background: linear-gradient(135deg, var(--hk-gold) 0%, var(--hk-gold-dark) 100%);
        color: #FFFFFF;
        box-shadow: 0 4px 12px rgba(184, 134, 11, 0.2);
      }

      .hk-btn-secondary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(184, 134, 11, 0.3);
      }

      .hk-btn-ghost {
        background: transparent;
        color: var(--hk-text-secondary);
        border: 1px solid var(--hk-border);
      }

      .hk-btn-ghost:hover {
        background: var(--hk-bg-hover);
        border-color: var(--hk-primary);
        color: var(--hk-primary);
      }

      .hk-btn-sm {
        height: 38px;
        padding: 0 16px;
        font-size: 13px;
      }

      /* ===== Stats Panel ===== */
      .hk-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 24px;
        margin-bottom: 40px;
      }

      @media (max-width: 1024px) { .hk-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 640px) { .hk-stats { grid-template-columns: 1fr; } }

      .hk-stat {
        background: var(--hk-bg-card);
        border-radius: var(--hk-radius-lg);
        border: 1px solid var(--hk-border);
        padding: 24px 28px;
        position: relative;
        overflow: hidden;
        transition: var(--hk-transition);
      }

      .hk-stat::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(180deg, var(--hk-gold) 0%, var(--hk-burgundy) 100%);
        opacity: 0;
        transition: var(--hk-transition);
      }

      .hk-stat::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 80px;
        height: 80px;
        background: radial-gradient(circle at top right, rgba(184, 134, 11, 0.05), transparent 70%);
        pointer-events: none;
      }

      .hk-stat:hover {
        border-color: var(--hk-gold);
        box-shadow: var(--hk-shadow);
        transform: translateY(-2px);
      }

      .hk-stat:hover::before { opacity: 1; }

      .hk-stat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }

      .hk-stat-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--hk-text-muted);
      }

      .hk-stat-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--hk-radius);
        background: var(--hk-primary-light);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--hk-primary);
      }

      .hk-stat-value {
        font-family: var(--hk-font-display);
        font-size: 38px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
        line-height: 1;
        margin-bottom: 6px;
      }

      .hk-stat-change {
        font-size: 12px;
        color: var(--hk-text-secondary);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .hk-stat-change.up { color: var(--hk-sage); }
      .hk-stat-change.down { color: var(--hk-danger); }

      /* ===== Toolbar ===== */
      .hk-toolbar {
        background: var(--hk-bg-card);
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius-lg);
        padding: 16px 24px;
        margin-bottom: 28px;
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        box-shadow: var(--hk-shadow-sm);
      }

      .hk-search {
        flex: 1;
        min-width: 240px;
        position: relative;
      }

      .hk-search-icon {
        position: absolute;
        left: 18px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--hk-text-muted);
      }

      .hk-search-input {
        width: 100%;
        height: 46px;
        padding: 0 48px 0 50px;
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius);
        background: var(--hk-bg);
        font-family: var(--hk-font-body);
        font-size: 15px;
        color: var(--hk-text);
        transition: var(--hk-transition);
      }

      .hk-search-input:focus {
        outline: none;
        border-color: var(--hk-gold);
        background: #FFFFFF;
        box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.1);
      }

      .hk-search-clear {
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        background: var(--hk-bg-hover);
        border: none;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        cursor: pointer;
        color: var(--hk-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--hk-transition);
      }

      .hk-search-clear:hover {
        background: var(--hk-danger-light);
        color: var(--hk-danger);
      }

      .hk-toolbar-group {
        display: flex;
        background: var(--hk-bg);
        border-radius: var(--hk-radius);
        padding: 4px;
        border: 1px solid var(--hk-border);
      }

      .hk-toolbar-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 38px;
        padding: 0 18px;
        border: none;
        border-radius: calc(var(--hk-radius) - 2px);
        background: transparent;
        color: var(--hk-text-secondary);
        font-family: var(--hk-font-body);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: var(--hk-transition);
      }

      .hk-toolbar-btn:hover {
        background: var(--hk-bg-card);
        color: var(--hk-primary);
      }

      .hk-toolbar-btn.active {
        background: var(--hk-bg-card);
        color: var(--hk-burgundy);
        box-shadow: var(--hk-shadow-sm);
      }

      /* ===== Filters ===== */
      .hk-filters {
        background: linear-gradient(135deg, var(--hk-secondary-light) 0%, #FFFFFF 100%);
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius-lg);
        padding: 20px 24px;
        margin-bottom: 28px;
        display: flex;
        align-items: center;
        gap: 24px;
        flex-wrap: wrap;
        animation: hk-slide 0.25s ease;
      }

      @keyframes hk-slide {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .hk-filter-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .hk-filter-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--hk-gold-dark);
      }

      .hk-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 8px 16px;
        border-radius: var(--hk-radius-full);
        border: 1px solid var(--hk-border);
        background: var(--hk-bg-card);
        font-family: var(--hk-font-body);
        font-size: 12px;
        font-weight: 600;
        color: var(--hk-text-secondary);
        cursor: pointer;
        transition: var(--hk-transition);
      }

      .hk-chip:hover {
        border-color: var(--hk-gold);
        color: var(--hk-gold-dark);
      }

      .hk-chip.active {
        background: linear-gradient(135deg, var(--hk-gold) 0%, var(--hk-gold-dark) 100%);
        border-color: transparent;
        color: #FFFFFF;
        box-shadow: 0 2px 8px rgba(184, 134, 11, 0.25);
      }

      /* ===== Sort Row ===== */
      .hk-sort-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
      }

      .hk-sort-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .hk-sort-label {
        font-size: 13px;
        color: var(--hk-text-secondary);
        font-weight: 500;
      }

      .hk-sort-select {
        padding: 10px 40px 10px 16px;
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius);
        background: var(--hk-bg-card);
        font-family: var(--hk-font-body);
        font-size: 14px;
        font-weight: 600;
        color: var(--hk-text);
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B5B4F' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 14px center;
        transition: var(--hk-transition);
      }

      .hk-sort-select:hover {
        border-color: var(--hk-gold);
      }

      .hk-sort-btn {
        width: 40px;
        height: 40px;
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius);
        background: var(--hk-bg-card);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--hk-text-muted);
        font-size: 16px;
        transition: var(--hk-transition);
      }

      .hk-sort-btn:hover {
        border-color: var(--hk-gold);
        color: var(--hk-gold);
      }

      .hk-results-count {
        font-size: 14px;
        color: var(--hk-text-secondary);
      }

      .hk-results-count strong {
        color: var(--hk-burgundy);
        font-weight: 700;
      }

      .hk-bulk-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .hk-bulk-btn {
        padding: 8px 16px;
        border-radius: var(--hk-radius);
        border: 1px solid var(--hk-border);
        background: var(--hk-bg-card);
        font-family: var(--hk-font-body);
        font-size: 13px;
        font-weight: 600;
        color: var(--hk-text-secondary);
        cursor: pointer;
        transition: var(--hk-transition);
      }

      .hk-bulk-btn:hover {
        background: var(--hk-bg-hover);
        border-color: var(--hk-primary);
        color: var(--hk-primary);
      }

      .hk-bulk-btn.danger:hover {
        background: var(--hk-danger);
        border-color: var(--hk-danger);
        color: #FFFFFF;
      }

      /* ===== Grid View ===== */
      .hk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 28px;
      }

      .hk-grid.dense {
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      .hk-grid.compact {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }

      /* ===== Recipe Card ===== */
      .hk-card {
        background: var(--hk-bg-card);
        border-radius: var(--hk-radius-lg);
        border: 1px solid var(--hk-border);
        overflow: hidden;
        transition: var(--hk-transition);
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .hk-card::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(135deg, transparent 0%, rgba(184, 134, 11, 0) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        opacity: 0;
        transition: var(--hk-transition);
        pointer-events: none;
      }

      .hk-card:hover {
        border-color: var(--hk-gold);
        box-shadow: var(--hk-shadow-lg);
        transform: translateY(-4px);
      }

      .hk-card:hover::before {
        opacity: 1;
        background: linear-gradient(135deg, rgba(184, 134, 11, 0.3) 0%, rgba(107, 45, 60, 0.1) 100%);
      }

      /* ===== Code Header ===== */
      .hk-card-code-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, var(--hk-espresso) 0%, #2A1A10 100%);
        position: relative;
      }

      .hk-card-code-header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 20px;
        right: 20px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(184, 134, 11, 0.3), transparent);
      }

      .hk-card-code-badge {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .hk-card-code-main {
        font-family: var(--hk-font-mono);
        font-size: 15px;
        font-weight: 700;
        color: var(--hk-espresso);
        background: linear-gradient(135deg, var(--hk-gold) 0%, var(--hk-gold-light) 100%);
        padding: 8px 14px;
        border-radius: 6px;
        letter-spacing: 0.04em;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      .hk-card-code-cat {
        font-size: 10px;
        font-weight: 700;
        color: var(--hk-gold-light);
        text-transform: uppercase;
        letter-spacing: 0.15em;
        opacity: 0.9;
      }

      .hk-card-flags {
        display: flex;
        gap: 6px;
      }

      .hk-card-flag {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: var(--hk-transition);
      }

      .hk-card-flag.favorite { 
        background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%); 
        border-color: transparent;
      }
      .hk-card-flag.featured { 
        background: linear-gradient(135deg, var(--hk-gold) 0%, var(--hk-gold-dark) 100%); 
        border-color: transparent;
      }
      .hk-card-flag.subrecipe { 
        background: linear-gradient(135deg, var(--hk-sage) 0%, #1B4332 100%); 
        border-color: transparent;
      }

      /* ===== Card Body ===== */
      .hk-card-body {
        padding: 24px;
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .hk-card-title {
        font-family: var(--hk-font-display);
        font-size: 22px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
        margin: 0 0 8px;
        line-height: 1.25;
        letter-spacing: -0.01em;
      }

      .hk-card-category {
        font-size: 13px;
        color: var(--hk-text-secondary);
        margin-bottom: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }

      .hk-card-category span:first-child {
        color: var(--hk-gold-dark);
        font-weight: 600;
      }

      .hk-card-desc {
        font-size: 14px;
        color: var(--hk-text-secondary);
        line-height: 1.6;
        margin-bottom: 14px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        flex: 1;
      }

      .hk-card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 18px;
      }

      .hk-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 5px 12px;
        background: var(--hk-primary-light);
        border-radius: var(--hk-radius-full);
        color: var(--hk-burgundy);
        border: 1px solid rgba(107, 45, 60, 0.1);
      }

      .hk-card-meta {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
        padding-bottom: 18px;
        border-bottom: 1px dashed var(--hk-border);
      }

      .hk-meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--hk-text-secondary);
      }

      .hk-meta-icon {
        color: var(--hk-gold);
      }

      /* ===== Metrics ===== */
      .hk-card-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 22px;
      }

      .hk-metric {
        text-align: center;
        padding: 16px 10px;
        background: linear-gradient(180deg, var(--hk-bg) 0%, rgba(250, 246, 240, 0.5) 100%);
        border-radius: var(--hk-radius);
        border: 1px solid var(--hk-border);
      }

      .hk-metric-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--hk-text-muted);
        margin-bottom: 6px;
      }

      .hk-metric-value {
        font-family: var(--hk-font-mono);
        font-size: 17px;
        font-weight: 700;
        color: var(--hk-burgundy);
      }

      .hk-metric-value.warn { color: var(--hk-danger); }
      .hk-metric-value.good { color: var(--hk-sage); }

      /* ===== Card Footer ===== */
      .hk-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: auto;
        padding-top: 18px;
        border-top: 1px solid var(--hk-border);
      }

      .hk-card-price {
        font-family: var(--hk-font-display);
        font-size: 26px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
      }

      .hk-card-price small {
        font-family: var(--hk-font-body);
        font-size: 12px;
        font-weight: 500;
        color: var(--hk-text-muted);
        margin-left: 4px;
      }

      .hk-card-actions {
        display: flex;
        gap: 6px;
      }

      .hk-action-btn {
        width: 40px;
        height: 40px;
        border-radius: var(--hk-radius);
        border: 1px solid var(--hk-border);
        background: var(--hk-bg-card);
        color: var(--hk-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--hk-transition);
        font-size: 16px;
      }

      .hk-action-btn:hover {
        border-color: var(--hk-gold);
        color: var(--hk-gold-dark);
        background: var(--hk-secondary-light);
      }

      .hk-action-btn.danger:hover {
        border-color: var(--hk-danger);
        color: var(--hk-danger);
        background: var(--hk-danger-light);
      }

      .hk-action-btn.active {
        background: var(--hk-burgundy);
        border-color: var(--hk-burgundy);
        color: #FFFFFF;
      }

      .hk-select-check {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: var(--hk-radius);
        border: 1px dashed var(--hk-border);
        cursor: pointer;
        font-size: 12px;
        color: var(--hk-text-muted);
        background: var(--hk-bg-card);
        transition: var(--hk-transition);
      }

      .hk-select-check:hover {
        border-color: var(--hk-gold);
        color: var(--hk-gold-dark);
      }

      .hk-select-check input {
        width: 16px;
        height: 16px;
        accent-color: var(--hk-burgundy);
        cursor: pointer;
      }

      /* ===== Stamp System ===== */
      .hk-stamp {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border: 2px solid currentColor;
        opacity: 0.85;
      }

      .hk-stamp-featured {
        color: var(--hk-gold-dark);
        background: var(--hk-secondary-light);
      }

      .hk-stamp-favorite {
        color: #DC2626;
        background: #FEE2E2;
      }

      .hk-stamp-subrecipe {
        color: var(--hk-sage);
        background: var(--hk-success-light);
      }

      .hk-stamp-archived {
        color: var(--hk-text-muted);
        background: var(--hk-bg-hover);
      }

      .hk-stamp-warning {
        color: var(--hk-cinnamon);
        background: var(--hk-warning-light);
      }

      /* ===== List View ===== */
      .hk-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .hk-list-item {
        background: var(--hk-bg-card);
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius-lg);
        padding: 20px 24px;
        display: flex;
        align-items: center;
        gap: 24px;
        transition: var(--hk-transition);
      }

      .hk-list-item:hover {
        border-color: var(--hk-gold);
        background: #FFFFFF;
        box-shadow: var(--hk-shadow);
      }

      .hk-list-code {
        font-family: var(--hk-font-mono);
        font-size: 14px;
        font-weight: 700;
        color: #FFFFFF;
        background: linear-gradient(135deg, var(--hk-espresso) 0%, #2A1A10 100%);
        padding: 10px 16px;
        border-radius: var(--hk-radius);
        min-width: 100px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .hk-list-emblem {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--hk-primary-light) 0%, #FFFFFF 100%);
        border: 2px solid var(--hk-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
      }

      .hk-list-content {
        flex: 1;
        min-width: 0;
      }

      .hk-list-title {
        font-family: var(--hk-font-display);
        font-size: 18px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
        margin-bottom: 6px;
      }

      .hk-list-meta {
        display: flex;
        gap: 20px;
        font-size: 13px;
        color: var(--hk-text-secondary);
      }

      .hk-list-stats {
        display: flex;
        align-items: center;
        gap: 28px;
        flex-shrink: 0;
      }

      .hk-list-stat { text-align: center; }

      .hk-list-stat-label {
        font-size: 10px;
        color: var(--hk-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
      }

      .hk-list-stat-value {
        font-family: var(--hk-font-mono);
        font-size: 16px;
        font-weight: 700;
        color: var(--hk-burgundy);
        margin-top: 2px;
      }

      /* ===== Table View ===== */
      .hk-table-wrap {
        background: var(--hk-bg-card);
        border: 1px solid var(--hk-border);
        border-radius: var(--hk-radius-lg);
        overflow: hidden;
        box-shadow: var(--hk-shadow-sm);
      }

      .hk-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .hk-table th {
        background: linear-gradient(180deg, var(--hk-secondary-light) 0%, #FFFFFF 100%);
        padding: 16px 20px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        color: var(--hk-gold-dark);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 2px solid var(--hk-border);
      }

      .hk-table td {
        padding: 16px 20px;
        border-bottom: 1px solid var(--hk-border);
        color: var(--hk-text-secondary);
        vertical-align: middle;
      }

      .hk-table tbody tr {
        transition: var(--hk-transition);
      }

      .hk-table tbody tr:hover {
        background: var(--hk-bg-hover);
      }

      .hk-table tbody tr:last-child td {
        border-bottom: none;
      }

      .hk-table-code {
        font-family: var(--hk-font-mono);
        font-size: 13px;
        font-weight: 700;
        color: #FFFFFF;
        background: linear-gradient(135deg, var(--hk-espresso) 0%, #2A1A10 100%);
        padding: 6px 12px;
        border-radius: 4px;
        display: inline-block;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
      }

      .hk-table-name {
        font-family: var(--hk-font-display);
        font-weight: 700;
        font-size: 15px;
        color: var(--hk-burgundy-dark);
      }

      .hk-table-cat {
        font-size: 12px;
        color: var(--hk-text-muted);
        display: block;
        margin-top: 2px;
      }

      .hk-table-actions {
        display: flex;
        gap: 6px;
      }

      /* ===== Empty State ===== */
      .hk-empty {
        text-align: center;
        padding: 80px 48px;
        background: var(--hk-bg-card);
        border-radius: var(--hk-radius-xl);
        border: 2px dashed var(--hk-border);
      }

      .hk-empty-emblem {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--hk-primary-light) 0%, #FFFFFF 100%);
        border: 2px solid var(--hk-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 36px;
      }

      .hk-empty-title {
        font-family: var(--hk-font-display);
        font-size: 26px;
        font-weight: 700;
        color: var(--hk-burgundy-dark);
        margin-bottom: 10px;
      }

      .hk-empty-text {
        font-size: 15px;
        color: var(--hk-text-secondary);
        margin-bottom: 28px;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
      }

      .hk-empty-actions {
        display: flex;
        gap: 16px;
        justify-content: center;
      }

      /* ===== Loading State ===== */
      .hk-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 450px;
        background: var(--hk-bg-card);
        border-radius: var(--hk-radius-xl);
        border: 1px solid var(--hk-border);
      }

      .hk-loader {
        width: 56px;
        height: 56px;
        border: 3px solid var(--hk-border);
        border-top-color: var(--hk-gold);
        border-radius: 50%;
        animation: hk-spin 0.9s linear infinite;
        margin-bottom: 20px;
      }

      @keyframes hk-spin {
        to { transform: rotate(360deg); }
      }

      .hk-loading-text {
        font-size: 15px;
        color: var(--hk-text-secondary);
        font-weight: 500;
      }

      /* ===== Error State ===== */
      .hk-error {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 24px;
        background: var(--hk-danger-light);
        border: 1px solid rgba(139, 58, 58, 0.3);
        border-radius: var(--hk-radius-lg);
        margin-bottom: 28px;
        color: var(--hk-danger);
        font-size: 14px;
        font-weight: 600;
      }

      .hk-error-icon {
        font-size: 20px;
      }

      .hk-error-close {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--hk-danger);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: var(--hk-transition);
      }

      .hk-error-close:hover {
        background: rgba(139, 58, 58, 0.15);
      }

      /* ===== Toast ===== */
      .hk-toast-wrap {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
      }

      .hk-toast {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 28px;
        background: var(--hk-bg-card);
        border-radius: var(--hk-radius-lg);
        box-shadow: var(--hk-shadow-xl);
        border-left: 4px solid var(--hk-gold);
        animation: hk-toast-in 0.3s ease;
        max-width: 400px;
      }

      @keyframes hk-toast-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      .hk-toast.success { border-left-color: var(--hk-sage); }
      .hk-toast.error { border-left-color: var(--hk-danger); }

      .hk-toast-icon {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      .hk-toast.success .hk-toast-icon { background: var(--hk-success-light); color: var(--hk-sage); }
      .hk-toast.error .hk-toast-icon { background: var(--hk-danger-light); color: var(--hk-danger); }

      .hk-toast-msg {
        flex: 1;
        font-size: 14px;
        color: var(--hk-text);
        font-weight: 500;
      }

      .hk-toast-close {
        background: none;
        border: none;
        color: var(--hk-text-muted);
        cursor: pointer;
        padding: 6px;
        border-radius: 4px;
        transition: var(--hk-transition);
      }

      .hk-toast-close:hover {
        background: var(--hk-bg-hover);
        color: var(--hk-text);
      }

      /* ===== Responsive ===== */
      @media (max-width: 768px) {
        .hk-header {
          flex-direction: column;
          align-items: stretch;
        }

        .hk-header-left {
          flex-direction: column;
          align-items: flex-start;
        }

        .hk-toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .hk-search {
          width: 100%;
        }

        .hk-sort-row {
          flex-direction: column;
          align-items: stretch;
        }

        .hk-grid {
          grid-template-columns: 1fr !important;
        }

        .hk-list-item {
          flex-direction: column;
          align-items: stretch;
        }

        .hk-list-stats {
          flex-wrap: wrap;
          justify-content: flex-start;
        }
      }

      /* ===== Scrollbar ===== */
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      ::-webkit-scrollbar-track {
        background: var(--hk-bg);
        border-radius: 5px;
      }

      ::-webkit-scrollbar-thumb {
        background: var(--hk-border-dark);
        border-radius: 5px;
        border: 2px solid var(--hk-bg);
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--hk-gold);
      }

      /* ===== Print Styles ===== */
      @media print {
        .hk-header-actions,
        .hk-toolbar,
        .hk-filters,
        .hk-sort-row,
        .hk-card-actions,
        .hk-action-btn,
        .hk-select-check {
          display: none !important;
        }

        .hk-card {
          break-inside: avoid;
          box-shadow: none;
          border: 1px solid #000;
        }

        .hk {
          background: #FFFFFF;
        }
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
    categories: [], cuisines: [], difficulty: [], isFeatured: null, isFavorite: null, isSubrecipe: null
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

  useEffect(() => { loadAll().catch(() => {}) }, [loadAll])

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
      if (mountedRef.current) setRecipeLinesCache(prev => ({ ...prev, ...grouped }))
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
      if (!k.kitchenId) throw new Error('Kitchen not ready.')
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

      const { data, error } = await supabase.from('recipes').insert(payload as any).select('id').single()
      if (error) throw error

      const id = (data as any)?.id as string
      showToast('success', 'Recipe created!')
      CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      setTimeout(() => nav(`/recipe?id=${encodeURIComponent(id)}`), 400)
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed')
        showToast('error', e?.message || 'Failed')
      }
    }
  }, [k.kitchenId, nav])

  const toggleArchive = useCallback(async (r: RecipeRow) => {
    try {
      const next = !r.is_archived
      const { error } = await supabase.from('recipes').update({ is_archived: next, updated_at: new Date().toISOString() }).eq('id', r.id)
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
      const { error } = await supabase.from('recipes').update({ is_featured: next, updated_at: new Date().toISOString() }).eq('id', r.id)
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
      const { error } = await supabase.from('recipes').update({ is_favorite: next, updated_at: new Date().toISOString() }).eq('id', r.id)
      if (error) throw error
      if (mountedRef.current) {
        setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: next } : x))
        showToast('success', next ? 'Favorited' : 'Unfavorited')
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Failed')
    }
  }, [])

  const toggleSelect = useCallback((id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] })), [])
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
      const { error } = await supabase.from('recipes').update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', selectedIds)
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
    <div className={`hk-grid ${density}`}>
      <AnimatePresence>
        {sortedRecipes.map((r, index) => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const portions = toNum(r.portions, 1)
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              layout
            >
              <div className="hk-card">
                {/* Code Header */}
                <div className="hk-card-code-header">
                  <div className="hk-card-code-badge">
                    <span className="hk-card-code-main">{formatRecipeCode(r.code)}</span>
                    {r.code_category && <span className="hk-card-code-cat">{r.code_category}</span>}
                  </div>
                  <div className="hk-card-flags">
                    {r.is_favorite && <span className="hk-card-flag favorite" title="Favorite">♥</span>}
                    {r.is_featured && <span className="hk-card-flag featured" title="Featured">★</span>}
                    {r.is_subrecipe && <span className="hk-card-flag subrecipe" title="Subrecipe">◈</span>}
                  </div>
                </div>

                <div className="hk-card-body">
                  <h3 className="hk-card-title">{r.name}</h3>
                  <div className="hk-card-category">
                    <span>{r.category || 'Uncategorized'}</span>
                    {r.cuisine && <span>• {r.cuisine}</span>}
                    {r.is_archived && <span style={{ color: 'var(--hk-danger)' }}>• Archived</span>}
                  </div>

                  {r.description && <p className="hk-card-desc">{r.description}</p>}

                  {r.tags && r.tags.length > 0 && (
                    <div className="hk-card-tags">
                      {r.tags.slice(0, 3).map(tag => <span key={tag} className="hk-tag">{tag}</span>)}
                    </div>
                  )}

                  <div className="hk-card-meta">
                    <span className="hk-meta-item">
                      <span className="hk-meta-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg></span>
                      {portions} portions
                    </span>
                    <span className="hk-meta-item">
                      <span className="hk-meta-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
                      {formatTime(totalTime)}
                    </span>
                  </div>

                  <div className="hk-card-metrics">
                    <div className="hk-metric">
                      <div className="hk-metric-label">Cost</div>
                      <div className="hk-metric-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div>
                    </div>
                    <div className="hk-metric">
                      <div className="hk-metric-label">FC%</div>
                      <div className={`hk-metric-value ${c?.fcPct && c.fcPct > 30 ? 'warn' : 'good'}`}>
                        {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="hk-metric">
                      <div className="hk-metric-label">Margin</div>
                      <div className="hk-metric-value">{c ? formatCurrency(c.margin, cur) : '—'}</div>
                    </div>
                  </div>

                  <div className="hk-card-footer">
                    <div className="hk-card-price">
                      {r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}
                    </div>
                    <div className="hk-card-actions">
                      <button className={`hk-action-btn ${r.is_favorite ? 'active' : ''}`} onClick={() => toggleFavorite(r)} title="Favorite">
                        {r.is_favorite ? '♥' : '♡'}
                      </button>
                      <button className={`hk-action-btn ${r.is_featured ? 'active' : ''}`} onClick={() => toggleFeatured(r)} title="Featured">
                        {r.is_featured ? '★' : '☆'}
                      </button>
                      <button className="hk-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)} title="Edit">✎</button>
                      <button className="hk-action-btn" onClick={() => toggleArchive(r)} title="Archive">
                        {r.is_archived ? '↩' : '📥'}
                      </button>
                      <button className="hk-action-btn danger" onClick={() => deleteOneRecipe(r.id)} title="Delete">✕</button>
                      <label className="hk-select-check">
                        <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/>
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
    <div className="hk-list">
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
              transition={{ duration: 0.2, delay: index * 0.015 }}
              layout
            >
              <div className="hk-list-item">
                <div className="hk-list-code">{formatRecipeCode(r.code)}</div>
                
                <div className="hk-list-emblem">
                  {r.cuisine === 'italian' && '🍝'}
                  {r.cuisine === 'asian' && '🍜'}
                  {r.cuisine === 'mexican' && '🌮'}
                  {r.cuisine === 'indian' && '🍛'}
                  {!r.cuisine && '🍽'}
                </div>
                
                <div className="hk-list-content">
                  <div className="hk-list-title">{r.name}</div>
                  <div className="hk-list-meta">
                    <span>{r.category || '—'}</span>
                    <span>•</span>
                    <span>{r.portions} portions</span>
                    <span>•</span>
                    <span>{formatTime(totalTime)}</span>
                  </div>
                </div>
                
                <div className="hk-list-stats">
                  <div className="hk-list-stat">
                    <div className="hk-list-stat-label">Cost</div>
                    <div className="hk-list-stat-value">{c ? formatCurrency(c.cpp, cur) : '—'}</div>
                  </div>
                  <div className="hk-list-stat">
                    <div className="hk-list-stat-label">Price</div>
                    <div className="hk-list-stat-value">{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</div>
                  </div>
                </div>

                <div className="hk-card-actions">
                  <button className="hk-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
                  <label className="hk-select-check">
                    <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/>
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
    <div className="hk-table-wrap">
      <table className="hk-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>✓</th>
            <th style={{ width: 110 }}>Code</th>
            <th>Name</th>
            <th>Category</th>
            <th style={{ width: 90 }}>Portions</th>
            <th style={{ width: 90 }}>Time</th>
            <th style={{ width: 110 }}>Cost</th>
            <th style={{ width: 110 }}>Price</th>
            <th style={{ width: 80 }}>FC%</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedRecipes.map(r => {
            const c = costCache[r.id]
            const cur = (r.currency || 'USD').toUpperCase()
            const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

            return (
              <tr key={r.id}>
                <td><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggleSelect(r.id)}/></td>
                <td><span className="hk-table-code">{formatRecipeCode(r.code)}</span></td>
                <td>
                  <span className="hk-table-name">{r.name}</span>
                  <span className="hk-table-cat">{r.cuisine || ''}</span>
                </td>
                <td>{r.category || '—'}</td>
                <td>{r.portions}</td>
                <td>{formatTime(totalTime)}</td>
                <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
                <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
                <td>{c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}</td>
                <td>
                  <div className="hk-table-actions">
                    <button className="hk-action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>✎</button>
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
      <HeritageStyles />

      <div className="hk">
        <div className="hk-container">
          {/* Header */}
          <header className="hk-header">
            <div className="hk-header-left">
              <div className="hk-header-emblem">
                <span>🌿</span>
              </div>
              <div className="hk-header-info">
                <h1>Recipe Collection</h1>
                <p>{isMgmt ? 'Cost Analysis & Pricing' : 'Kitchen Operations'}</p>
              </div>
            </div>

            <div className="hk-header-actions">
              <button className="hk-btn hk-btn-primary" onClick={createNewRecipe}>
                + New Recipe
              </button>
              <button className="hk-btn hk-btn-secondary" onClick={() => loadAll(true)}>
                ↻ Sync
              </button>
              <button className="hk-btn hk-btn-ghost" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide Archived' : 'Show Archived'}
              </button>
            </div>
          </header>

          {/* Stats */}
          <div className="hk-stats">
            <div className="hk-stat">
              <div className="hk-stat-header">
                <span className="hk-stat-label">Total Recipes</span>
                <div className="hk-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h10"/>
                  </svg>
                </div>
              </div>
              <div className="hk-stat-value">{stats.total}</div>
              <div className="hk-stat-change up">↑ {stats.active} active</div>
            </div>

            <div className="hk-stat">
              <div className="hk-stat-header">
                <span className="hk-stat-label">Featured</span>
                <div className="hk-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
              </div>
              <div className="hk-stat-value">{stats.featured}</div>
              <div className="hk-stat-change">{stats.favorites} favorites</div>
            </div>

            <div className="hk-stat">
              <div className="hk-stat-header">
                <span className="hk-stat-label">Average Cost</span>
                <div className="hk-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                </div>
              </div>
              <div className="hk-stat-value">{formatCurrency(stats.avgCost)}</div>
              <div className="hk-stat-change">per portion</div>
            </div>

            <div className="hk-stat">
              <div className="hk-stat-header">
                <span className="hk-stat-label">Avg Margin</span>
                <div className="hk-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10"/>
                    <line x1="18" y1="20" x2="18" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="16"/>
                  </svg>
                </div>
              </div>
              <div className="hk-stat-value">{formatPercentage(stats.avgMargin)}</div>
              <div className="hk-stat-change down">↓ {stats.archived} archived</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="hk-toolbar">
            <div className="hk-search">
              <svg className="hk-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="hk-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, code, category..."
              />
              {q && (
                <button className="hk-search-clear" onClick={() => setQ('')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            <button
              className={`hk-btn hk-btn-ghost ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              Filters
            </button>

            <div className="hk-toolbar-group">
              <button className={`hk-toolbar-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
                Grid
              </button>
              <button className={`hk-toolbar-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
                List
              </button>
              <button className={`hk-toolbar-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                Table
              </button>
            </div>

            <button
              className="hk-btn hk-btn-ghost"
              onClick={() => setDensity(d => d === 'comfortable' ? 'dense' : d === 'dense' ? 'compact' : 'comfortable')}
            >
              {density === 'comfortable' ? 'Comfort' : density === 'dense' ? 'Dense' : 'Compact'}
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <motion.div
              className="hk-filters"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="hk-filter-group">
                <span className="hk-filter-label">Category</span>
                <button className="hk-chip active">All</button>
                <button className="hk-chip">Main</button>
                <button className="hk-chip">Dessert</button>
              </div>
              <div className="hk-filter-group">
                <span className="hk-filter-label">Difficulty</span>
                <button className="hk-chip">Easy</button>
                <button className="hk-chip">Medium</button>
                <button className="hk-chip">Hard</button>
              </div>
              <button
                className="hk-btn hk-btn-ghost"
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
          <div className="hk-sort-row">
            <div className="hk-sort-left">
              <span className="hk-sort-label">Sort by</span>
              <select
                className="hk-sort-select"
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
              <button className="hk-sort-btn" onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span className="hk-results-count">
                <strong>{sortedRecipes.length}</strong> of {recipes.length} recipes
              </span>

              {selectedIds.length > 0 && (
                <div className="hk-bulk-actions">
                  <span style={{ fontSize: '13px', color: 'var(--hk-text-secondary)' }}>
                    {selectedIds.length} selected
                  </span>
                  <button className="hk-bulk-btn" onClick={bulkArchive}>Archive</button>
                  <button className="hk-bulk-btn danger" onClick={bulkDelete}>Delete</button>
                  <button className="hk-bulk-btn" onClick={clearSelection}>Clear</button>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {err && (
            <div className="hk-error">
              <span className="hk-error-icon">⚠</span>
              <span>{err}</span>
              <button className="hk-error-close" onClick={() => setErr(null)}>✕</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="hk-loading">
              <div className="hk-loader"/>
              <div className="hk-loading-text">Loading recipes...</div>
            </div>
          ) : !sortedRecipes.length ? (
            <div className="hk-empty">
              <div className="hk-empty-emblem">🌿</div>
              <div className="hk-empty-title">
                {!hasAnyRecipes
                  ? 'No recipes yet'
                  : showArchivedEmptyHint
                    ? 'All recipes are archived'
                    : hasSearch
                      ? 'No matches found'
                      : 'No recipes'}
              </div>
              <div className="hk-empty-text">
                {!hasAnyRecipes
                  ? 'Create your first recipe to begin your culinary journey'
                  : showArchivedEmptyHint
                    ? 'Toggle "Show Archived" or create a new recipe'
                    : hasSearch
                      ? 'Try adjusting your search terms'
                      : 'Start by creating a new recipe'}
              </div>
              <div className="hk-empty-actions">
                <button className="hk-btn hk-btn-primary" onClick={createNewRecipe}>
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
            className="hk-toast-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className={`hk-toast ${toast.type}`}>
              <span className="hk-toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span>
              <span className="hk-toast-msg">{toast.message}</span>
              <button className="hk-toast-close" onClick={() => setToast(null)}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
