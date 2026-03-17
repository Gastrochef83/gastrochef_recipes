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
import { 
  Search, 
  Plus, 
  Archive, 
  Eye, 
  EyeOff, 
  Trash2, 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  AlertCircle,
  Loader2,
  Sparkles,
  Grid,
  List,
  DollarSign,
  TrendingUp,
  PieChart,
  Download,
  Upload,
  Copy,
  Heart,
  Clock,
  Users,
  Scale,
  ChefHat,
  BookOpen,
  Edit,
  BarChart3,
  FileText,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react'

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
  supplier?: string | null
  min_stock?: number | null
  current_stock?: number | null
  allergen_info?: string[] | null
  nutritional_info?: {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
  } | null
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
  fiber_g?: number | null
  sugar_g?: number | null
  sodium_mg?: number | null
  selling_price?: number | null
  cost_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
  minimum_price?: number | null
  recommended_price?: number | null
  created_at?: string
  updated_at?: string
  created_by?: string | null
  version?: number
  notes?: string | null
  dietary_info?: string[] | null
  season?: string[] | null
}

type CostPoint = {
  at: number
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  profit: number
  roi: number | null
  breakEven: number | null
  warnings: string[]
  details: {
    ingredientCost: number
    laborCost: number
    overheadCost: number
    packagingCost: number
  }
}

type Density = 'comfortable' | 'dense' | 'compact'
type ViewMode = 'grid' | 'list' | 'table'
type SortField = 'name' | 'category' | 'price' | 'cost' | 'margin' | 'date'
type SortOrder = 'asc' | 'desc'
type FilterType = {
  categories: string[]
  cuisines: string[]
  dietary: string[]
  priceRange: [number, number]
  costRange: [number, number]
  marginRange: [number, number]
  preparationTime: [number, number]
  difficulty: string[]
  tags: string[]
  isFeatured: boolean | null
  isFavorite: boolean | null
  isSubrecipe: boolean | null
  season: string[]
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

function useRecipeCost(recipeId: string, lines: Line[], ingredients: Map<string, Ingredient>) {
  return useMemo(() => {
    let totalCost = 0
    const warnings: string[] = []
    const details = {
      ingredientCost: 0,
      laborCost: 0,
      overheadCost: 0,
      packagingCost: 0
    }

    for (const l of lines) {
      if (l.line_type === 'group') continue
      
      if (l.line_type === 'subrecipe') {
        details.laborCost += l.qty * 0.5
        continue
      }

      const ing = l.ingredient_id ? ingredients.get(l.ingredient_id) : null
      if (!ing) continue

      const unitCost = toNum(ing.net_unit_cost, 0)
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        warnings.push(`Ingredient ${ing.name || 'unknown'} without price`)
      }

      const netQty = Math.max(0, toNum(l.qty, 0))
      const packUnit = ing.pack_unit || l.unit
      const qtyInPack = convertQtyToPackUnit(netQty, l.unit, packUnit)
      const lineCost = qtyInPack * unitCost
      
      if (l.line_type === 'ingredient') {
        details.ingredientCost += Number.isFinite(lineCost) ? lineCost : 0
      }
      
      totalCost += Number.isFinite(lineCost) ? lineCost : 0
    }

    details.overheadCost = totalCost * 0.15
    details.packagingCost = totalCost * 0.05

    return { 
      cost: totalCost + details.overheadCost + details.packagingCost, 
      warnings,
      details
    }
  }, [recipeId, lines, ingredients])
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

function useRecipeFilters(recipes: RecipeRow[], filter: FilterType, searchQuery: string) {
  return useMemo(() => {
    return recipes.filter(recipe => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matches = 
          recipe.name.toLowerCase().includes(query) ||
          recipe.category?.toLowerCase().includes(query) ||
          recipe.cuisine?.toLowerCase().includes(query) ||
          recipe.tags?.some(tag => tag.toLowerCase().includes(query)) ||
          recipe.description?.toLowerCase().includes(query)
        if (!matches) return false
      }

      if (filter.categories.length > 0 && 
          !filter.categories.includes(recipe.category || '')) {
        return false
      }

      if (filter.cuisines.length > 0 && 
          !filter.cuisines.includes(recipe.cuisine || '')) {
        return false
      }

      if (filter.dietary.length > 0) {
        const hasDietary = recipe.dietary_info?.some(d => 
          filter.dietary.includes(d)
        )
        if (!hasDietary) return false
      }

      if (filter.isFeatured !== null && recipe.is_featured !== filter.isFeatured) {
        return false
      }
      if (filter.isFavorite !== null && recipe.is_favorite !== filter.isFavorite) {
        return false
      }
      if (filter.isSubrecipe !== null && recipe.is_subrecipe !== filter.isSubrecipe) {
        return false
      }

      return true
    })
  }, [recipes, filter, searchQuery])
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

  const conversions: Record<string, Record<string, number>> = {
    'g': { 'kg': 0.001 },
    'kg': { 'g': 1000 },
    'ml': { 'l': 0.001, 'cl': 0.1 },
    'l': { 'ml': 1000, 'cl': 100 },
    'cl': { 'ml': 10, 'l': 0.01 },
    'oz': { 'g': 28.3495, 'lb': 0.0625 },
    'lb': { 'g': 453.592, 'oz': 16 },
    'cup': { 'ml': 240, 'l': 0.24 },
    'tbsp': { 'ml': 15 },
    'tsp': { 'ml': 5 }
  }

  if (conversions[u]?.[p]) {
    conv = qty * conversions[u][p]
  }

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
    case 'easy': return '#27AE60'
    case 'medium': return '#F1C40F'
    case 'hard': return '#E74C3C'
    default: return '#95A5A6'
  }
}

// ==================== Cache Management ====================

