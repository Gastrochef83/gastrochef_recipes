// src/pages/recipes.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { useKitchen } from '../lib/kitchen'
import Button from '../components/ui/Button'
import EmptyState from '../components/EmptyState'

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
}

type RecipeRow = {
  id: string
  code?: string | null
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
  photo_url: string | null
  description: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  selling_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
}

type CostPoint = {
  at: number
  totalCost: number
  cpp: number
  fcPct: number | null
  margin: number
  marginPct: number | null
  warnings: string[]
}

type Density = 'comfortable' | 'dense'

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function convertQtyToPackUnit(qty: number, lineUnit: string, packUnit: string) {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  let conv = qty

  if (u === 'g' && p === 'kg') conv = qty / 1000
  else if (u === 'kg' && p === 'g') conv = qty * 1000
  else if (u === 'ml' && p === 'l') conv = qty / 1000
  else if (u === 'l' && p === 'ml') conv = qty * 1000

  return conv
}

const ING_REV_KEY = 'gc:ingredients:rev'

function getIngredientsRev(): string {
  try {
    return localStorage.getItem(ING_REV_KEY) || '0'
  } catch {
    return '0'
  }
}

function getCostCacheKey() {
  return `gc_v5_cost_cache_v1::rev:${getIngredientsRev()}`
}

const COST_TTL_MS = 10 * 60 * 1000

function loadCostCache(): Record<string, CostPoint> {
  try {
    const raw = localStorage.getItem(getCostCacheKey())
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, CostPoint>
    if (!obj || typeof obj !== 'object') return {}
    return obj
  } catch {
    return {}
  }
}

function saveCostCache(cache: Record<string, CostPoint>) {
  try {
    localStorage.setItem(getCostCacheKey(), JSON.stringify(cache))
  } catch {}
}

function recipeAccent(name: string) {
  const v = (name || '').trim().toLowerCase()
  if (v.includes('chicken')) return 'recipe-card--amber'
  if (v.includes('rice')) return 'recipe-card--gold'
  if (v.includes('salad') || v.includes('raita')) return 'recipe-card--mint'
  if (v.includes('soup')) return 'recipe-card--warm'
  return 'recipe-card--olive'
}

function recipeGlyph(name: string, category?: string | null) {
  const n = (name || '').toLowerCase()
  const c = (category || '').toLowerCase()

  if (n.includes('rice')) return '🍚'
  if (n.includes('chicken') || n.includes('biryani')) return '🍛'
  if (n.includes('salad') || n.includes('raita')) return '🥗'
  if (n.includes('soup')) return '🍲'
  if (c.includes('dessert')) return '🍰'
  if (c.includes('drink')) return '🥤'

  return '🍽'
}