const CACHE_KEYS = {
  INGREDIENTS_REV: 'gc:ingredients:rev',
  COST_CACHE: 'gc:cost:cache',
  RECIPES_CACHE: 'gc:recipes:cache',
  LAST_SYNC: 'gc:last:sync'
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

// ==================== Styles Component ====================

function RecipesStyles() {
  return (
    <style>{`
      :root {
        --gc-primary: #2C3E50;
        --gc-primary-light: #34495E;
        --gc-primary-dark: #1E2B3A;
        --gc-secondary: #E67E22;
        --gc-secondary-light: #F39C12;
        --gc-secondary-dark: #D35400;
        --gc-success: #27AE60;
        --gc-warning: #F1C40F;
        --gc-danger: #E74C3C;
        --gc-info: #3498DB;
        --gc-light: #ECF0F1;
        --gc-dark: #2C3E50;
        --gc-gray: #95A5A6;
        --gc-gray-light: #BDC3C7;
        --gc-gray-dark: #7F8C8D;
        --gc-text: #2C3E50;
        --gc-text-light: #7F8C8D;
        --gc-background: #F5F7FA;
        --gc-background-dark: #E8ECF1;
        --gc-surface: #FFFFFF;
        --gc-surface-hover: #F8F9FA;
        --gc-border: #E1E8ED;
        --gc-shadow: rgba(0, 0, 0, 0.08);
        --gc-shadow-lg: rgba(0, 0, 0, 0.12);
        
        --gc-space-xs: 4px;
        --gc-space-sm: 8px;
        --gc-space-md: 12px;
        --gc-space-lg: 16px;
        --gc-space-xl: 24px;
        --gc-space-2xl: 32px;
        
        --gc-font-xs: 0.75rem;
        --gc-font-sm: 0.875rem;
        --gc-font-md: 1rem;
        --gc-font-lg: 1.125rem;
        --gc-font-xl: 1.25rem;
        --gc-font-2xl: 1.5rem;
        
        --gc-radius-sm: 4px;
        --gc-radius-md: 8px;
        --gc-radius-lg: 12px;
        --gc-radius-xl: 16px;
        --gc-radius-2xl: 24px;
        --gc-radius-full: 9999px;
        
        --gc-transition-fast: 150ms ease;
        --gc-transition-base: 250ms ease;
        --gc-transition-slow: 350ms ease;
        
        --gc-z-dropdown: 1000;
        --gc-z-sticky: 1020;
        --gc-z-fixed: 1030;
        --gc-z-modal-backdrop: 1040;
        --gc-z-modal: 1050;
        --gc-z-popover: 1060;
        --gc-z-tooltip: 1070;
        --gc-z-toast: 1080;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --gc-background: #1a1f2b;
          --gc-background-dark: #151a24;
          --gc-surface: #242a36;
          --gc-surface-hover: #2c3340;
          --gc-text: #e1e8ed;
          --gc-text-light: #9aa8b9;
          --gc-border: #3a4454;
          --gc-shadow: rgba(0, 0, 0, 0.24);
          --gc-shadow-lg: rgba(0, 0, 0, 0.32);
        }
      }

      .recipes-page {
        min-height: 100vh;
        background: var(--gc-background);
        color: var(--gc-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .recipes-container {
        max-width: 1600px;
        margin: 0 auto;
        padding: var(--gc-space-lg);
      }

      .recipes-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--gc-space-xl);
        flex-wrap: wrap;
        gap: var(--gc-space-md);
      }

      .recipes-header-left {
        display: flex;
        align-items: center;
        gap: var(--gc-space-md);
      }

      .recipes-header-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--gc-radius-lg);
        background: linear-gradient(135deg, var(--gc-secondary), var(--gc-secondary-dark));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 8px 16px rgba(230, 126, 34, 0.24);
      }

      .recipes-header-title {
        font-size: var(--gc-font-2xl);
        font-weight: 800;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, var(--gc-primary), var(--gc-primary-dark));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
      }

      .recipes-header-subtitle {
        font-size: var(--gc-font-sm);
        color: var(--gc-text-light);
        margin-top: var(--gc-space-xs);
      }

      .recipes-header-right {
        display: flex;
        align-items: center;
        gap: var(--gc-space-sm);
        flex-wrap: wrap;
      }

      .recipes-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--gc-space-md);
        margin-bottom: var(--gc-space-xl);
      }

      .stat-card {
        background: var(--gc-surface);
        border-radius: var(--gc-radius-lg);
        padding: var(--gc-space-lg);
        border: 1px solid var(--gc-border);
        box-shadow: 0 4px 6px var(--gc-shadow);
        transition: all var(--gc-transition-base);
        position: relative;
        overflow: hidden;
      }

      .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 12px var(--gc-shadow-lg);
        border-color: var(--gc-secondary);
      }

      .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, var(--gc-secondary), var(--gc-secondary-light));
      }

      .stat-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--gc-space-sm);
      }

      .stat-card-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--gc-radius-md);
        background: rgba(230, 126, 34, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--gc-secondary);
      }

      .stat-card-label {
        font-size: var(--gc-font-sm);
        color: var(--gc-text-light);
        font-weight: 500;
      }

      .stat-card-value {
        font-size: var(--gc-font-2xl);
        font-weight: 800;
        color: var(--gc-text);
        line-height: 1.2;
      }

      .stat-card-change {
        font-size: var(--gc-font-xs);
        margin-top: var(--gc-space-xs);
        display: flex;
        align-items: center;
        gap: var(--gc-space-xs);
      }

      .stat-card-change--positive {
        color: var(--gc-success);
      }

      .stat-card-change--negative {
        color: var(--gc-danger);
      }

      .recipes-toolbar {
        background: var(--gc-surface);
        border-radius: var(--gc-radius-xl);
        padding: var(--gc-space-md);
        border: 1px solid var(--gc-border);
        margin-bottom: var(--gc-space-lg);
        box-shadow: 0 2px 4px var(--gc-shadow);
      }

      .recipes-toolbar-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--gc-space-md);
        flex-wrap: wrap;
      }

      .recipes-toolbar-actions {
        display: flex;
        align-items: center;
        gap: var(--gc-space-sm);
        flex-wrap: wrap;
      }

      .recipes-search {
        flex: 1;
        min-width: 300px;
        position: relative;
      }

      .recipes-search-icon {
        position: absolute;
        left: var(--gc-space-md);
        top: 50%;
        transform: translateY(-50%);
        color: var(--gc-text-light);
        width: 18px;
        height: 18px;
      }

      .recipes-search-input {
        width: 100%;
        height: 42px;
        padding: 0 var(--gc-space-md) 0 calc(var(--gc-space-md) * 2 + 18px);
        border-radius: var(--gc-radius-full);
        border: 1px solid var(--gc-border);
        background: var(--gc-background);
        color: var(--gc-text);
        font-size: var(--gc-font-sm);
        transition: all var(--gc-transition-fast);
      }

      .recipes-search-input:focus {
        outline: none;
        border-color: var(--gc-secondary);
        box-shadow: 0 0 0 4px rgba(230, 126, 34, 0.1);
        background: var(--gc-surface);
      }

      .recipes-search-clear {
        position: absolute;
        right: var(--gc-space-sm);
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--gc-text-light);
        cursor: pointer;
        padding: var(--gc-space-xs);
        border-radius: var(--gc-radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--gc-transition-fast);
      }

      .recipes-search-clear:hover {
        background: var(--gc-surface-hover);
        color: var(--gc-text);
      }

      .recipes-view-controls {
        display: flex;
        align-items: center;
        gap: var(--gc-space-xs);
        background: var(--gc-background);
        border-radius: var(--gc-radius-lg);
        padding: 2px;
        border: 1px solid var(--gc-border);
      }

      .view-control-btn {
        padding: var(--gc-space-sm) var(--gc-space-md);
        border-radius: var(--gc-radius-md);
        background: transparent;
        border: none;
        color: var(--gc-text-light);
        font-size: var(--gc-font-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--gc-transition-fast);
        display: flex;
        align-items: center;
        gap: var(--gc-space-xs);
      }

      .view-control-btn:hover {
        background: var(--gc-surface-hover);
        color: var(--gc-text);
      }

      .view-control-btn--active {
        background: var(--gc-surface);
        color: var(--gc-secondary);
        box-shadow: 0 2px 4px var(--gc-shadow);
      }

      .density-controls {
        display: flex;
        align-items: center;
        gap: var(--gc-space-xs);
        background: var(--gc-background);
        border-radius: var(--gc-radius-lg);
        padding: 2px;
        border: 1px solid var(--gc-border);
      }

      .density-btn {
        padding: var(--gc-space-xs) var(--gc-space-sm);
        border-radius: var(--gc-radius-md);
        background: transparent;
        border: none;
        color: var(--gc-text-light);
        font-size: var(--gc-font-xs);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--gc-transition-fast);
      }

      .density-btn:hover {
        background: var(--gc-surface-hover);
        color: var(--gc-text);
      }

      .density-btn--active {
        background: var(--gc-surface);
        color: var(--gc-secondary);
        box-shadow: 0 2px 4px var(--gc-shadow);
      }

      .recipes-grid {
        display: grid;
        gap: var(--gc-space-md);
        transition: all var(--gc-transition-base);
      }

      .recipes-grid--comfortable {
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      }

      .recipes-grid--dense {
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      }

      .recipes-grid--compact {
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      }

      .recipes-list {
        display: flex;
        flex-direction: column;
        gap: var(--gc-space-sm);
      }

      .recipes-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--gc-surface);
        border-radius: var(--gc-radius-lg);
        overflow: hidden;
        border: 1px solid var(--gc-border);
      }

      .recipes-table th {
        background: var(--gc-background-dark);
        padding: var(--gc-space-md);
        text-align: left;
        font-size: var(--gc-font-xs);
        font-weight: 700;
        color: var(--gc-text-light);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 2px solid var(--gc-border);
      }

      .recipes-table td {
        padding: var(--gc-space-md);
        border-bottom: 1px solid var(--gc-border);
        font-size: var(--gc-font-sm);
      }

      .recipes-table tr:hover td {
        background: var(--gc-surface-hover);
      }

      .recipes-table tr:last-child td {
        border-bottom: none;
      }

      .recipe-card {
        background: var(--gc-surface);
        border-radius: var(--gc-radius-xl);
        border: 1px solid var(--gc-border);
        overflow: hidden;
        transition: all var(--gc-transition-base);
        position: relative;
        box-shadow: 0 4px 6px var(--gc-shadow);
        animation: cardAppear 0.3s ease-out;
      }

      @keyframes cardAppear {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .recipe-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 24px var(--gc-shadow-lg);
        border-color: var(--gc-secondary);
      }

      .recipe-card--featured {
        border: 2px solid var(--gc-secondary);
        box-shadow: 0 8px 16px rgba(230, 126, 34, 0.16);
      }

      .recipe-card--archived {
        opacity: 0.7;
        filter: grayscale(0.5);
      }

      .recipe-card__badge {
        position: absolute;
        top: var(--gc-space-md);
        left: var(--gc-space-md);
        z-index: 10;
        display: flex;
        gap: var(--gc-space-xs);
      }

      .recipe-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: var(--gc-radius-full);
        font-size: var(--gc-font-xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        backdrop-filter: blur(4px);
      }

      .recipe-badge--featured {
        background: rgba(230, 126, 34, 0.9);
        color: white;
      }

      .recipe-badge--favorite {
        background: rgba(231, 76, 60, 0.9);
        color: white;
      }

      .recipe-badge--archived {
        background: rgba(149, 165, 166, 0.9);
        color: white;
      }

      .recipe-badge--subrecipe {
        background: rgba(52, 152, 219, 0.9);
        color: white;
      }

      .recipe-card__media {
        position: relative;
        width: 100%;
        height: 160px;
        background: linear-gradient(135deg, var(--gc-primary-light), var(--gc-primary-dark));
        overflow: hidden;
      }

      .recipe-card__media img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform var(--gc-transition-base);
      }

      .recipe-card:hover .recipe-card__media img {
        transform: scale(1.05);
      }

      .recipe-card__media-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--gc-space-md);
        background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
        color: white;
        display: flex;
        align-items: center;
        gap: var(--gc-space-sm);
      }

      .recipe-card__time {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--gc-font-xs);
        font-weight: 600;
      }

      .recipe-card__difficulty {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--gc-font-xs);
        font-weight: 600;
        text-transform: capitalize;
      }

      .recipe-card__body {
        padding: var(--gc-space-lg);
      }

      .recipe-card__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--gc-space-md);
        margin-bottom: var(--gc-space-sm);
      }

      .recipe-card__title {
        margin: 0;
        font-size: var(--gc-font-lg);
        font-weight: 800;
        color: var(--gc-text);
        line-height: 1.2;
        letter-spacing: -0.02em;
      }

      .recipe-card__category {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
        background: var(--gc-background);
        padding: 4px 8px;
        border-radius: var(--gc-radius-full);
        margin-top: 4px;
      }

      .recipe-card__cuisine {
        font-size: var(--gc-font-xs);
        color: var(--gc-secondary);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .recipe-card__description {
        font-size: var(--gc-font-sm);
        color: var(--gc-text-light);
        margin: var(--gc-space-sm) 0;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .recipe-card__tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--gc-space-xs);
        margin: var(--gc-space-sm) 0;
      }

      .recipe-tag {
        font-size: var(--gc-font-xs);
        padding: 2px 8px;
        background: var(--gc-background);
        border-radius: var(--gc-radius-full);
        color: var(--gc-text-light);
        border: 1px solid var(--gc-border);
      }

      .recipe-card__metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--gc-space-sm);
        margin: var(--gc-space-md) 0;
      }

      .metric {
        background: var(--gc-background);
        border-radius: var(--gc-radius-lg);
        padding: var(--gc-space-sm);
        text-align: center;
        border: 1px solid var(--gc-border);
        transition: all var(--gc-transition-fast);
      }

      .metric:hover {
        background: var(--gc-surface-hover);
        border-color: var(--gc-secondary);
      }

      .metric__label {
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 2px;
      }

      .metric__value {
        font-size: var(--gc-font-md);
        font-weight: 800;
        color: var(--gc-text);
      }

      .metric__value--positive {
        color: var(--gc-success);
      }

      .metric__value--negative {
        color: var(--gc-danger);
      }

      .recipe-card__nutrition {
        display: flex;
        align-items: center;
        gap: var(--gc-space-md);
        padding: var(--gc-space-sm) 0;
        border-top: 1px solid var(--gc-border);
        border-bottom: 1px solid var(--gc-border);
        margin: var(--gc-space-sm) 0;
      }

      .nutrition-item {
        flex: 1;
        text-align: center;
      }

      .nutrition-value {
        font-size: var(--gc-font-sm);
        font-weight: 700;
        color: var(--gc-text);
      }

      .nutrition-label {
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .recipe-card__dietary {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: var(--gc-space-sm) 0;
      }

      .dietary-badge {
        font-size: var(--gc-font-xs);
        padding: 2px 6px;
        background: rgba(39, 174, 96, 0.1);
        color: var(--gc-success);
        border-radius: var(--gc-radius-full);
        font-weight: 600;
      }

      .recipe-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: var(--gc-space-md);
        gap: var(--gc-space-sm);
        flex-wrap: wrap;
      }

      .recipe-card__price {
        font-size: var(--gc-font-lg);
        font-weight: 800;
        color: var(--gc-secondary);
      }

      .recipe-card__price small {
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
        font-weight: 500;
      }

      .recipe-card__actions {
        display: flex;
        align-items: center;
        gap: var(--gc-space-xs);
      }

      .action-btn {
        width: 36px;
        height: 36px;
        border-radius: var(--gc-radius-md);
        border: 1px solid var(--gc-border);
        background: var(--gc-background);
        color: var(--gc-text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--gc-transition-fast);
      }

      .action-btn:hover {
        background: var(--gc-surface-hover);
        border-color: var(--gc-secondary);
        color: var(--gc-secondary);
        transform: translateY(-2px);
      }

      .action-btn--danger:hover {
        background: var(--gc-danger);
        border-color: var(--gc-danger);
        color: white;
      }

      .recipe-list-item {
        background: var(--gc-surface);
        border-radius: var(--gc-radius-lg);
        border: 1px solid var(--gc-border);
        padding: var(--gc-space-md);
        transition: all var(--gc-transition-fast);
        display: flex;
        align-items: center;
        gap: var(--gc-space-md);
      }

      .recipe-list-item:hover {
        background: var(--gc-surface-hover);
        border-color: var(--gc-secondary);
        transform: translateX(4px);
      }

      .recipe-list-item__icon {
        width: 48px;
        height: 48px;
        border-radius: var(--gc-radius-md);
        background: linear-gradient(135deg, var(--gc-primary), var(--gc-primary-dark));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
      }

      .recipe-list-item__content {
        flex: 1;
        min-width: 0;
      }

      .recipe-list-item__title {
        font-weight: 700;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: var(--gc-space-sm);
        flex-wrap: wrap;
      }

      .recipe-list-item__category {
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
      }

      .recipe-list-item__meta {
        display: flex;
        align-items: center;
        gap: var(--gc-space-md);
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
        flex-wrap: wrap;
      }

      .recipe-list-item__stats {
        display: flex;
        align-items: center;
        gap: var(--gc-space-lg);
      }

      .recipe-list-item__stat {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .recipe-list-item__price {
        font-weight: 700;
        color: var(--gc-secondary);
      }

      .recipes-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: var(--gc-surface);
        border-radius: var(--gc-radius-xl);
        border: 1px solid var(--gc-border);
      }

      .loading-spinner {
        animation: spin 1s linear infinite;
        color: var(--gc-secondary);
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .recipes-error {
        background: rgba(231, 76, 60, 0.1);
        border: 1px solid var(--gc-danger);
        border-radius: var(--gc-radius-lg);
        padding: var(--gc-space-md);
        margin-bottom: var(--gc-space-lg);
        display: flex;
        align-items: center;
        gap: var(--gc-space-sm);
        color: var(--gc-danger);
      }

      .toast-container {
        position: fixed;
        bottom: var(--gc-space-lg);
        right: var(--gc-space-lg);
        display: flex;
        flex-direction: column;
        gap: var(--gc-space-sm);
        z-index: var(--gc-z-toast);
      }

      .toast {
        min-width: 300px;
        max-width: 400px;
        background: var(--gc-surface);
        border-radius: var(--gc-radius-lg);
        padding: var(--gc-space-md);
        box-shadow: 0 8px 16px var(--gc-shadow-lg);
        border-left: 4px solid;
        display: flex;
        align-items: flex-start;
        gap: var(--gc-space-sm);
        animation: slideIn 0.3s ease-out;
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
        border-left-color: var(--gc-success);
      }

      .toast--error {
        border-left-color: var(--gc-danger);
      }

      .toast--warning {
        border-left-color: var(--gc-warning);
      }

      .toast--info {
        border-left-color: var(--gc-info);
      }

      .toast-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .toast-content {
        flex: 1;
      }

      .toast-title {
        font-weight: 700;
        font-size: var(--gc-font-sm);
        margin-bottom: 2px;
      }

      .toast-message {
        font-size: var(--gc-font-xs);
        color: var(--gc-text-light);
      }

      .toast-close {
        background: none;
        border: none;
        color: var(--gc-text-light);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--gc-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .toast-close:hover {
        background: var(--gc-surface-hover);
        color: var(--gc-text);
      }

      @media (max-width: 1024px) {
        .recipes-grid--comfortable {
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        }
        
        .recipes-grid--dense {
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }
        
        .recipes-grid--compact {
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        }
      }

      @media (max-width: 768px) {
        .recipes-container {
          padding: var(--gc-space-md);
        }

        .recipes-header {
          flex-direction: column;
          align-items: stretch;
        }

        .recipes-header-right {
          justify-content: stretch;
        }

        .recipes-header-right > * {
          flex: 1;
        }

        .recipes-search {
          min-width: 100%;
        }

        .recipes-toolbar-row {
          flex-direction: column;
          align-items: stretch;
        }

        .recipes-toolbar-actions {
          justify-content: space-between;
        }

        .recipes-grid {
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

        .recipes-table {
          display: block;
          overflow-x: auto;
        }

        .toast {
          min-width: 250px;
          max-width: 300px;
        }
      }

      @media (max-width: 480px) {
        .recipes-stats {
          grid-template-columns: 1fr;
        }

        .recipe-list-item {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipe-list-item__meta {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--gc-space-xs);
        }

        .recipe-list-item__stats {
          flex-wrap: wrap;
        }
      }

      @media print {
        .recipes-toolbar,
        .recipes-filters,
        .recipe-card__actions,
        .action-btn,
        .toast-container {
          display: none !important;
        }

        .recipe-card {
          break-inside: avoid;
          border: 1px solid #000;
          box-shadow: none;
        }

        .recipes-grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
      }

      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: var(--gc-background);
      }

      ::-webkit-scrollbar-thumb {
        background: var(--gc-gray);
        border-radius: var(--gc-radius-full);
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--gc-gray-dark);
      }
    `}</style>
  )
}

// ==================== Main Component ====================

export default function Recipes() {
  const nav = useNavigate()
  const loc = useLocation()
  const { isKitchen } = useMode()
  const isMgmt = !isKitchen
  const k = useKitchen()

  const mountedRef = useRef(true)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const loadingLinesRef = useRef<Set<string>>(new Set())

  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning' | 'info', message: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [recipeLinesCache, setRecipeLinesCache] = useState<Record<string, Line[]>>({})
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => 
    CacheManager.get(CACHE_KEYS.COST_CACHE, CACHE_TTL.COST) || {}
  )
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('gc:view:mode', 'grid')
  const [density, setDensity] = useLocalStorage<Density>('gc:density', 'comfortable')
  const [sortField, setSortField] = useLocalStorage<SortField>('gc:sort:field', 'name')
  const [sortOrder, setSortOrder] = useLocalStorage<SortOrder>('gc:sort:order', 'asc')
  const [filters, setFilters] = useLocalStorage<FilterType>('gc:filters', {
    categories: [],
    cuisines: [],
    dietary: [],
    priceRange: [0, 1000],
    costRange: [0, 1000],
    marginRange: [0, 100],
    preparationTime: [0, 240],
    difficulty: [],
    tags: [],
    isFeatured: null,
    isFavorite: null,
    isSubrecipe: null,
    season: []
  })

  const debouncedQ = useDebounce(q, 300)

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const filteredRecipes = useRecipeFilters(recipes, filters, debouncedQ)

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
    () => Object.keys(selected).filter((key) => selected[key]),
    [selected]
  )

  const hasAnyRecipes = recipes.length > 0
  const hasActiveRecipes = useMemo(() => recipes.some((r) => !r.is_archived), [recipes])
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

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(loc.search)
    const searchParam = params.get('search')
    if (searchParam) {
      setQ(searchParam)
    }
    
    const categoryParam = params.get('category')
    if (categoryParam) {
      setFilters({
        ...filters,
        categories: [categoryParam]
      })
    }
  }, [loc.search])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    document.documentElement.setAttribute('data-view', viewMode)
  }, [density, viewMode])

  const loadAll = useCallback(async (sync = false) => {
    if (!mountedRef.current) return
    
    if (sync) {
      setSyncing(true)
    } else {
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
          if (!sync) setLoading(false)
          return
        }
      }

      // ✅ الأعمدة المؤكدة فقط - تم إزالة subcategory و allergens
      const selectRecipes = `
        id,code,kitchen_id,name,category,cuisine,portions,
        yield_qty,yield_unit,is_subrecipe,is_archived,is_featured,is_favorite,
        photo_url,description,preparation_time,cooking_time,difficulty,tags,
        calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,
        selling_price,cost_price,currency,target_food_cost_pct,
        minimum_price,recommended_price,created_at,updated_at,created_by,
        version,notes,dietary_info,season
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
        .select('id,name,pack_unit,net_unit_cost,is_active,category,supplier,min_stock,current_stock,allergen_info,nutritional_info')
        .order('name', { ascending: true })

      if (iErr) throw iErr
      
      const ingredientsData = (i ?? []) as Ingredient[]
      if (mountedRef.current) {
        setIngredients(ingredientsData)
        CacheManager.set(CACHE_KEYS.INGREDIENTS_REV, ingredientsData)
      }

      CacheManager.set(CACHE_KEYS.LAST_SYNC, Date.now())
      
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to load recipes')
        setToast({
          type: 'error',
          message: `Error loading data: ${e?.message || 'Unknown error'}`
        })
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setSyncing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  const ensureRecipeLinesLoaded = useCallback(async (ids: string[]) => {
    const need = ids.filter(
      (id) => !recipeLinesCache[id] && !loadingLinesRef.current.has(id)
    )
    if (!need.length) return

    for (const id of need) loadingLinesRef.current.add(id)

    try {
      const { data, error } = await supabase
        .from('recipe_lines')
        .select(
          'id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title'
        )
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
        setRecipeLinesCache((prev) => ({ ...prev, ...grouped }))
      }
    } finally {
      for (const id of need) loadingLinesRef.current.delete(id)
    }
  }, [recipeLinesCache])

  const costMemo = useMemo(() => {
    const memo = new Map<string, { cost: number; warnings: string[]; details: CostPoint['details'] }>()

    for (const r of recipes) {
      const lines = recipeLinesCache[r.id]
      if (!lines) continue

      const result = useRecipeCost(r.id, lines, ingById)
      memo.set(r.id, result)
    }

    return memo
  }, [recipes, recipeLinesCache, ingById])

  useEffect(() => {
    if (loading) return
    if (!sortedRecipes.length) return

    const visible = sortedRecipes.slice(0, 50)
    ensureRecipeLinesLoaded(visible.map((r) => r.id)).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id
      const hit = nextCache[rid]

      if (hit && now - hit.at < CACHE_TTL.COST) continue
      if (!recipeLinesCache[rid]) continue

      const totalRes = costMemo.get(rid) || { 
        cost: 0, 
        warnings: [], 
        details: { ingredientCost: 0, laborCost: 0, overheadCost: 0, packagingCost: 0 }
      }
      
      const totalCost = totalRes.cost
      const portionsN = Math.max(1, toNum(r.portions, 1))
      const cpp = portionsN > 0 ? totalCost / portionsN : 0
      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell - cpp
      const marginPct = sell > 0 ? (margin / sell) * 100 : null
      const profit = margin
      const roi = totalCost > 0 ? (profit / totalCost) * 100 : null
      const breakEven = sell > 0 ? totalCost / sell : null

      nextCache[rid] = {
        at: now,
        totalCost,
        cpp,
        fcPct,
        margin,
        marginPct,
        profit,
        roi,
        breakEven,
        warnings: totalRes.warnings,
        details: totalRes.details
      }

      changed = true
    }

    if (changed) {
      if (mountedRef.current) {
        setCostCache(nextCache)
        CacheManager.set(CACHE_KEYS.COST_CACHE, nextCache)
      }
    }
  }, [loading, sortedRecipes, recipeLinesCache, costMemo, ensureRecipeLinesLoaded, costCache])

  const createNewRecipe = useCallback(async () => {
    if (mountedRef.current) setErr(null)

    try {
      if (!k.kitchenId) {
        throw new Error('Kitchen not ready yet.\nPlease wait a second and try again.')
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
        dietary_info: [],
        season: [],
        version: 1
      }

      const { data, error } = await supabase
        .from('recipes')
        .insert(payload as any)
        .select('id')
        .single()

      if (error) throw error

      const id = (data as any)?.id as string
      if (mountedRef.current) {
        setToast({
          type: 'success',
          message: 'Recipe created successfully. Opening editor...'
        })
      }
      
      CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      
      setTimeout(() => {
        nav(`/recipe?id=${encodeURIComponent(id)}`)
      }, 500)
      
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to create recipe')
        setToast({
          type: 'error',
          message: `Failed to create recipe: ${e?.message || 'Unknown error'}`
        })
      }
    }
  }, [k.kitchenId, nav])

  const duplicateRecipe = useCallback(async (recipe: RecipeRow) => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .insert({
          ...recipe,
          id: undefined,
          name: `${recipe.name} (Copy)`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
          is_featured: false,
          is_favorite: false
        } as any)
        .select('id')
        .single()

      if (error) throw error

      const lines = recipeLinesCache[recipe.id]
      if (lines && lines.length > 0) {
        await supabase
          .from('recipe_lines')
          .insert(
            lines.map(line => ({
              ...line,
              id: undefined,
              recipe_id: data.id
            }))
          )
      }

      if (mountedRef.current) {
        setToast({
          type: 'success',
          message: 'Recipe duplicated successfully'
        })
        loadAll(true)
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to duplicate recipe: ${e?.message || 'Unknown error'}`
      })
    }
  }, [recipeLinesCache, loadAll])

  const toggleArchive = useCallback(async (r: RecipeRow) => {
    try {
      const next = !r.is_archived
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: next, updated_at: new Date().toISOString() })
        .eq('id', r.id)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_archived: next } : x)))
        setToast({
          type: 'success',
          message: next ? 'Recipe archived' : 'Recipe restored'
        })
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to update recipe')
        setToast({
          type: 'error',
          message: `Failed to update recipe: ${e?.message || 'Unknown error'}`
        })
      }
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
        setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_featured: next } : x)))
        setToast({
          type: 'success',
          message: next ? 'Recipe featured' : 'Recipe unfeatured'
        })
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to update recipe: ${e?.message || 'Unknown error'}`
      })
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
        setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_favorite: next } : x)))
        setToast({
          type: 'success',
          message: next ? 'Added to favorites' : 'Removed from favorites'
        })
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to update recipe: ${e?.message || 'Unknown error'}`
      })
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }))
  }, [])

  const clearSelection = useCallback(() => {
    setSelected({})
  }, [])

  const deleteOneRecipe = useCallback(async (recipeId: string) => {
    const ok = window.confirm(
      'Delete this recipe permanently?\n\nThis will also delete its recipe lines.\nThis action cannot be undone.'
    )
    if (!ok) return

    if (mountedRef.current) setErr(null)

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
        setRecipes((prev) => prev.filter((r) => r.id !== recipeId))
        setRecipeLinesCache((p) => {
          const next = { ...p }
          delete next[recipeId]
          return next
        })
        setSelected((p) => {
          const next = { ...p }
          delete next[recipeId]
          return next
        })
        setToast({
          type: 'success',
          message: 'Recipe deleted successfully'
        })
        
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setErr(e?.message || 'Failed to delete recipe')
        setToast({
          type: 'error',
          message: `Failed to delete recipe: ${e?.message || 'Unknown error'}`
        })
      }
    }
  }, [])

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
        setRecipes((prev) =>
          prev.map((r) =>
            selectedIds.includes(r.id) ? { ...r, is_archived: true } : r
          )
        )
        setSelected({})
        setToast({
          type: 'success',
          message: `${selectedIds.length} recipes archived`
        })
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to archive recipes: ${e?.message || 'Unknown error'}`
      })
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
        setRecipes((prev) => prev.filter((r) => !selectedIds.includes(r.id)))
        setRecipeLinesCache((p) => {
          const next = { ...p }
          selectedIds.forEach(id => delete next[id])
          return next
        })
        setSelected({})
        setToast({
          type: 'success',
          message: `${selectedIds.length} recipes deleted`
        })
        
        CacheManager.clear(CACHE_KEYS.RECIPES_CACHE)
      }
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to delete recipes: ${e?.message || 'Unknown error'}`
      })
    }
  }, [selectedIds])

  const exportRecipes = useCallback(() => {
    try {
      const data = JSON.stringify(selectedIds.length > 0 ? 
        recipes.filter(r => selectedIds.includes(r.id)) : 
        recipes
      , null, 2)
      
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recipes-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      
      setToast({
        type: 'success',
        message: `Exported ${selectedIds.length || recipes.length} recipes`
      })
    } catch (e: any) {
      setToast({
        type: 'error',
        message: `Failed to export: ${e?.message || 'Unknown error'}`
      })
    }
  }, [recipes, selectedIds])

  const importRecipes = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const imported = JSON.parse(text)
        
        setToast({
          type: 'info',
          message: `Import feature coming soon`
        })
      } catch (e: any) {
        setToast({
          type: 'error',
          message: `Failed to import: ${e?.message || 'Invalid file'}`
        })
      }
    }
    input.click()
  }, [])

  const renderGridView = () => (
    <div className={`recipes-grid recipes-grid--${density}`}>
      <AnimatePresence>
        {sortedRecipes.map((r) => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
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
              <div className={`recipe-card ${r.is_featured ? 'recipe-card--featured' : ''} ${r.is_archived ? 'recipe-card--archived' : ''}`}>
                <div className="recipe-card__badge">
                  {r.is_featured && (
                    <span className="recipe-badge recipe-badge--featured">
                      <Sparkles size={12} />
                      Featured
                    </span>
                  )}
                  {r.is_favorite && (
                    <span className="recipe-badge recipe-badge--favorite">
                      <Heart size={12} />
                      Favorite
                    </span>
                  )}
                  {r.is_subrecipe && (
                    <span className="recipe-badge recipe-badge--subrecipe">
                      <BookOpen size={12} />
                      Subrecipe
                    </span>
                  )}
                  {r.is_archived && (
                    <span className="recipe-badge recipe-badge--archived">
                      <Archive size={12} />
                      Archived
                    </span>
                  )}
                </div>

                <div className="recipe-card__media">
                  {r.photo_url ? (
                    <img src={r.photo_url} alt={r.name} />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, var(--gc-primary), var(--gc-primary-dark))',
                      color: 'white',
                      fontSize: '48px'
                    }}>
                      {r.cuisine === 'italian' && '🍝'}
                      {r.cuisine === 'asian' && '🍜'}
                      {r.cuisine === 'mexican' && '🌮'}
                      {r.cuisine === 'indian' && '🍛'}
                      {r.cuisine === 'french' && '🥐'}
                      {!r.cuisine && '🍽'}
                    </div>
                  )}
                  <div className="recipe-card__media-overlay">
                    <span className="recipe-card__time">
                      <Clock size={14} />
                      {formatTime(totalTime)}
                    </span>
                    <span className="recipe-card__difficulty" style={{ color: getDifficultyColor(r.difficulty || '') }}>
                      {r.difficulty === 'easy' && '😊'}
                      {r.difficulty === 'medium' && '😐'}
                      {r.difficulty === 'hard' && '😅'}
                      {r.difficulty || 'Not set'}
                    </span>
                  </div>
                </div>

                <div className="recipe-card__body">
                  <div className="recipe-card__header">
                    <div>
                      <h3 className="recipe-card__title">{r.name}</h3>
                      <div className="recipe-card__category">
                        {r.category || 'Uncategorized'}
                        {r.cuisine && (
                          <>
                            <span>•</span>
                            <span className="recipe-card__cuisine">{r.cuisine}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {r.description && (
                    <p className="recipe-card__description">{r.description}</p>
                  )}

                  {r.tags && r.tags.length > 0 && (
                    <div className="recipe-card__tags">
                      {r.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="recipe-tag">{tag}</span>
                      ))}
                      {r.tags.length > 3 && (
                        <span className="recipe-tag">+{r.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  {r.dietary_info && r.dietary_info.length > 0 && (
                    <div className="recipe-card__dietary">
                      {r.dietary_info.map(d => (
                        <span key={d} className="dietary-badge">{d}</span>
                      ))}
                    </div>
                  )}

                  <div className="recipe-card__metrics">
                    <div className="metric">
                      <div className="metric__label">Portions</div>
                      <div className="metric__value">{portions}</div>
                    </div>
                    <div className="metric">
                      <div className="metric__label">Cost</div>
                      <div className="metric__value">
                        {c ? formatCurrency(c.cpp, cur) : '—'}
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric__label">FC%</div>
                      <div className={`metric__value ${c?.fcPct && c.fcPct > 30 ? 'metric__value--negative' : ''}`}>
                        {c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}
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
                          <div className="nutrition-label">Protein</div>
                        </div>
                      )}
                      {r.carbs_g && (
                        <div className="nutrition-item">
                          <div className="nutrition-value">{r.carbs_g}g</div>
                          <div className="nutrition-label">Carbs</div>
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
                      {r.selling_price ? formatCurrency(r.selling_price, cur) : 'Price not set'}
                      {c?.profit && (
                        <small>
                          {' '}
                          (Profit: {formatCurrency(c.profit, cur)})
                        </small>
                      )}
                    </div>
                    <div className="recipe-card__actions">
                      <button
                        className="action-btn"
                        onClick={() => toggleFavorite(r)}
                        title={r.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart size={16} fill={r.is_favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => toggleFeatured(r)}
                        title={r.is_featured ? 'Unfeature' : 'Feature'}
                      >
                        <Sparkles size={16} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => duplicateRecipe(r)}
                        title="Duplicate"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => toggleArchive(r)}
                        title={r.is_archived ? 'Restore' : 'Archive'}
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        className="action-btn action-btn--danger"
                        onClick={() => deleteOneRecipe(r.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                      <label className="action-btn" title="Select">
                        <input
                          type="checkbox"
                          checked={!!selected[r.id]}
                          onChange={() => toggleSelect(r.id)}
                          style={{ width: 16, height: 16, margin: 0, cursor: 'pointer' }}
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
    <div className="recipes-list">
      <AnimatePresence>
        {sortedRecipes.map((r) => {
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
                    <span>{r.name}</span>
                    <span className="recipe-list-item__category">{r.category}</span>
                    {r.is_featured && <Sparkles size={14} style={{ color: 'var(--gc-warning)' }} />}
                    {r.is_favorite && <Heart size={14} style={{ color: 'var(--gc-danger)' }} fill="currentColor" />}
                    {r.is_archived && <Archive size={14} style={{ color: 'var(--gc-text-light)' }} />}
                  </div>
                  
                  <div className="recipe-list-item__meta">
                    <span className="recipe-list-item__stat">
                      <Clock size={12} />
                      {formatTime(totalTime)}
                    </span>
                    <span className="recipe-list-item__stat">
                      <Users size={12} />
                      {r.portions} portions
                    </span>
                    <span className="recipe-list-item__stat">
                      <Scale size={12} />
                      {r.yield_qty ? `${r.yield_qty} ${r.yield_unit || ''}` : '—'}
                    </span>
                    <span className="recipe-list-item__stat">
                      <DollarSign size={12} />
                      {c ? formatCurrency(c.cpp, cur) : '—'} / portion
                    </span>
                    <span className="recipe-list-item__price">
                      {r.selling_price ? formatCurrency(r.selling_price, cur) : 'No price'}
                    </span>
                  </div>
                </div>
                
                <div className="recipe-card__actions">
                  <button className="action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                    <Edit size={16} />
                  </button>
                  <label className="action-btn">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => toggleSelect(r.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
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
    <table className="recipes-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Cuisine</th>
          <th>Portions</th>
          <th>Time</th>
          <th>Cost/Portion</th>
          <th>Selling Price</th>
          <th>FC%</th>
          <th>Profit</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sortedRecipes.map((r) => {
          const c = costCache[r.id]
          const cur = (r.currency || 'USD').toUpperCase()
          const totalTime = (r.preparation_time || 0) + (r.cooking_time || 0)

          return (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                {r.is_featured && <Sparkles size={12} style={{ color: 'var(--gc-warning)', marginLeft: 4 }} />}
              </td>
              <td>{r.category || '—'}</td>
              <td>{r.cuisine || '—'}</td>
              <td>{r.portions}</td>
              <td>{formatTime(totalTime)}</td>
              <td>{c ? formatCurrency(c.cpp, cur) : '—'}</td>
              <td>{r.selling_price ? formatCurrency(r.selling_price, cur) : '—'}</td>
              <td style={{ color: c?.fcPct && c.fcPct > 30 ? 'var(--gc-danger)' : 'inherit' }}>
                {c?.fcPct ? `${c.fcPct.toFixed(1)}%` : '—'}
              </td>
              <td>{c ? formatCurrency(c.profit, cur) : '—'}</td>
              <td>
                {r.is_archived && <span style={{ color: 'var(--gc-text-light)' }}>Archived</span>}
                {!r.is_archived && <span style={{ color: 'var(--gc-success)' }}>Active</span>}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="action-btn" onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                    <Edit size={14} />
                  </button>
                  <label className="action-btn">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => toggleSelect(r.id)}
                      style={{ width: 14, height: 14, cursor: 'pointer' }}
                    />
                  </label>
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

      <div className="recipes-page">
        <div className="recipes-container">
          <div className="recipes-header">
            <div className="recipes-header-left">
              <div className="recipes-header-icon">
                <ChefHat size={24} />
              </div>
              <div>
                <h1 className="recipes-header-title">Recipe Management</h1>
                <p className="recipes-header-subtitle">
                  {isMgmt ? 'Costing, pricing & analytics' : 'Kitchen operations & production'}
                </p>
              </div>
            </div>

            <div className="recipes-header-right">
              <Button
                variant="secondary"
                onClick={() => setShowFilters(!showFilters)}
                icon={<Filter size={16} />}
              >
                Filters
              </Button>

              <Button
                variant="secondary"
                onClick={() => loadAll(true)}
                disabled={syncing}
                icon={syncing ? <Loader2 size={16} className="loading-spinner" /> : <RefreshCw size={16} />}
              >
                {syncing ? 'Syncing...' : 'Sync'}
              </Button>

              <Button
                variant="secondary"
                onClick={exportRecipes}
                icon={<Download size={16} />}
              >
                Export
              </Button>

              <Button
                variant="secondary"
                onClick={importRecipes}
                icon={<Upload size={16} />}
              >
                Import
              </Button>

              <Button
                onClick={createNewRecipe}
                icon={<Plus size={16} />}
              >
                New Recipe
              </Button>
            </div>
          </div>

          <div className="recipes-stats">
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">Total Recipes</span>
                <div className="stat-card-icon">
                  <FileText size={20} />
                </div>
              </div>
              <div className="stat-card-value">{stats.total}</div>
              <div className="stat-card-change stat-card-change--positive">
                <ChevronUp size={14} />
                {stats.active} active
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">Featured</span>
                <div className="stat-card-icon">
                  <Sparkles size={20} />
                </div>
              </div>
              <div className="stat-card-value">{stats.featured}</div>
              <div className="stat-card-change">
                {stats.favorites} favorites
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">Avg Cost</span>
                <div className="stat-card-icon">
                  <DollarSign size={20} />
                </div>
              </div>
              <div className="stat-card-value">
                {formatCurrency(stats.avgCost)}
              </div>
              <div className="stat-card-change">
                per recipe
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">Avg Margin</span>
                <div className="stat-card-icon">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className={`stat-card-value ${stats.avgMargin > 0 ? 'text-success' : 'text-danger'}`}>
                {formatPercentage(stats.avgMargin)}
              </div>
              <div className="stat-card-change">
                {stats.archived} archived
              </div>
            </div>
          </div>

          <div className="recipes-toolbar">
            <div className="recipes-toolbar-row">
              <div className="recipes-search">
                <Search className="recipes-search-icon" />
                <input
                  ref={searchInputRef}
                  className="recipes-search-input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name, category, cuisine, tags..."
                />
                {q && (
                  <button
                    className="recipes-search-clear"
                    onClick={() => setQ('')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="recipes-toolbar-actions">
                <div className="recipes-view-controls">
                  <button
                    className={`view-control-btn ${viewMode === 'grid' ? 'view-control-btn--active' : ''}`}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid size={16} />
                    Grid
                  </button>
                  <button
                    className={`view-control-btn ${viewMode === 'list' ? 'view-control-btn--active' : ''}`}
                    onClick={() => setViewMode('list')}
                  >
                    <List size={16} />
                    List
                  </button>
                  <button
                    className={`view-control-btn ${viewMode === 'table' ? 'view-control-btn--active' : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    <BarChart3 size={16} />
                    Table
                  </button>
                </div>

                <div className="density-controls">
                  <button
                    className={`density-btn ${density === 'comfortable' ? 'density-btn--active' : ''}`}
                    onClick={() => setDensity('comfortable')}
                  >
                    Comfortable
                  </button>
                  <button
                    className={`density-btn ${density === 'dense' ? 'density-btn--active' : ''}`}
                    onClick={() => setDensity('dense')}
                  >
                    Dense
                  </button>
                  <button
                    className={`density-btn ${density === 'compact' ? 'density-btn--active' : ''}`}
                    onClick={() => setDensity('compact')}
                  >
                    Compact
                  </button>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => setShowArchived(!showArchived)}
                  icon={showArchived ? <EyeOff size={16} /> : <Eye size={16} />}
                >
                  {showArchived ? 'Hide' : 'Show'} Archived
                </Button>

                {selectedIds.length > 0 && (
                  <>
                    <Button variant="secondary" onClick={bulkArchive} icon={<Archive size={16} />}>
                      Archive ({selectedIds.length})
                    </Button>
                    <Button variant="danger" onClick={bulkDelete} icon={<Trash2 size={16} />}>
                      Delete ({selectedIds.length})
                    </Button>
                    <Button variant="ghost" onClick={clearSelection}>
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="filter-label">Sort by:</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--gc-border)',
                  background: 'var(--gc-background)',
                  color: 'var(--gc-text)'
                }}
              >
                <option value="name">Name</option>
                <option value="category">Category</option>
                <option value="price">Price</option>
                <option value="cost">Cost</option>
                <option value="margin">Margin</option>
                <option value="date">Date</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                style={{
                  padding: 4,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--gc-text)'
                }}
              >
                {sortOrder === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {err && (
            <div className="recipes-error">
              <AlertCircle size={20} />
              <span>{err}</span>
              <button onClick={() => setErr(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--gc-danger)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="recipes-loading">
              <Loader2 size={48} className="loading-spinner" />
            </div>
          ) : !sortedRecipes.length ? (
            <EmptyState
              icon={<ChefHat size={48} />}
              title={
                !hasAnyRecipes
                  ? 'No recipes yet'
                  : showArchivedEmptyHint
                    ? 'Only archived recipes found'
                    : hasSearch
                      ? 'No recipes match your search'
                      : 'No recipes to show'
              }
              description={
                !hasAnyRecipes
                  ? 'Create your first recipe to start costing and kitchen operations.'
                  : showArchivedEmptyHint
                    ? 'All recipes are archived right now. You can show them or create a new one.'
                    : hasSearch
                      ? 'Try a different search term or clear the search.'
                      : 'Create a new recipe to get started.'
              }
              primaryAction={{
                label: !hasAnyRecipes
                  ? 'Create first recipe'
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
                    searchInputRef.current?.focus()
                    return
                  }
                  createNewRecipe()
                },
              }}
              secondaryAction={{
                label: !hasAnyRecipes ? 'Browse ingredients' : 'Import recipes',
                onClick: !hasAnyRecipes ? () => nav('/ingredients') : importRecipes,
              }}
            />
          ) : (
            <>
              <div style={{ marginBottom: 12, color: 'var(--gc-text-light)' }}>
                Showing {sortedRecipes.length} of {recipes.length} recipes
              </div>

              {viewMode === 'grid' && renderGridView()}
              {viewMode === 'list' && renderListView()}
              {viewMode === 'table' && renderTableView()}
            </>
          )}
        </div>
      </div>

      <div className="toast-container">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={`toast toast--${toast.type}`}
            >
              <div className="toast-icon">
                {toast.type === 'success' && <CheckCircle size={20} />}
                {toast.type === 'error' && <XCircle size={20} />}
                {toast.type === 'warning' && <AlertTriangle size={20} />}
                {toast.type === 'info' && <Info size={20} />}
              </div>
              <div className="toast-content">
                <div className="toast-title">
                  {toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}
                </div>
                <div className="toast-message">{toast.message}</div>
              </div>
              <button className="toast-close" onClick={() => setToast(null)}>
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