function RecipesStyles() {
  return (
    <style>{`
      /* ===== CSS Variables ===== */
      .recipes-page-v7 {
        --primary: #2E7D78;
        --primary-light: #E8F3F2;
        --primary-dark: #1E5A56;
        --secondary: #C17B4A;
        --secondary-light: #E8A87C;
        --secondary-dark: #A55D2C;
        --success: #4CAF50;
        --warning: #FFC107;
        --danger: #F44336;
        --info: #2196F3;
        --text: #1E2A3A;
        --text-light: #64748B;
        --bg: #F8FAFC;
        --bg-card: #FFFFFF;
        --border: #E2E8F0;
        --shadow-sm: 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.02);
        --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
        --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
        --shadow-xl: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
        --gradient-primary: linear-gradient(135deg, #2E7D78, #1E5A56);
        --gradient-secondary: linear-gradient(135deg, #C17B4A, #A55D2C);
        --gradient-success: linear-gradient(135deg, #4CAF50, #2E7D32);
        --gradient-warning: linear-gradient(135deg, #FFC107, #FF8F00);
        --gradient-danger: linear-gradient(135deg, #F44336, #C62828);
        --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 16px;
        --radius-xl: 24px;
        --radius-full: 9999px;
      }

      @media (prefers-color-scheme: dark) {
        .recipes-page-v7 {
          --primary: #3B9B94;
          --primary-light: #2A5E5A;
          --primary-dark: #1E5A56;
          --secondary: #E8A87C;
          --secondary-light: #C17B4A;
          --secondary-dark: #A55D2C;
          --text: #F1F5F9;
          --text-light: #94A3B8;
          --bg: #0F172A;
          --bg-card: #1E293B;
          --border: #334155;
        }
      }

      .recipes-page-v7 {
        display: grid;
        gap: 24px;
        background: var(--bg);
        min-height: 100vh;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      /* ===== Header Section ===== */
      .recipes-header-v7 {
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        padding: 20px 24px;
        box-shadow: var(--shadow-md);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
        backdrop-filter: blur(8px);
        background: rgba(255, 255, 255, 0.9);
      }

      .recipes-header-left-v7 {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .recipes-header-icon-v7 {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-md);
        background: var(--gradient-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
        box-shadow: 0 8px 16px rgba(46, 125, 120, 0.2);
      }

      .recipes-header-title-v7 {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        background: var(--gradient-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
      }

      .recipes-header-subtitle-v7 {
        font-size: 0.875rem;
        color: var(--text-light);
        margin-top: 4px;
      }

      .recipes-header-actions-v7 {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* ===== Stats Cards ===== */
      .recipes-stats-v7 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .stat-card-v7 {
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        padding: 16px;
        box-shadow: var(--shadow-sm);
        transition: var(--transition);
        position: relative;
        overflow: hidden;
      }

      .stat-card-v7:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
        border-color: var(--primary);
      }

      .stat-card-v7::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--gradient-primary);
        opacity: 0;
        transition: var(--transition);
      }

      .stat-card-v7:hover::before {
        opacity: 1;
      }

      .stat-card-header-v7 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .stat-card-label-v7 {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-light);
      }

      .stat-card-icon-v7 {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-sm);
        background: var(--primary-light);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary);
      }

      .stat-card-value-v7 {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text);
        line-height: 1.2;
      }

      .stat-card-change-v7 {
        font-size: 0.75rem;
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--text-light);
      }

      .stat-card-change--positive-v7 {
        color: var(--success);
      }

      .stat-card-change--negative-v7 {
        color: var(--danger);
      }

      /* ===== Toolbar ===== */
      .recipes-toolbar-v7 {
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        padding: 16px 20px;
        box-shadow: var(--shadow-md);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
      }

      .recipes-toolbar-left-v7 {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 300px;
      }

      .recipes-search-v7 {
        position: relative;
        flex: 1;
      }

      .recipes-search-icon-v7 {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-light);
        width: 18px;
        height: 18px;
      }

      .recipes-search-input-v7 {
        width: 100%;
        height: 44px;
        padding: 0 16px 0 44px;
        border-radius: var(--radius-full);
        border: 2px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        font-size: 0.95rem;
        transition: var(--transition);
      }

      .recipes-search-input-v7:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(46, 125, 120, 0.1);
      }

      .recipes-search-clear-v7 {
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-light);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
      }

      .recipes-search-clear-v7:hover {
        background: var(--border);
        color: var(--text);
      }

      .recipes-filter-btn-v7 {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 44px;
        padding: 0 20px;
        border-radius: var(--radius-full);
        border: 2px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        white-space: nowrap;
      }

      .recipes-filter-btn-v7:hover {
        border-color: var(--primary);
        background: var(--primary-light);
        color: var(--primary-dark);
      }

      .recipes-filter-btn-v7--active {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
      }

      .recipes-view-controls-v7 {
        display: flex;
        align-items: center;
        gap: 4px;
        background: var(--bg);
        border-radius: var(--radius-full);
        padding: 2px;
        border: 1px solid var(--border);
      }

      .view-control-btn-v7 {
        padding: 8px 16px;
        border-radius: var(--radius-full);
        border: none;
        background: transparent;
        color: var(--text-light);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        white-space: nowrap;
      }

      .view-control-btn-v7:hover {
        color: var(--primary);
      }

      .view-control-btn-v7--active {
        background: white;
        color: var(--primary);
        box-shadow: var(--shadow-sm);
      }

      .recipes-density-btn-v7 {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 44px;
        padding: 0 20px;
        border-radius: var(--radius-full);
        border: 2px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
        white-space: nowrap;
      }

      .recipes-density-btn-v7:hover {
        border-color: var(--secondary);
        background: var(--secondary-light);
        color: var(--secondary-dark);
      }

      /* ===== Filter Bar ===== */
      .recipes-filters-v7 {
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        padding: 16px;
        box-shadow: var(--shadow-sm);
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        animation: slideDown 0.2s ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .filter-group-v7 {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        border-right: 1px solid var(--border);
      }

      .filter-group-v7:last-child {
        border-right: none;
      }

      .filter-label-v7 {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-light);
      }

      .filter-chip-v7 {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: var(--radius-full);
        background: var(--bg);
        border: 1px solid var(--border);
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text);
        cursor: pointer;
        transition: var(--transition);
      }

      .filter-chip-v7:hover {
        background: var(--border);
      }

      .filter-chip-v7--active {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
      }

      /* ===== Sort Bar ===== */
      .recipes-sort-v7 {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
      }

      .sort-label-v7 {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-light);
      }

      .sort-select-v7 {
        padding: 8px 32px 8px 16px;
        border-radius: var(--radius-full);
        border: 2px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
      }

      .sort-select-v7:focus {
        outline: none;
        border-color: var(--primary);
      }

      .sort-order-btn-v7 {
        padding: 8px;
        border-radius: var(--radius-full);
        border: 2px solid var(--border);
        background: var(--bg-card);
        color: var(--text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
      }

      .sort-order-btn-v7:hover {
        border-color: var(--primary);
        color: var(--primary);
      }

      /* ===== Recipe List ===== */
      .recipes-list-v7 {
        display: grid;
        gap: 12px;
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ===== Recipe Card ===== */
      .recipe-card-v7 {
        position: relative;
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        overflow: hidden;
        box-shadow: var(--shadow-sm);
        transition: var(--transition);
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

      .recipe-card-v7:hover {
        transform: translateY(-2px) scale(1.01);
        box-shadow: var(--shadow-xl);
        border-color: var(--primary);
      }

      .recipe-card-v7__accent {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 4px;
        background: var(--gradient-primary);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        opacity: 0;
        transition: var(--transition);
      }

      .recipe-card-v7:hover .recipe-card-v7__accent {
        opacity: 1;
      }

      .recipe-card--olive .recipe-card-v7__accent {
        background: linear-gradient(180deg, #748d3f, #97ab62);
      }

      .recipe-card--amber .recipe-card-v7__accent {
        background: linear-gradient(180deg, #b7791f, #d6a340);
      }

      .recipe-card--gold .recipe-card-v7__accent {
        background: linear-gradient(180deg, #b17f1e, #d2b35e);
      }

      .recipe-card--mint .recipe-card-v7__accent {
        background: linear-gradient(180deg, #4b8f73, #7fc3a4);
      }

      .recipe-card--warm .recipe-card-v7__accent {
        background: linear-gradient(180deg, #9b6b4e, #cd9a78);
      }

      .recipe-card-v7__body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
        padding: 16px 16px 16px 20px;
      }

      .recipe-card-v7__left {
        min-width: 0;
        display: grid;
        gap: 12px;
      }

      .recipe-card-v7__top {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
      }

      .recipe-card-v7__icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        background: var(--gradient-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        box-shadow: 0 4px 8px rgba(46, 125, 120, 0.2);
        transition: var(--transition);
      }

      .recipe-card-v7:hover .recipe-card-v7__icon {
        transform: scale(1.05) rotate(5deg);
      }

      .recipe-card-v7__titleRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .recipe-card-v7__titleWrap {
        min-width: 0;
        flex: 1 1 auto;
      }

      .recipe-card-v7__title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.2;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .recipe-card-v7__sub {
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        color: var(--text-light);
        font-size: 0.8rem;
        font-weight: 600;
      }

      .recipe-dot-v7 {
        color: var(--border);
      }

      .recipe-badges-v7 {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .recipe-badge-v7 {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: var(--radius-full);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
        border: 1px solid transparent;
        transition: var(--transition);
      }

      .recipe-badge-v7--soft {
        color: var(--primary-dark);
        background: var(--primary-light);
        border-color: var(--primary);
      }

      .recipe-badge-v7--neutral {
        color: var(--text);
        background: var(--bg);
        border-color: var(--border);
      }

      .recipe-badge-v7--archived {
        color: var(--text-light);
        background: rgba(100, 116, 139, 0.1);
        border-color: var(--border);
      }

      .recipe-badge-v7--warning {
        color: #9a5a00;
        background: rgba(255, 193, 7, 0.1);
        border-color: #FFC107;
      }

      .recipe-card-v7__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 16px;
        margin-left: 56px;
      }

      .recipe-meta-v7 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        background: var(--bg);
        border-radius: var(--radius-full);
        border: 1px solid var(--border);
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text);
      }

      .recipe-meta-v7__label {
        color: var(--text-light);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 800;
      }

      .recipe-card-v7__right {
        width: min(560px, 100%);
        display: grid;
        gap: 12px;
      }

      .recipe-card-v7__metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .metric-v7 {
        background: linear-gradient(135deg, var(--bg-card), var(--bg));
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        padding: 10px 12px;
        transition: var(--transition);
      }

      .metric-v7:hover {
        background: var(--primary-light);
        border-color: var(--primary);
        transform: translateY(-2px);
      }

      .metric-v7__label {
        color: var(--text-light);
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 800;
        line-height: 1;
      }

      .metric-v7__value {
        margin-top: 6px;
        color: var(--text);
        font-size: 1rem;
        font-weight: 900;
        line-height: 1.2;
        white-space: nowrap;
      }

      .metric-v7__value--warning {
        color: var(--danger);
      }

      .metric-v7__value--success {
        color: var(--success);
      }

      .recipe-actions-v7 {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .recipe-select-v7 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 14px;
        border-radius: var(--radius-md);
        border: 2px dashed var(--border);
        background: var(--bg);
        color: var(--text);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition);
      }

      .recipe-select-v7:hover {
        border-color: var(--primary);
        background: var(--primary-light);
      }

      .recipe-select-v7 input {
        width: 16px;
        height: 16px;
        accent-color: var(--primary);
        cursor: pointer;
      }

      /* ===== Loading State ===== */
      .recipes-loading-v7 {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border);
        box-shadow: var(--shadow-md);
      }

      .loading-spinner-v7 {
        width: 48px;
        height: 48px;
        border: 3px solid var(--border);
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* ===== Error State ===== */
      .recipes-error-v7 {
        background: rgba(244, 67, 54, 0.1);
        border: 2px solid var(--danger);
        border-radius: var(--radius-lg);
        padding: 16px 20px;
        color: var(--danger);
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: shake 0.5s ease-out;
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
        20%, 40%, 60%, 80% { transform: translateX(2px); }
      }

      /* ===== Responsive Design ===== */
      @media (max-width: 1280px) {
        .recipe-card-v7__body {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .recipe-card-v7__right {
          width: 100%;
        }

        .recipe-actions-v7 {
          justify-content: flex-start;
        }
      }

      @media (max-width: 1024px) {
        .recipes-page-v7 {
          padding: 16px;
        }

        .recipes-stats-v7 {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 820px) {
        .recipe-card-v7__top {
          grid-template-columns: 38px minmax(0, 1fr);
        }

        .recipe-card-v7__icon {
          width: 38px;
          height: 38px;
          font-size: 18px;
        }

        .recipe-card-v7__meta {
          margin-left: 0;
        }

        .recipe-card-v7__title {
          white-space: normal;
        }

        .recipe-card-v7__metrics {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (max-width: 640px) {
        .recipes-page-v7 {
          padding: 12px;
        }

        .recipes-header-v7 {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipes-header-actions-v7 {
          width: 100%;
        }

        .recipes-header-actions-v7 > * {
          flex: 1;
        }

        .recipes-toolbar-v7 {
          flex-direction: column;
          align-items: stretch;
        }

        .recipes-toolbar-left-v7 {
          flex-direction: column;
          align-items: stretch;
        }

        .recipes-stats-v7 {
          grid-template-columns: 1fr;
        }

        .recipes-view-controls-v7 {
          width: 100%;
        }

        .view-control-btn-v7 {
          flex: 1;
          text-align: center;
        }

        .recipe-card-v7__titleRow {
          flex-direction: column;
          align-items: flex-start;
        }

        .recipe-badges-v7 {
          justify-content: flex-start;
        }

        .recipe-card-v7__metrics {
          grid-template-columns: 1fr;
        }

        .recipe-actions-v7 > * {
          width: 100%;
        }

        .recipe-select-v7 {
          width: 100%;
          justify-content: center;
        }
      }

      @media (max-width: 480px) {
        .recipes-header-v7 {
          padding: 16px;
        }

        .recipes-toolbar-v7 {
          padding: 12px;
        }

        .recipe-card-v7__body {
          padding: 12px;
        }
      }

      /* ===== Print Styles ===== */
      @media print {
        .recipes-page-v7 {
          background: white;
          padding: 0;
        }

        .recipes-header-actions-v7,
        .recipes-toolbar-v7,
        .recipes-filters-v7,
        .recipes-sort-v7,
        .recipe-actions-v7,
        .recipe-select-v7 {
          display: none !important;
        }

        .recipe-card-v7 {
          break-inside: avoid;
          border: 1px solid #000;
          box-shadow: none;
        }
      }

      /* ===== Utility Classes ===== */
      .text-primary-v7 { color: var(--primary); }
      .text-secondary-v7 { color: var(--secondary); }
      .text-success-v7 { color: var(--success); }
      .text-warning-v7 { color: var(--warning); }
      .text-danger-v7 { color: var(--danger); }

      .bg-primary-v7 { background: var(--primary); }
      .bg-secondary-v7 { background: var(--secondary); }
      .bg-success-v7 { background: var(--success); }
      .bg-warning-v7 { background: var(--warning); }
      .bg-danger-v7 { background: var(--danger); }

      .font-bold-v7 { font-weight: 700; }
      .font-extrabold-v7 { font-weight: 800; }
      .font-black-v7 { font-weight: 900; }

      .mt-1 { margin-top: 4px; }
      .mt-2 { margin-top: 8px; }
      .mt-3 { margin-top: 12px; }
      .mt-4 { margin-top: 16px; }
      .mt-5 { margin-top: 24px; }

      .mb-1 { margin-bottom: 4px; }
      .mb-2 { margin-bottom: 8px; }
      .mb-3 { margin-bottom: 12px; }
      .mb-4 { margin-bottom: 16px; }
      .mb-5 { margin-bottom: 24px; }

      .p-1 { padding: 4px; }
      .p-2 { padding: 8px; }
      .p-3 { padding: 12px; }
      .p-4 { padding: 16px; }
      .p-5 { padding: 24px; }

      .flex { display: flex; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .justify-center { justify-content: center; }
      .gap-1 { gap: 4px; }
      .gap-2 { gap: 8px; }
      .gap-3 { gap: 12px; }
      .gap-4 { gap: 16px; }

      .w-full { width: 100%; }
      .h-full { height: 100%; }

      .cursor-pointer { cursor: pointer; }
      .select-none { user-select: none; }

      .transition-all { transition: all 0.2s ease; }
      .hover-scale:hover { transform: scale(1.02); }
      .hover-lift:hover { transform: translateY(-2px); }
    `}</style>
  )
}

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

  const [toast, setToast] = useState<string | null>(null)
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
  const [costCache, setCostCache] = useState<Record<string, CostPoint>>(() => loadCostCache())

  const [density, setDensity] = useState<Density>(() => {
    try {
      const v = localStorage.getItem('gc_v5_density')
      return v === 'dense' ? 'dense' : 'comfortable'
    } catch {
      return 'comfortable'
    }
  })

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('gc:prefill:recipes')
      if (v && typeof v === 'string') {
        setQ(v)
        sessionStorage.removeItem('gc:prefill:recipes')
      }
    } catch {}
  }, [loc.pathname, loc.hash])

  useEffect(() => {
    try {
      const d = density === 'dense' ? 'compact' : 'comfort'
      document.documentElement.setAttribute('data-density', d)
      localStorage.setItem('gc_density', d)
      localStorage.setItem('gc_v5_density', density)
    } catch {}
  }, [density])

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((key) => selected[key]),
    [selected]
  )

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = recipes

    if (!showArchived) list = list.filter((r) => !r.is_archived)
    if (!s) return list

    return list.filter((r) => {
      const a = (r.name || '').toLowerCase()
      const b = (r.category || '').toLowerCase()
      return a.includes(s) || b.includes(s)
    })
  }, [recipes, q, showArchived])

  const hasAnyRecipes = recipes.length > 0
  const hasActiveRecipes = useMemo(() => recipes.some((r) => !r.is_archived), [recipes])
  const hasSearch = q.trim().length > 0
  const showArchivedEmptyHint = !showArchived && hasAnyRecipes && !hasActiveRecipes

  const stats = useMemo(() => {
    const total = recipes.length
    const active = recipes.filter(r => !r.is_archived).length
    const archived = total - active
    const subrecipes = recipes.filter(r => r.is_subrecipe).length
    const totalCost = Object.values(costCache).reduce((sum, c) => sum + c.totalCost, 0)
    const avgCost = active > 0 ? totalCost / active : 0
    
    return {
      total,
      active,
      archived,
      subrecipes,
      totalCost,
      avgCost
    }
  }, [recipes, costCache])

  async function loadAll() {
    if (mountedRef.current) {
      setLoading(true)
      setErr(null)
    }

    try {
      const selectRecipes = `
        id,
        code,
        kitchen_id,
        name,
        category,
        portions,
        yield_qty,
        yield_unit,
        is_subrecipe,
        is_archived,
        photo_url,
        description,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        selling_price,
        currency,
        target_food_cost_pct
      `

      const { data: r, error: rErr } = await supabase
        .from('recipes')
        .select(selectRecipes)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })

      if (rErr) throw rErr
      if (mountedRef.current) setRecipes((r ?? []) as RecipeRow[])

      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
        .order('name', { ascending: true })

      if (iErr) throw iErr
      if (mountedRef.current) setIngredients((i ?? []) as Ingredient[])
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to load recipes')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureRecipeLinesLoaded(ids: string[]) {
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
  }

  const costMemo = useMemo(() => {
    const memo = new Map<string, { cost: number; warnings: string[] }>()

    for (const r of recipes) {
      const lines = recipeLinesCache[r.id]
      if (!lines) continue

      let cost = 0
      const warnings: string[] = []

      for (const l of lines) {
        if (l.line_type === 'group') continue
        if (l.line_type === 'subrecipe') continue

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
        cost += Number.isFinite(lineCost) ? lineCost : 0
      }

      memo.set(r.id, { cost, warnings })
    }

    return memo
  }, [recipes, recipeLinesCache, ingById])

  useEffect(() => {
    if (loading) return
    if (!filtered.length) return

    const visible = filtered.slice(0, 50)
    ensureRecipeLinesLoaded(visible.map((r) => r.id)).catch(() => {})

    const now = Date.now()
    const nextCache: Record<string, CostPoint> = { ...costCache }
    let changed = false

    for (const r of visible) {
      const rid = r.id
      const hit = nextCache[rid]

      if (hit && now - hit.at < COST_TTL_MS) continue
      if (!recipeLinesCache[rid]) continue

      const totalRes = costMemo.get(rid) || { cost: 0, warnings: [] }
      const totalCost = totalRes.cost
      const portionsN = Math.max(1, toNum(r.portions, 1))
      const cpp = portionsN > 0 ? totalCost / portionsN : 0
      const sell = Math.max(0, toNum(r.selling_price, 0))
      const fcPct = sell > 0 ? (cpp / sell) * 100 : null
      const margin = sell - cpp
      const marginPct = sell > 0 ? (margin / sell) * 100 : null

      nextCache[rid] = {
        at: now,
        totalCost,
        cpp,
        fcPct,
        margin,
        marginPct,
        warnings: totalRes.warnings,
      }

      changed = true
    }

    if (changed) {
      if (mountedRef.current) setCostCache(nextCache)
      saveCostCache(nextCache)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, recipeLinesCache, costMemo])

  async function createNewRecipe() {
    if (mountedRef.current) setErr(null)

    try {
      if (!k.kitchenId) {
        throw new Error('Kitchen not ready yet.\nPlease wait a second and try again.')
      }

      const payload: Partial<RecipeRow> = {
        kitchen_id: k.kitchenId,
        name: 'New Recipe',
        category: null,
        portions: 1,
        is_subrecipe: false,
        is_archived: false,
        description: '',
        photo_url: null,
      }

      const { data, error } = await supabase
        .from('recipes')
        .insert(payload as any)
        .select('id')
        .single()

      if (error) throw error

      const id = (data as any)?.id as string
      if (mountedRef.current) setToast('Created. Opening editor…')
      nav(`/recipe?id=${encodeURIComponent(id)}`)
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to create recipe')
    }
  }

  async function toggleArchive(r: RecipeRow) {
    try {
      const next = !r.is_archived
      const { error } = await supabase
        .from('recipes')
        .update({ is_archived: next })
        .eq('id', r.id)

      if (error) throw error

      if (mountedRef.current) {
        setRecipes((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_archived: next } : x)))
        setToast(next ? 'Archived.' : 'Restored.')
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to update recipe')
    }
  }

  function toggleSelect(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }))
  }

  function clearSelection() {
    setSelected({})
  }

  async function deleteOneRecipe(recipeId: string) {
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
        setToast('Deleted.')
      }
    } catch (e: any) {
      if (mountedRef.current) setErr(e?.message || 'Failed to delete recipe')
    }
  }

  return (
    <>
      <RecipesStyles />

      <div className="recipes-page-v7">
        {/* Header */}
        <div className="recipes-header-v7">
          <div className="recipes-header-left-v7">
            <div className="recipes-header-icon-v7">
              <span>🍳</span>
            </div>
            <div>
              <h1 className="recipes-header-title-v7">Recipe Management</h1>
              <p className="recipes-header-subtitle-v7">
                {isMgmt ? 'Costing, pricing & analytics' : 'Kitchen operations & production'}
              </p>
            </div>
          </div>

          <div className="recipes-header-actions-v7">
            <Button onClick={createNewRecipe}>New recipe</Button>

            <Button variant="secondary" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                const next = density === 'dense' ? 'comfortable' : 'dense'
                setDensity(next)
                localStorage.setItem('gc_v5_density', next)
              }}
            >
              Density: {density}
            </Button>

            {selectedIds.length > 0 && (
              <Button variant="ghost" onClick={clearSelection}>
                Clear ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="recipes-stats-v7">
          <div className="stat-card-v7">
            <div className="stat-card-header-v7">
              <span className="stat-card-label-v7">Total Recipes</span>
              <div className="stat-card-icon-v7">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
              </div>
            </div>
            <div className="stat-card-value-v7">{stats.total}</div>
            <div className="stat-card-change-v7">
              <span className="stat-card-change--positive-v7">↑ {stats.active} active</span>
            </div>
          </div>

          <div className="stat-card-v7">
            <div className="stat-card-header-v7">
              <span className="stat-card-label-v7">Subrecipes</span>
              <div className="stat-card-icon-v7">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
            </div>
            <div className="stat-card-value-v7">{stats.subrecipes}</div>
            <div className="stat-card-change-v7">
              <span>components</span>
            </div>
          </div>

          <div className="stat-card-v7">
            <div className="stat-card-header-v7">
              <span className="stat-card-label-v7">Avg Cost</span>
              <div className="stat-card-icon-v7">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="6" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <div className="stat-card-value-v7">
              {stats.avgCost.toFixed(2)} {recipes[0]?.currency || 'USD'}
            </div>
            <div className="stat-card-change-v7">
              <span>per recipe</span>
            </div>
          </div>

          <div className="stat-card-v7">
            <div className="stat-card-header-v7">
              <span className="stat-card-label-v7">Archived</span>
              <div className="stat-card-icon-v7">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" rx="2" ry="2" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
              </div>
            </div>
            <div className="stat-card-value-v7">{stats.archived}</div>
            <div className="stat-card-change-v7">
              <span className="stat-card-change--negative-v7">↓ archived</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="recipes-toolbar-v7">
          <div className="recipes-toolbar-left-v7">
            <div className="recipes-search-v7">
              <svg className="recipes-search-icon-v7" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="recipes-search-input-v7"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or category..."
              />
              {q && (
                <button
                  className="recipes-search-clear-v7"
                  onClick={() => setQ('')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <button
              className={`recipes-filter-btn-v7 ${showFilters ? 'recipes-filter-btn-v7--active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
              </svg>
              Filters
            </button>
          </div>

          <div className="recipes-header-actions-v7">
            <div className="recipes-view-controls-v7">
              <button
                className={`view-control-btn-v7 ${viewMode === 'grid' ? 'view-control-btn-v7--active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Grid
              </button>
              <button
                className={`view-control-btn-v7 ${viewMode === 'list' ? 'view-control-btn-v7--active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                List
              </button>
            </div>

            <button className="recipes-density-btn-v7" onClick={() => {
              const next = density === 'dense' ? 'comfortable' : 'dense'
              setDensity(next)
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              {density === 'dense' ? 'Compact' : 'Comfort'}
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="recipes-filters-v7">
            <div className="filter-group-v7">
              <span className="filter-label-v7">Category</span>
              <button className="filter-chip-v7 filter-chip-v7--active">All</button>
              <button className="filter-chip-v7">Appetizer</button>
              <button className="filter-chip-v7">Main</button>
              <button className="filter-chip-v7">Dessert</button>
            </div>
            
            <div className="filter-group-v7">
              <span className="filter-label-v7">Status</span>
              <button className="filter-chip-v7 filter-chip-v7--active">All</button>
              <button className="filter-chip-v7">Active</button>
              <button className="filter-chip-v7">Archived</button>
            </div>

            <Button variant="ghost" size="small">
              Clear all
            </Button>
          </div>
        )}

        {/* Sort Bar */}
        <div className="recipes-sort-v7">
          <span className="sort-label-v7">Sort by:</span>
          <select className="sort-select-v7" value="name">
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="cost">Cost</option>
            <option value="date">Date</option>
          </select>
          <button className="sort-order-btn-v7">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        </div>

        {err && (
          <div className="recipes-error-v7">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{err}</span>
          </div>
        )}

        {loading ? (
          <div className="recipes-loading-v7">
            <div className="loading-spinner-v7" />
          </div>
        ) : !filtered.length ? (
          <EmptyState
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
                  return
                }
                createNewRecipe()
              },
            }}
            secondaryAction={{
              label: !hasAnyRecipes ? 'Add ingredient' : 'New recipe',
              onClick: () => {
                if (!hasAnyRecipes) {
                  nav('/ingredients')
                  return
                }
                createNewRecipe()
              },
            }}
            icon="🍳"
          />
        ) : (
          <div className="recipes-list-v7">
            {filtered.map((r) => {
              const c = costCache[r.id]
              const cur = (r.currency || 'USD').toUpperCase()
              const accentClass = recipeAccent(r.name)
              const glyph = recipeGlyph(r.name, r.category)
              const hasWarning = Boolean(c?.warnings?.length)
              const portions = toNum(r.portions, 1)

              return (
                <div
                  key={r.id}
                  className={`recipe-card-v7 ${accentClass}`}
                >
                  <div className="recipe-card-v7__accent" />

                  <div className="recipe-card-v7__body">
                    <div className="recipe-card-v7__left">
                      <div className="recipe-card-v7__top">
                        <div className="recipe-card-v7__icon" aria-hidden="true">
                          <span>{glyph}</span>
                        </div>

                        <div>
                          <div className="recipe-card-v7__titleRow">
                            <div className="recipe-card-v7__titleWrap">
                              <h3 className="recipe-card-v7__title">{r.name}</h3>
                              <div className="recipe-card-v7__sub">
                                <span>{r.category || 'Uncategorized'}</span>
                                <span className="recipe-dot-v7">•</span>
                                {r.is_subrecipe ? (
                                  <span className="recipe-badge-v7 recipe-badge-v7--neutral">
                                    Subrecipe
                                  </span>
                                ) : (
                                  <span className="recipe-badge-v7 recipe-badge-v7--soft">
                                    Recipe
                                  </span>
                                )}
                                {hasWarning ? (
                                  <span className="recipe-badge-v7 recipe-badge-v7--warning">
                                    ⚠ Missing price
                                  </span>
                                ) : null}
                                {r.is_archived ? (
                                  <span className="recipe-badge-v7 recipe-badge-v7--archived">
                                    Archived
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="recipe-badges-v7" />
                          </div>
                        </div>
                      </div>

                      <div className="recipe-card-v7__meta">
                        <div className="recipe-meta-v7">
                          <span className="recipe-meta-v7__label">Portions</span>
                          <span>{portions}</span>
                        </div>

                        <div className="recipe-meta-v7">
                          <span className="recipe-meta-v7__label">Yield</span>
                          <span>
                            {r.yield_qty
                              ? `${r.yield_qty}${r.yield_unit ? ` ${r.yield_unit}` : ''}`
                              : '—'}
                          </span>
                        </div>

                        {r.calories && (
                          <div className="recipe-meta-v7">
                            <span className="recipe-meta-v7__label">Cal</span>
                            <span>{r.calories}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="recipe-card-v7__right">
                      <div className="recipe-card-v7__metrics">
                        <div className="metric-v7">
                          <div className="metric-v7__label">Cost / Portion</div>
                          <div className="metric-v7__value">
                            {c ? `${c.cpp.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>

                        <div className="metric-v7">
                          <div className="metric-v7__label">FC%</div>
                          <div className={`metric-v7__value ${c?.fcPct && c.fcPct > 30 ? 'metric-v7__value--warning' : 'metric-v7__value--success'}`}>
                            {c?.fcPct != null ? `${c.fcPct.toFixed(1)}%` : '—'}
                          </div>
                        </div>

                        <div className="metric-v7">
                          <div className="metric-v7__label">Margin</div>
                          <div className="metric-v7__value">
                            {c ? `${c.margin.toFixed(2)} ${cur}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="recipe-actions-v7">
                        <Button onClick={() => nav(`/recipe?id=${encodeURIComponent(r.id)}`)}>
                          Open
                        </Button>

                        <Button variant="secondary" onClick={() => toggleArchive(r)}>
                          {r.is_archived ? 'Restore' : 'Archive'}
                        </Button>

                        <Button variant="danger" onClick={() => deleteOneRecipe(r.id)}>
                          Delete
                        </Button>

                        <label className="recipe-select-v7">
                          <input
                            type="checkbox"
                            checked={!!selected[r.id]}
                            onChange={() => toggleSelect(r.id)}
                          />
                          <span>Select</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    </>
  )
}
