// src/pages/RecipeEditor.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import Button from '../components/ui/Button'
import { useMode } from '../lib/mode'
import { getIngredientsCached } from '../lib/ingredientsCache'
import { CostTimeline } from '../components/CostTimeline'
import { addCostPoint, clearCostPoints, listCostPoints, deleteCostPoint } from '../lib/costHistory'
import { useKitchen } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import { exportRecipeExcelUltra } from '../utils/exportRecipeExcelUltra'

// ============================================================================
// 🎨 DESIGN TOKENS - نظام التصميم الموحد
// ============================================================================
const DesignTokens = (
  <style>{`
    :root {
      /* Primary Palette - Teal/Emerald */
      --color-primary-50:  #f0fdfa;
      --color-primary-100: #ccfbf1;
      --color-primary-200: #99f6e4;
      --color-primary-300: #5eead4;
      --color-primary-400: #2dd4bf;
      --color-primary-500: #14b8a6;
      --color-primary-600: #0d9488;
      --color-primary-700: #0f766e;
      --color-primary-800: #115e59;
      --color-primary-900: #134e4a;

      /* Secondary Palette - Amber/Warm */
      --color-secondary-50:  #fffbeb;
      --color-secondary-100: #fef3c7;
      --color-secondary-200: #fde68a;
      --color-secondary-300: #fcd34d;
      --color-secondary-400: #fbbf24;
      --color-secondary-500: #f59e0b;
      --color-secondary-600: #d97706;
      --color-secondary-700: #b45309;

      /* Neutral Palette */
      --color-neutral-50:  #f8fafc;
      --color-neutral-100: #f1f5f9;
      --color-neutral-200: #e2e8f0;
      --color-neutral-300: #cbd5e1;
      --color-neutral-400: #94a3b8;
      --color-neutral-500: #64748b;
      --color-neutral-600: #475569;
      --color-neutral-700: #334155;
      --color-neutral-800: #1e293b;
      --color-neutral-900: #0f172a;

      /* Semantic Colors */
      --color-success: #22c55e;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
      --color-info: #3b82f6;

      /* Backgrounds */
      --bg-primary: #ffffff;
      --bg-secondary: #f8fafc;
      --bg-tertiary: #f1f5f9;

      /* Borders */
      --border-light: rgba(148, 163, 184, 0.2);
      --border-medium: rgba(148, 163, 184, 0.4);
      --border-strong: rgba(148, 163, 184, 0.8);

      /* Shadows */
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);

      /* Transitions */
      --transition-fast: 150ms ease;
      --transition-normal: 250ms ease;

      /* Border Radius */
      --radius-sm: 0.375rem;
      --radius-md: 0.5rem;
      --radius-lg: 0.75rem;
      --radius-xl: 1rem;
      --radius-2xl: 1.5rem;
      --radius-full: 9999px;

      /* Typography */
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }

    /* Dark Mode Support */
    [data-theme="dark"] {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --color-neutral-50: #0f172a;
      --color-neutral-900: #ffffff;
    }
  `}</style>
)

// ============================================================================
// 🎨 COMPONENT STYLES - أنماط المكونات
// ============================================================================
const ComponentStyles = (
  <style>{`
    /* === Base Components === */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: var(--radius-lg);
      border: 2px solid transparent;
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.25);
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
      color: white;
      box-shadow: var(--shadow-md);
    }

    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700));
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .btn-secondary {
      background: var(--bg-primary);
      color: var(--color-neutral-700);
      border-color: var(--border-medium);
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--bg-secondary);
      border-color: var(--color-primary-400);
      color: var(--color-primary-700);
      transform: translateY(-1px);
    }

    .btn-ghost {
      background: transparent;
      color: var(--color-neutral-600);
      border-color: transparent;
    }

    .btn-ghost:hover:not(:disabled) {
      background: var(--bg-secondary);
      color: var(--color-neutral-800);
    }

    .btn-danger {
      background: var(--color-error);
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-2px);
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      border-radius: var(--radius-md);
    }

    .btn-icon {
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border-radius: var(--radius-lg);
    }

    /* === Inputs === */
    .input {
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      color: var(--color-neutral-800);
      background: var(--bg-primary);
      border: 2px solid var(--border-light);
      border-radius: var(--radius-lg);
      transition: all var(--transition-fast);
    }

    .input::placeholder {
      color: var(--color-neutral-400);
    }

    .input:hover {
      border-color: var(--border-medium);
    }

    .input:focus {
      outline: none;
      border-color: var(--color-primary-500);
      box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
    }

    .input:disabled {
      background: var(--bg-tertiary);
      color: var(--color-neutral-400);
      cursor: not-allowed;
    }

    .select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 1.25rem;
      padding-right: 2.5rem;
      cursor: pointer;
    }

    .textarea {
      min-height: 100px;
      resize: vertical;
      line-height: 1.6;
    }

    /* === Cards === */
    .card {
      background: var(--bg-primary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-md);
      transition: all var(--transition-normal);
      overflow: hidden;
      margin-bottom: 1.25rem;
    }

    .card:hover {
      border-color: var(--color-primary-300);
      box-shadow: var(--shadow-lg);
      transform: translateY(-2px);
    }

    .card-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-light);
      background: linear-gradient(to right, rgba(20, 184, 166, 0.03), transparent);
    }

    .card-body {
      padding: 1.5rem;
    }

    .card-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-light);
      background: var(--bg-secondary);
    }

    .card-soft {
      background: var(--bg-secondary);
      border: 1px dashed var(--border-light);
      border-radius: var(--radius-xl);
    }

    /* === KPI Cards === */
    .kpi-card {
      background: linear-gradient(145deg, var(--bg-primary), var(--bg-secondary));
      border: 1px solid var(--border-light);
      border-radius: var(--radius-xl);
      padding: 1.25rem;
      position: relative;
      overflow: hidden;
      transition: all var(--transition-fast);
    }

    .kpi-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-400));
      opacity: 0.7;
    }

    .kpi-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-neutral-500);
      margin-bottom: 0.5rem;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--color-neutral-800);
      font-family: var(--font-mono);
    }

    /* === Tables === */
    .table-container {
      background: var(--bg-primary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-xl);
      overflow: hidden;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      table-layout: fixed;
    }

    .table thead {
      background: linear-gradient(to bottom, var(--bg-secondary), var(--bg-tertiary));
      border-bottom: 2px solid var(--border-medium);
    }

    .table th {
      padding: 0.75rem 1rem;
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-neutral-600);
      text-align: left;
      border-right: 1px solid var(--border-light);
    }

    .table th:last-child {
      border-right: none;
    }

    .table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-light);
      border-right: 1px solid var(--border-light);
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .table td:last-child {
      border-right: none;
    }

    .table tbody tr:hover {
      background: rgba(20, 184, 166, 0.04);
    }

    .table tbody tr.has-note {
      background: rgba(245, 158, 11, 0.03);
    }

    .row-group {
      background: linear-gradient(to right, rgba(20, 184, 166, 0.05), rgba(245, 158, 11, 0.05));
      font-weight: 600;
    }

    @keyframes flash-row {
      0%, 100% { background: transparent; }
      50% { background: rgba(20, 184, 166, 0.15); }
    }

    .row-flash {
      animation: flash-row 0.5s ease;
    }

    /* === Badges === */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: var(--radius-full);
      white-space: nowrap;
    }

    .badge-primary {
      background: rgba(20, 184, 166, 0.15);
      color: var(--color-primary-700);
    }

    .badge-secondary {
      background: rgba(245, 158, 11, 0.15);
      color: var(--color-secondary-700);
    }

    .badge-success {
      background: rgba(34, 197, 94, 0.15);
      color: #166534;
    }

    /* === Status Indicators === */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-dot.saving {
      background: var(--color-primary-500);
      animation: pulse 2s infinite;
    }

    .status-dot.saved {
      background: var(--color-success);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.1); }
    }

    /* === Warning Banner === */
    .banner-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--radius-lg);
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* === Section Navigation === */
    .section-nav {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
    }

    .section-btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-neutral-600);
      background: transparent;
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .section-btn:hover {
      color: var(--color-primary-600);
      background: rgba(20, 184, 166, 0.1);
    }

    .section-btn.active {
      color: var(--color-primary-700);
      background: rgba(20, 184, 166, 0.15);
      font-weight: 600;
    }

    /* === Grid System === */
    .grid {
      display: grid;
      gap: 1.5rem;
    }

    .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
    .grid-cols-12 { grid-template-columns: repeat(12, 1fr); }

    .col-span-12 { grid-column: span 12; }
    .col-span-6 { grid-column: span 6; }
    .col-span-4 { grid-column: span 4; }
    .col-span-3 { grid-column: span 3; }

    @media (max-width: 1024px) {
      .grid-cols-4 { grid-template-columns: repeat(2, 1fr); }
      .col-span-6, .col-span-4, .col-span-3 { grid-column: span 12; }
    }

    @media (max-width: 640px) {
      .grid-cols-2, .grid-cols-3, .grid-cols-4 {
        grid-template-columns: 1fr;
      }
    }

    /* === Typography === */
    .text-display {
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      color: var(--color-neutral-900);
    }

    .text-heading {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.2;
      color: var(--color-neutral-800);
    }

    .text-subheading {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-neutral-700);
    }

    .text-body {
      font-size: 1rem;
      font-weight: 400;
      line-height: 1.5;
      color: var(--color-neutral-600);
    }

    .text-caption {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .text-primary { color: var(--color-primary-600); }
    .text-secondary { color: var(--color-secondary-600); }
    .text-success { color: var(--color-success); }
    .text-warning { color: var(--color-warning); }
    .text-error { color: var(--color-error); }
    .text-muted { color: var(--color-neutral-500); }

    /* === Utilities === */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-4 { gap: 1rem; }
    .gap-6 { gap: 1.5rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-4 { margin-top: 1rem; }
    .p-2 { padding: 0.5rem; }
    .p-4 { padding: 1rem; }
    .rounded-lg { border-radius: var(--radius-lg); }
    .rounded-xl { border-radius: var(--radius-xl); }
    .rounded-full { border-radius: var(--radius-full); }
    .font-mono { font-family: var(--font-mono); }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }

    /* === Loading States === */
    .skeleton {
      background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%);
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
      border-radius: var(--radius-md);
    }

    @keyframes skeleton-loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* === Accessibility === */
    *:focus-visible {
      outline: 2px solid var(--color-primary-500);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `}</style>
)

// ============================================================================
// TYPES
// ============================================================================
type LineType = 'ingredient' | 'subrecipe' | 'group'
type Recipe = {
  id: string
  code?: string | null
  code_category?: string | null
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
  photo_url?: string | null
  description?: string | null
  method?: string | null
  method_steps?: string[] | null
  method_step_photos?: string[] | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  selling_price?: number | null
  currency?: string | null
  target_food_cost_pct?: number | null
}
type Ingredient = {
  id: string
  code?: string | null
  code_category?: string | null
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean | null
}
type Line = {
  id: string
  kitchen_id: string | null
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  position: number
  qty: number
  unit: string
  yield_percent: number
  notes: string | null
  gross_qty_override: number | null
  line_type: LineType
  group_title: string | null
}

// ============================================================================
// UTILITY FUNCTIONS (UNCHANGED)
// ============================================================================
function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function fmtMoney(n: number, currency: string) {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

function fmtQty(n: number) {
  const v = Number.isFinite(n) ? n : 0
  if (Math.abs(v) >= 1000) return v.toFixed(0)
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(3)
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

function uid() {
  return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

const draftKey = (rid: string) => `gc_recipe_lines_draft__${rid}`

function readDraftLines(rid: string): Line[] {
  try {
    const raw = localStorage.getItem(draftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Line[]
  } catch {
    return []
  }
}

function writeDraftLines(rid: string, lines: Line[]) {
  try {
    localStorage.setItem(draftKey(rid), JSON.stringify(lines))
  } catch {
    // ignore
  }
}

function clearDraftLines(rid: string) {
  try {
    localStorage.removeItem(draftKey(rid))
  } catch {
    // ignore
  }
}

function mergeDbAndDraft(db: Line[], draft: Line[]): Line[] {
  const byId = new Set((db || []).map((l) => l.id))
  const extra = (draft || []).filter((l) => l && l.id && !byId.has(l.id))
  const merged = [...(db || []), ...extra]
  merged.sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
  return merged
}

const PHOTO_BUCKET = 'recipe-photos'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function RecipeEditor() {
  const { isKitchen, isMgmt } = useMode()
  const showCost = isMgmt
  const tableColSpan = 8 + (showCost ? 1 : 0)
  const k = useKitchen()
  const canEditCodes = k.isOwner
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const id = sp.get('id')
  const autosave = useAutosave()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])

  const setLinesSafe = useCallback(
    (updater: any) => {
      setLines((prev) => {
        try {
          if (typeof updater === 'function') return updater(prev)
          if (Array.isArray(updater)) return updater
          return prev
        } catch (e) {
          console.error('setLinesSafe prevented crash', e)
          return prev
        }
      })
    },
    [setLines]
  )

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }, [])

  // Meta fields
  const [code, setCode] = useState('')
  const [codeCategory, setCodeCategory] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [newStep, setNewStep] = useState('')
  const [methodLegacy, setMethodLegacy] = useState('')
  const [stepPhotos, setStepPhotos] = useState<string[]>([])
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')
  const [isSubRecipe, setIsSubRecipe] = useState(false)
  const [yieldQty, setYieldQty] = useState('')
  const [yieldUnit, setYieldUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')
  const [uploading, setUploading] = useState(false)
  const [stepUploading, setStepUploading] = useState(false)

  const [density, setDensity] = useState<'comfort' | 'compact'>(() => {
    try {
      const v = localStorage.getItem('gc_density')
      if (v === 'compact' || v === 'comfort') return v
      const v2 = localStorage.getItem('gc_v5_density')
      return v2 === 'dense' ? 'compact' : 'comfort'
    } catch {
      return 'comfort'
    }
  })

  useEffect(() => {
    try {
      const d = density === 'compact' ? 'compact' : 'comfort'
      document.documentElement.setAttribute('data-density', d)
      localStorage.setItem('gc_density', d)
      localStorage.setItem('gc_v5_density', d === 'compact' ? 'dense' : 'comfortable')
    } catch {}
  }, [density])

  const [activeSection, setActiveSection] = useState<string>('sec-basics')

  useEffect(() => {
    const ids = ['sec-basics', 'sec-method', 'sec-nutrition', 'sec-lines', 'sec-print', 'sec-cook', 'sec-cost']
    const els = ids.map((x) => document.getElementById(x)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio - a.intersectionRatio))
        const top = visible[0]
        if (top?.target?.id) setActiveSection(top.target.id)
      },
      { root: null, rootMargin: '-20% 0px -70% 0px', threshold: [0.05, 0.1, 0.2, 0.35] }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const scrollToSection = useCallback((anchorId: string) => {
    try {
      const el = document.getElementById(anchorId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {}
  }, [])

  const [addType, setAddType] = useState<LineType>('ingredient')
  const [ingSearch, setIngSearch] = useState('')
  const [addNote, setAddNote] = useState('')
  const cur = (currency || 'USD').toUpperCase()

  const visibleLines = useMemo(
    () => [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [lines]
  )

  const filteredIngredients = useMemo(() => {
    const s = ingSearch.trim().toLowerCase()
    let list = ingredients
    if (s) list = list.filter((i) => (i.name || '').toLowerCase().includes(s))
    return list.slice(0, 60)
  }, [ingredients, ingSearch])

  const subRecipeOptions = useMemo(() => {
    const list = allRecipes.filter((r) => !!r.is_subrecipe && !r.is_archived)
    return list.slice(0, 200)
  }, [allRecipes])

  const [addIngredientId, setAddIngredientId] = useState('')
  const [addSubRecipeId, setAddSubRecipeId] = useState('')
  const [addGroupTitle, setAddGroupTitle] = useState('')
  const [addNetQty, setAddNetQty] = useState('1')
  const [addUnit, setAddUnit] = useState('g')
  const [addYield, setAddYield] = useState('100')
  const [addGross, setAddGross] = useState('')
  const [flashLineId, setFlashLineId] = useState<string | null>(null)

  useEffect(() => {
    if (!flashLineId) return
    const t = window.setTimeout(() => setFlashLineId(null), 700)
    return () => window.clearTimeout(t)
  }, [flashLineId])

  useEffect(() => {
    const raw = (addGross || '').trim()
    if (!raw) return
    const gross = toNum(raw, NaN as any)
    if (!Number.isFinite(gross) || gross <= 0) return
    const net = Math.max(0, toNum(addNetQty, 0))
    const y = clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100)
    setAddYield(String(Math.round(y * 100) / 100))
  }, [addGross, addNetQty])

  const [costPoints, setCostPoints] = useState(() => (id ? listCostPoints(id) : []))

  useEffect(() => {
    if (!id) return
    setCostPoints(listCostPoints(id))
  }, [id])

  const recipeRef = useRef<Recipe | null>(null)
  const linesRef = useRef<Line[]>([])

  useEffect(() => {
    recipeRef.current = recipe
  }, [recipe])

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  const deletedLineIdsRef = useRef<string[]>([])

  const isDraftLine = useCallback((l: Line) => {
    const lid = (l?.id || '') as string
    return lid.startsWith('tmp_')
  }, [])

  useEffect(() => {
    if (!id) return
    const cur = (lines || []) as Line[]
    const hasDraft = cur.some(isDraftLine) || (deletedLineIdsRef.current?.length || 0) > 0
    if (hasDraft) writeDraftLines(id, cur)
  }, [id, lines, isDraftLine])

  useEffect(() => {
    if (!id) {
      setErr('Missing recipe id.')
      setLoading(false)
      return
    }
    let alive = true

    async function load() {
      if (!alive) return
      setLoading(true)
      setErr(null)
      try {
        const { data: r, error: rErr } = await supabase
          .from('recipes')
          .select(
            'id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct'
          )
          .eq('id', id)
          .single()
        if (rErr) throw rErr
        const recipeRow = r as Recipe
        if (!alive) return
        setRecipe(recipeRow)
        try {
          localStorage.setItem('gc_last_recipe_id', recipeRow.id)
          localStorage.setItem('gc_last_recipe_name', recipeRow.name || '')
          localStorage.setItem('gc_last_recipe_ts', String(Date.now()))
        } catch {}
        setCode((recipeRow.code || '').toUpperCase())
        setCodeCategory((recipeRow.code_category || '').toUpperCase())
        setName(recipeRow.name || '')
        setCategory(recipeRow.category || '')
        setPortions(String(recipeRow.portions ?? 1))
        setDescription(recipeRow.description || '')
        setSteps((recipeRow.method_steps || []).filter((x) => typeof x === 'string'))
        setStepPhotos((recipeRow.method_step_photos || []).filter((x) => typeof x === 'string'))
        setMethodLegacy(recipeRow.method || '')
        setCalories(recipeRow.calories != null ? String(recipeRow.calories) : '')
        setProtein(recipeRow.protein_g != null ? String(recipeRow.protein_g) : '')
        setCarbs(recipeRow.carbs_g != null ? String(recipeRow.carbs_g) : '')
        setFat(recipeRow.fat_g != null ? String(recipeRow.fat_g) : '')
        setCurrency((recipeRow.currency || 'USD').toUpperCase())
        setSellingPrice(recipeRow.selling_price != null ? String(recipeRow.selling_price) : '')
        setTargetFC(recipeRow.target_food_cost_pct != null ? String(recipeRow.target_food_cost_pct) : '30')
        setIsSubRecipe(!!recipeRow.is_subrecipe)
        setYieldQty(recipeRow.yield_qty != null ? String(recipeRow.yield_qty) : '')
        setYieldUnit((safeUnit(recipeRow.yield_unit || 'g') as any) || 'g')

        const { data: l, error: lErr } = await supabase
          .from('recipe_lines')
          .select(
            'id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title'
          )
          .eq('recipe_id', id)
          .order('position', { ascending: true })
        if (lErr) throw lErr
        if (!alive) return

        const draft = id ? readDraftLines(id) : []
        const mergedLines = draft?.length ? mergeDbAndDraft((l || []) as Line[], draft) : ((l || []) as Line[])
        setLines(mergedLines as Line[])

        const ing = await getIngredientsCached()
        if (!alive) return
        setIngredients((ing || []) as Ingredient[])

        const { data: rs, error: rsErr } = await supabase
          .from('recipes')
          .select('id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,currency')
          .order('name', { ascending: true })
        if (rsErr) throw rsErr
        if (!alive) return
        setAllRecipes((rs || []) as Recipe[])
      } catch (e: any) {
        const msg = e?.message || 'Failed to save lines.'
        autosave.setError(msg)
        if (!alive) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }
    load().catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of allRecipes) m.set(r.id)
    return m
  }, [allRecipes])

  const lineComputed = useMemo(() => {
    const res = new Map<
      string,
      { net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; warnings: string[] }
    >()
    for (const l of lines) {
      const warnings: string[] = []
      const net = Math.max(0, toNum(l.qty, 0))
      const yieldPct = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const gross = l.gross_qty_override != null && l.gross_qty_override > 0 ? Math.max(0, l.gross_qty_override) : net / (yieldPct / 100)
      let unitCost = 0
      let lineCost = 0
      if (l.line_type === 'ingredient') {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        unitCost = toNum(ing?.net_unit_cost, 0)
        if (!ing) warnings.push('Missing ingredient')
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')
        const packUnit = ing?.pack_unit || l.unit
        const qtyInPack = convertQtyToPackUnit(gross, l.unit, packUnit)
        lineCost = qtyInPack * unitCost
      } else if (l.line_type === 'subrecipe') {
        warnings.push('Subrecipe cost not expanded')
      }
      res.set(l.id, {
        net,
        gross,
        yieldPct,
        unitCost,
        lineCost: Number.isFinite(lineCost) ? lineCost : 0,
        warnings,
      })
    }
    return res
  }, [lines, ingById])

  const totals = useMemo(() => {
    let totalCost = 0
    let warnings: string[] = []
    for (const l of lines) {
      if (l.line_type === 'group') continue
      const c = lineComputed.get(l.id)
      if (!c) continue
      totalCost += c.lineCost
      if (c.warnings.length) warnings = warnings.concat(c.warnings)
    }
    const p = Math.max(1, toNum(portions, 1))
    const cpp = p > 0 ? totalCost / p : 0
    const sell = Math.max(0, toNum(sellingPrice, 0))
    const fcPct = sell > 0 ? (cpp / sell) * 100 : null
    const margin = sell - cpp
    const marginPct = sell > 0 ? (margin / sell) * 100 : null
    const uniqWarnings = Array.from(new Set(warnings)).slice(0, 4)
    return { totalCost, cpp, fcPct, margin, marginPct, warnings: uniqWarnings }
  }, [lines, lineComputed, portions, sellingPrice])

  const [savingMeta, setSavingMeta] = useState(false)
  const metaSaveTimer = useRef<number | null>(null)
  const [savingLines, setSavingLines] = useState(false)
  const linesSaveTimer = useRef<number | null>(null)
  const [savePulse, setSavePulse] = useState(false)
  const savePulseTimer = useRef<number | null>(null)

  useEffect(() => {
    const active = savingMeta || savingLines
    if (active) {
      if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
      setSavePulse(true)
      return
    }
    if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
    savePulseTimer.current = window.setTimeout(() => setSavePulse(false), 700)
    return () => {
      if (savePulseTimer.current) window.clearTimeout(savePulseTimer.current)
    }
  }, [savingMeta, savingLines])

  const saveLinesNow = useCallback(async (override?: Line[]): Promise<boolean> => {
    if (!id) return false
    const rid = id
    const kitchenId = recipeRef.current?.kitchen_id ?? k.kitchenId ?? null
    if (!kitchenId) {
      setErr('Kitchen not resolved yet. Please wait a moment and try again.')
      return false
    }
    setErr(null)
    setSavingLines(true)
    autosave.setSaving()
    try {
      const delIds = deletedLineIdsRef.current.filter((x) => x && !x.startsWith('tmp_'))
      if (delIds.length) {
        deletedLineIdsRef.current = []
        const { error: delErr } = await supabase.from('recipe_lines').delete().in('id', delIds)
        if (delErr) throw delErr
      }
      const cur = ((override ?? linesRef.current) || []) as Line[]
      const drafts = cur.filter(isDraftLine)
      const persisted = cur.filter((l) => !isDraftLine(l))
      const needsReload = drafts.length > 0 || delIds.length > 0
      if (persisted.length) {
        const payload = persisted.map((l) => ({
          id: l.id,
          kitchen_id: l.kitchen_id ?? kitchenId,
          recipe_id: rid,
          ingredient_id: l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id,
          position: l.position,
          qty: toNum(l.qty, 0),
          unit: safeUnit(l.unit),
          yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
          notes: l.notes ?? null,
          gross_qty_override: l.gross_qty_override ?? null,
          line_type: l.line_type,
          group_title: l.group_title ?? null,
        }))
        const { error: upErr } = await supabase.from('recipe_lines').upsert(payload)
        if (upErr) throw upErr
      }
      if (drafts.length) {
        const payload = drafts.map((l) => ({
          kitchen_id: kitchenId,
          recipe_id: rid,
          ingredient_id: l.ingredient_id,
          sub_recipe_id: l.sub_recipe_id,
          position: l.position,
          qty: toNum(l.qty, 0),
          unit: safeUnit(l.unit),
          yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
          notes: l.notes ?? null,
          gross_qty_override: l.gross_qty_override ?? null,
          line_type: l.line_type,
          group_title: l.group_title ?? null,
        }))
        const { error: insErr } = await supabase.from('recipe_lines').insert(payload)
        if (insErr) throw insErr
      }
      if (needsReload) {
        const { data: l2, error: l2Err } = await supabase
          .from('recipe_lines')
          .select('id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title')
          .eq('recipe_id', rid)
          .order('position', { ascending: true })
        if (l2Err) throw l2Err
        setLinesSafe((l2 || []) as Line[])
        clearDraftLines(rid)
      } else {
        clearDraftLines(rid)
      }
      autosave.setSaved()
      return true
    } catch (e: any) {
      try {
        const cur = ((override ?? linesRef.current) || []) as Line[]
        writeDraftLines(rid, cur)
      } catch {}
      const msg = e?.message || 'Failed to save lines.'
      autosave.setError(msg)
      setErr(msg)
      return false
    } finally {
      setSavingLines(false)
    }
  }, [id, isDraftLine, setLinesSafe, k.kitchenId, autosave])

  const scheduleLinesSave = useCallback(() => {
    if (!id) return
    if (linesSaveTimer.current) window.clearTimeout(linesSaveTimer.current)
    linesSaveTimer.current = window.setTimeout(() => {
      saveLinesNow().then(() => {}).catch(() => {})
    }, 650)
  }, [id, saveLinesNow])

  const updateLine = useCallback(
    (lineId: string, patch: Partial<Line>) => {
      if (!lineId) return
      const cur = (linesRef.current || []) as Line[]
      const next = cur.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
      linesRef.current = next
      setLinesSafe(next)
      scheduleLinesSave()
    },
    [scheduleLinesSave, setLinesSafe]
  )

  const duplicateLineLocal = useCallback(
    (lineId: string) => {
      if (!lineId) return
      const cur = (linesRef.current || []) as Line[]
      const src = cur.find((l) => l.id === lineId)
      if (!src) return
      const maxPos = cur.reduce((m, l) => Math.max(m, toNum(l.position, 0)), 0)
      const copy: Line = {
        ...src,
        id: uid(),
        position: maxPos + 1,
      }
      const next = [...cur, copy].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
      linesRef.current = next
      setLinesSafe(next)
      saveLinesNow(next).then(() => {}).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )

  const deleteLineLocal = useCallback(
    (lineId: string) => {
      if (!lineId) return
      const cur = (linesRef.current || []) as Line[]
      const next = cur.filter((x) => x.id !== lineId)
      if (!lineId.startsWith('tmp_') && !deletedLineIdsRef.current.includes(lineId)) {
        deletedLineIdsRef.current.push(lineId)
      }
      linesRef.current = next
      setLinesSafe(next)
      saveLinesNow(next).then(() => {}).catch(() => {})
    },
    [setLinesSafe, saveLinesNow]
  )

  const buildMetaPatch = useCallback(() => {
    const patch: any = {
      code: (code || '').trim().toUpperCase() || null,
      code_category: (codeCategory || '').trim().toUpperCase() || null,
      name: (name || '').trim() || 'Untitled',
      category: (category || '').trim() || null,
      portions: Math.max(1, Math.floor(toNum(portions, 1))),
      description: description || '',
      method_steps: steps,
      method_step_photos: stepPhotos,
      method: methodLegacy || '',
      calories: calories === '' ? null : toNum(calories, null as any),
      protein_g: protein === '' ? null : toNum(protein, null as any),
      carbs_g: carbs === '' ? null : toNum(carbs, null as any),
      fat_g: fat === '' ? null : toNum(fat, null as any),
      currency: (currency || 'USD').toUpperCase(),
      selling_price: sellingPrice === '' ? null : toNum(sellingPrice, null as any),
      target_food_cost_pct: targetFC === '' ? null : toNum(targetFC, null as any),
      is_subrecipe: !!isSubRecipe,
      yield_qty: yieldQty === '' ? null : toNum(yieldQty, null as any),
      yield_unit: safeUnit(yieldUnit),
    }
    return patch
  }, [
    code, codeCategory, name, category, portions, description, steps, stepPhotos,
    methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC,
    isSubRecipe, yieldQty, yieldUnit,
  ])

  const saveMetaNow = useCallback(async () => {
    if (!id) return
    setErr(null)
    setSavingMeta(true)
    try {
      const patch = buildMetaPatch()
      const { error } = await supabase.from('recipes').update(patch).eq('id', id)
      if (error) throw error
      showToast('Saved.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to save.')
    } finally {
      setSavingMeta(false)
    }
  }, [id, buildMetaPatch, showToast])

  const scheduleMetaSave = useCallback(() => {
    if (!id) return
    if (metaSaveTimer.current) window.clearTimeout(metaSaveTimer.current)
    metaSaveTimer.current = window.setTimeout(() => {
      saveMetaNow().catch(() => {})
    }, 650)
  }, [id, saveMetaNow])

  const metaHydratedRef = useRef(false)

  useEffect(() => {
    if (!recipe) return
    if (!metaHydratedRef.current) {
      metaHydratedRef.current = true
      return
    }
    scheduleMetaSave()
  }, [
    code, codeCategory, name, category, portions, description, steps, stepPhotos,
    methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC,
    isSubRecipe, yieldQty, yieldUnit,
  ])

  const addLineLocal = useCallback(async () => {
    if (!id) return
    const rid = id
    const basePos = (linesRef.current?.length || 0) + 1
    const yRaw = clamp(toNum(addYield, 100), 0.0001, 100)
    const net = Math.max(0, toNum(addNetQty, 0))
    const gross = addGross.trim() === '' ? null : Math.max(0, toNum(addGross, 0))
    const y = gross != null && gross > 0 && net >= 0 ? clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100) : yRaw

    if (addType === 'ingredient') {
      if (!addIngredientId) {
        setErr('Pick an ingredient first.')
        return
      }
      const newL: Line = {
        id: uid(),
        kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
        recipe_id: rid,
        ingredient_id: addIngredientId,
        sub_recipe_id: null,
        position: basePos,
        qty: net,
        unit: addUnit || 'g',
        yield_percent: y,
        notes: addNote || null,
        gross_qty_override: gross,
        line_type: 'ingredient',
        group_title: null,
      }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      if (ok) {
        showToast('Line added & saved.')
        setAddNote('')
        setAddNetQty('1')
        setAddGross('')
        setAddYield('100')
        setAddIngredientId('')
        setIngSearch('')
      } else {
        showToast('Could not save line yet. It is kept locally — try again in a moment.')
      }
      return
    }

    if (addType === 'subrecipe') {
      if (!addSubRecipeId) {
        setErr('Pick a subrecipe first.')
        return
      }
      const newL: Line = {
        id: uid(),
        kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
        recipe_id: rid,
        ingredient_id: null,
        sub_recipe_id: addSubRecipeId,
        position: basePos,
        qty: net,
        unit: addUnit || 'g',
        yield_percent: y,
        notes: addNote || null,
        gross_qty_override: gross,
        line_type: 'subrecipe',
        group_title: null,
      }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      showToast(ok ? 'Subrecipe line added & saved.' : 'Subrecipe line added — saved locally (syncing...).')
      if (ok) {
        setAddNote('')
        setAddNetQty('1')
        setAddGross('')
        setAddYield('100')
        setAddSubRecipeId('')
        setIngSearch('')
      }
      if (!ok) scheduleLinesSave()
      return
    }

    const title = (addGroupTitle || '').trim()
    if (!title) {
      setErr('Enter group title.')
      return
    }
    const newL: Line = {
      id: uid(),
      kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null,
      recipe_id: rid,
      ingredient_id: null,
      sub_recipe_id: null,
      position: basePos,
      qty: 0,
      unit: 'g',
      yield_percent: 100,
      notes: null,
      gross_qty_override: null,
      line_type: 'group',
      group_title: title,
    }
    setErr(null)
    const next = [...(linesRef.current || []), newL]
    linesRef.current = next
    setLinesSafe(next)
    const ok = await saveLinesNow(next)
    showToast(ok ? 'Group added & saved.' : 'Group added — saved locally (syncing...).')
    if (ok) {
      setAddGroupTitle('')
    }
    if (!ok) scheduleLinesSave()
  }, [
    id, addType, addIngredientId, addSubRecipeId, addGroupTitle, addNetQty, addUnit,
    addYield, addGross, addNote, setLinesSafe, saveLinesNow, scheduleLinesSave, showToast, k.kitchenId,
  ])

  const onNetChange = useCallback(
    (lineId: string, value: string) => {
      const net = Math.max(0, toNum(value, 0))
      const line = linesRef.current.find((x) => x.id === lineId)
      if (!line) return
      if (line.gross_qty_override != null && line.gross_qty_override > 0) {
        const gross = Math.max(0.0000001, line.gross_qty_override)
        const y = clamp((net / gross) * 100, 0.0001, 100)
        updateLine(lineId, { qty: net, yield_percent: y })
      } else {
        updateLine(lineId, { qty: net })
      }
    },
    [updateLine]
  )

  const onGrossChange = useCallback(
    (lineId: string, value: string) => {
      const raw = value.trim()
      const line = linesRef.current.find((x) => x.id === lineId)
      if (!line) return
      if (raw === '') {
        updateLine(lineId, { gross_qty_override: null })
        return
      }
      const gross = Math.max(0, toNum(raw, 0))
      if (gross <= 0) {
        updateLine(lineId, { gross_qty_override: null })
        return
      }
      const net = Math.max(0, toNum(line.qty, 0))
      const y = clamp((net / gross) * 100, 0.0001, 100)
      updateLine(lineId, { gross_qty_override: gross, yield_percent: y })
    },
    [updateLine]
  )

  const onYieldChange = useCallback(
    (lineId: string, value: string) => {
      const y = clamp(toNum(value, 100), 0.0001, 100)
      updateLine(lineId, { yield_percent: y, gross_qty_override: null })
    },
    [updateLine]
  )

  const onNoteChange = useCallback(
    (lineId: string, value: string) => {
      updateLine(lineId, { notes: value || null })
    },
    [updateLine]
  )

  const moveLine = useCallback(
    (lineId: string, dir: -1 | 1) => {
      const arr = [...linesRef.current].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const idx = arr.findIndex((x) => x.id === lineId)
      if (idx < 0) return
      const j = idx + dir
      if (j < 0 || j >= arr.length) return
      const tmp = arr[idx]
      arr[idx] = arr[j]
      arr[j] = tmp
      setLinesSafe(arr)
    },
    [setLinesSafe]
  )

  const uploadRecipePhoto = useCallback(
    async (file: File) => {
      if (!id) return
      setErr(null)
      setUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${id}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        const url = pub?.publicUrl || null
        const { error: rErr } = await supabase.from('recipes').update({ photo_url: url }).eq('id', id)
        if (rErr) throw rErr
        setRecipe((prev) => (prev ? { ...prev, photo_url: url } : prev))
        showToast('Photo updated.')
      } catch (e: any) {
        setErr(e?.message || 'Failed to upload photo.')
      } finally {
        setUploading(false)
      }
    },
    [id, showToast]
  )

  const uploadStepPhoto = useCallback(
    async (file: File, stepIndex: number) => {
      if (!id) return
      setErr(null)
      setStepUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${id}/steps/${stepIndex}_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        const url = pub?.publicUrl || ''
        setStepPhotos((prev) => {
          const next = [...prev]
          next[stepIndex] = url
          return next
        })
        scheduleMetaSave()
        showToast('Step photo updated.')
      } catch (e: any) {
        setErr(e?.message || 'Failed to upload step photo.')
      } finally {
        setStepUploading(false)
      }
    },
    [id, showToast, scheduleMetaSave]
  )

  const addStep = useCallback(() => {
    const s = (newStep || '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
    scheduleMetaSave()
  }, [newStep, scheduleMetaSave])

  const removeStep = useCallback(
    (idx: number) => {
      setSteps((prev) => prev.filter((_, i) => i !== idx))
      setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
      scheduleMetaSave()
    },
    [scheduleMetaSave]
  )

  const updateStep = useCallback(
    (idx: number, value: string) => {
      setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)))
      scheduleMetaSave()
    },
    [scheduleMetaSave]
  )

  const addSnapshot = useCallback(() => {
    if (!id) return
    const p = Math.max(1, Math.floor(toNum(portions, 1)))
    const cur = (currency || 'USD').toUpperCase()
    const totalCost = totals.totalCost
    const cpp = totals.cpp
    addCostPoint(id, {
      createdAt: Date.now(),
      totalCost,
      cpp,
      portions: p,
      currency: cur,
    } as any)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshot added.')
  }, [id, portions, currency, totals.totalCost, totals.cpp, showToast])

  const clearSnapshots = useCallback(() => {
    if (!id) return
    const ok = window.confirm('Clear all cost snapshots for this recipe?')
    if (!ok) return
    clearCostPoints(id)
    setCostPoints(listCostPoints(id))
    showToast('Cost snapshots cleared.')
  }, [id, showToast])

  const removeSnapshot = useCallback(
    (pid: string) => {
      if (!id) return
      deleteCostPoint(id, pid)
      setCostPoints(listCostPoints(id))
      showToast('Snapshot removed.')
    },
    [id, showToast]
  )

  const printNow = useCallback(() => {
    if (!id) return
    const url = `#/print?id=${encodeURIComponent(id)}&autoprint=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [id])

  const exportExcel = useCallback(async () => {
    try {
      const meta = {
        id: id || undefined,
        code: code || null,
        kitchen_id: (recipeRef.current as any)?.kitchen_id ?? null,
        name: name || 'Recipe',
        category: category || '',
        portions: Math.max(1, Math.floor(Number(portions || 1))),
        yield_qty: yieldQty ? Number(yieldQty) : null,
        yield_unit: yieldUnit || null,
        currency: currency || 'USD',
        selling_price: sellingPrice ? Number(sellingPrice) : null,
        target_food_cost_pct: targetFC ? Number(targetFC) : null,
        photo_url: recipe?.photo_url || null,
        step_photos: stepPhotos,
        description: description || '',
        steps: (steps || []).filter(Boolean),
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null,
        carbs_g: carbs ? Number(carbs) : null,
        fat_g: fat ? Number(fat) : null,
      }
      const rows = lines
        .filter((l) => l.line_type !== 'group')
        .map((l) => {
          const c = lineComputed.get(l.id)
          const base = {
            type: l.line_type === 'subrecipe' ? 'subrecipe' : 'ingredient',
            code:
              l.line_type === 'ingredient'
                ? (l.ingredient_id ? (ingById.get(l.ingredient_id) as any)?.code : null) || ''
                : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.code || ''),
            name:
              l.line_type === 'ingredient'
                ? (l.ingredient_id ? ingById.get(l.ingredient_id)?.name : null) || 'Ingredient'
                : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.name || 'Subrecipe'),
            net_qty: c?.net ?? 0,
            unit: l.unit || '',
            yield_percent: c?.yieldPct ?? 100,
            gross_qty: c?.gross ?? 0,
            unit_cost: c?.unitCost ?? 0,
            line_cost: c?.lineCost ?? 0,
            notes: l.notes || '',
            warnings: c?.warnings || [],
          }
          return base
        })
      await exportRecipeExcelUltra({
        meta,
        totals: { totalCost: totals.totalCost, cpp: totals.cpp, fcPct: totals.fcPct, margin: totals.margin, marginPct: totals.marginPct },
        lines: rows as any,
      })
      showToast('Excel exported.')
    } catch (e: any) {
      console.error(e)
      showToast('Excel export failed.')
    }
  }, [
    id, name, category, portions, yieldQty, yieldUnit, currency, sellingPrice, targetFC,
    description, steps, stepPhotos, calories, protein, carbs, fat, lines, lineComputed,
    ingById, allRecipes, totals, showToast,
  ])

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading) {
    return (
      <>
        {DesignTokens}
        {ComponentStyles}
        <div className="card" style={{ padding: 16 }}>
          <div className="text-caption flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            RECIPE EDITOR
          </div>
          <div className="text-muted" style={{ marginTop: 10 }}>
            Loading recipe data...
          </div>
        </div>
      </>
    )
  }

  if (!id) {
    return (
      <>
        {DesignTokens}
        {ComponentStyles}
        <div className="card" style={{ padding: 16 }}>
          <div className="text-caption text-error">ERROR</div>
          <div className="text-muted" style={{ marginTop: 10 }}>
            Missing recipe id.
          </div>
        </div>
      </>
    )
  }

  const headerLeft = (
    <div className="flex items-center gap-4">
      <NavLink to="/recipes" className="btn btn-ghost flex items-center gap-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back
      </NavLink>
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
          style={{
            background: 'linear-gradient(145deg, var(--color-primary-100), #ffffff)',
            border: '2px solid rgba(20, 184, 166, 0.2)',
            boxShadow: '0 8px 16px -4px rgba(20, 184, 166, 0.15)',
          }}
        >
          {isSubRecipe ? '🧩' : '🍽️'}
        </div>
        <div>
          <div className="text-caption flex items-center gap-2">
            RECIPE EDITOR
            <span className="badge badge-primary text-[10px]">v2.0</span>
          </div>
          <div className="text-heading">{(name || 'Untitled').trim()}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`status-dot ${autosave.status === 'saving' ? 'saving' : 'saved'}`} />
            <span className="text-caption font-bold">
              {autosave.status === 'saving'
                ? 'Saving…'
                : autosave.status === 'error'
                ? (autosave.message || 'Save issue. Retrying…')
                : autosave.lastSavedAt
                ? `Saved ${Math.max(1, Math.round((Date.now() - autosave.lastSavedAt) / 1000))}s ago ✓`
                : 'Auto-save ready.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  const headerRight = (
    <div className="section-nav">
      <span className={isKitchen ? 'badge badge-primary' : 'badge badge-secondary'}>
        {isKitchen ? '👨‍🍳 Kitchen' : '📊 Mgmt'}
      </span>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={() => setDensity((v) => (v === 'compact' ? 'comfort' : 'compact'))}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
        {density === 'compact' ? 'Compact' : 'Comfort'}
      </button>
      <button className={cx('section-btn', activeSection === 'sec-basics' && 'active')} type="button" onClick={() => scrollToSection('sec-basics')}>📋 Basics</button>
      <button className={cx('section-btn', activeSection === 'sec-method' && 'active')} type="button" onClick={() => scrollToSection('sec-method')}>📝 Method</button>
      <button className={cx('section-btn', activeSection === 'sec-nutrition' && 'active')} type="button" onClick={() => scrollToSection('sec-nutrition')}>🥗 Nutrition</button>
      <button className={cx('section-btn', activeSection === 'sec-lines' && 'active')} type="button" onClick={() => scrollToSection('sec-lines')}>📦 Lines</button>
      <button className={cx('section-btn', activeSection === 'sec-print' && 'active')} type="button" onClick={() => scrollToSection('sec-print')}>🖨️ Print</button>
      <button className={cx('section-btn', activeSection === 'sec-cook' && 'active')} type="button" onClick={() => scrollToSection('sec-cook')}>🔥 Cook</button>
      {showCost ? (
        <button className={cx('section-btn', activeSection === 'sec-cost' && 'active')} type="button" onClick={() => scrollToSection('sec-cost')}>💰 Cost</button>
      ) : null}
    </div>
  )

  const PrintCss = (
    <style>{`
      @media print {
        .gc-shell, .gc-side, .gc-topbar-card, .gc-screen-only, nav, header, aside {
          display: none !important;
        }
        .gc-print-only {
          display: block !important;
        }
        body {
          background: white !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .gc-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          box-sizing: border-box;
          font-family: -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
          color: #1E2A3A;
          background: white;
        }
        .gc-print-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15mm;
          border-bottom: 2px solid #2E7D78;
          padding-bottom: 8mm;
          margin-bottom: 8mm;
        }
        .gc-print-name {
          font-size: 28pt;
          font-weight: 900;
          color: #1E5A56;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .gc-print-sub {
          font-size: 12pt;
          color: #64748B;
          margin-top: 4mm;
        }
        .gc-print-photo {
          width: 70mm;
          height: 50mm;
          border: 2px solid #2E7D78;
          border-radius: 8mm;
          overflow: hidden;
          background: #f8fafc;
          box-shadow: 0 8px 16px rgba(0,0,0,0.05);
        }
        .gc-print-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .gc-print-section {
          margin-top: 8mm;
        }
        .gc-print-title {
          font-size: 14pt;
          font-weight: 900;
          color: #2E7D78;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4mm;
          border-bottom: 1px solid rgba(46,125,120,0.2);
          padding-bottom: 2mm;
        }
        .gc-print-text {
          font-size: 11pt;
          line-height: 1.6;
          color: #1E2A3A;
          white-space: pre-wrap;
        }
        .gc-print-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
          font-size: 10pt;
          table-layout: fixed;
        }
        .gc-print-table th {
          text-align: left;
          padding: 3mm 2mm;
          background: #f8fafc;
          font-weight: 800;
          color: #2E7D78;
          border-bottom: 2px solid #2E7D78;
        }
        .gc-print-table td {
          padding: 2.5mm 2mm;
          border-bottom: 1px solid rgba(46,125,120,0.15);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gc-print-kpis {
          display: flex;
          gap: 4mm;
          flex-wrap: wrap;
          margin-top: 4mm;
        }
        .gc-print-chip {
          border: 1px solid #2E7D78;
          border-radius: 40px;
          padding: 2mm 4mm;
          font-size: 10pt;
          font-weight: 700;
          color: #2E7D78;
          background: white;
        }
      }
      .gc-print-only {
        display: none;
      }
    `}</style>
  )

  return (
    <>
      {DesignTokens}
      {ComponentStyles}
      {PrintCss}
      <div className="card gc-screen-only">
        <div className="card-header flex justify-between items-center flex-wrap gap-4">
          {headerLeft}
          {headerRight}
        </div>
        <div className="card-body">
          {err && (
            <div className="card-soft" style={{ padding: 12, borderRadius: 16, marginBottom: 12, background: '#fee2e2', border: '1px solid #fecaca' }}>
              <div className="flex items-center gap-2 text-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="font-bold">{err}</span>
              </div>
            </div>
          )}

          {/* Print Section */}
          <div className="card-soft mb-4">
            <div className="p-4 flex justify-between items-center flex-wrap gap-4" id="sec-print">
              <div>
                <div className="text-caption flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 9V3h12v6" />
                    <rect x="6" y="15" width="12" height="6" rx="2" />
                  </svg>
                  PRINT (A4)
                </div>
                <div className="text-muted mt-2">Professional chef-ready A4 print. No overflow.</div>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <button className="btn btn-secondary flex items-center gap-2" type="button" onClick={printNow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 9V3h12v6" />
                    <rect x="6" y="15" width="12" height="6" rx="2" />
                  </svg>
                  Print now
                </button>
                <button className="btn btn-primary flex items-center gap-2" type="button" onClick={exportExcel}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="16" x2="16" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Export Excel
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => (id ? window.open(`#/print?id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer') : null)}
                  disabled={!id}
                >
                  Open Print Page
                </button>
                <div className={`text-muted flex items-center gap-1 ${savePulse ? 'text-primary' : ''}`} style={{ marginLeft: 6 }}>
                  <span className={`w-2 h-2 rounded-full ${savePulse ? 'bg-primary animate-pulse' : 'bg-green-500'}`} />
                  {savePulse ? 'Auto-saving…' : 'Auto-save ready.'}
                </div>
              </div>
            </div>
          </div>

          {/* Cook Mode Section */}
          <div className="card-soft mb-4">
            <div className="p-3 flex items-center justify-between gap-3 flex-wrap" id="sec-cook">
              <div>
                <div className="text-caption flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                  </svg>
                  COOK MODE
                </div>
                <div className="text-muted mt-2">Zero distraction cooking workflow.</div>
              </div>
              <button className="btn btn-primary flex items-center gap-2" type="button" onClick={() => (id ? navigate(`/cook?id=${encodeURIComponent(id)}`) : null)} disabled={!id}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
                Open Cook Mode
              </button>
            </div>
          </div>

          {/* KPI Section */}
          {showCost && (
            <div className="card-soft mb-4" style={{ padding: 14, borderRadius: 18 }}>
              <div className="flex justify-between items-center flex-wrap gap-4 mb-3" id="sec-cost">
                <div>
                  <div className="text-caption flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="6" x2="12" y2="12" />
                      <line x1="12" y1="12" x2="16" y2="14" />
                    </svg>
                    KPI
                  </div>
                  <div className="text-muted mt-2">Live recipe performance overview.</div>
                </div>
                <div className="text-muted flex items-center gap-1 font-bold">
                  <span>Currency:</span>
                  <span className="px-2 py-1 bg-primary/10 rounded-full text-primary">{cur}</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-3">
                <div className="kpi-card">
                  <div className="kpi-label">TOTAL COST</div>
                  <div className="kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">COST / PORTION</div>
                  <div className="kpi-value">{fmtMoney(totals.cpp, cur)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">FC%</div>
                  <div className="kpi-value">{totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">MARGIN</div>
                  <div className="kpi-value">{fmtMoney(totals.margin, cur)}</div>
                </div>
              </div>
              {totals.warnings?.length ? (
                <div className="banner-warning mt-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--color-warning)' }}>⚠</div>
                  <div>
                    <div className="text-caption font-bold text-warning">PRICING WARNING</div>
                    <div className="font-bold text-warning">{totals.warnings[0]}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Pricing Section */}
          {showCost && (
            <div className="card-soft mb-4">
              <div className="p-3">
                <div className="flex justify-between items-center flex-wrap gap-4 mb-3">
                  <div>
                    <div className="text-caption flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="6" x2="12" y2="12" />
                        <line x1="12" y1="12" x2="16" y2="14" />
                      </svg>
                      PRICING / PORTION
                    </div>
                    <div className="text-muted mt-2">Set commercial values for management view and targets.</div>
                  </div>
                  <div className="text-muted font-bold">FC% = cost / portion ÷ selling price</div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-caption">CURRENCY</div>
                    <input className="input mt-2" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <div className="text-caption">SELLING PRICE</div>
                    <input className="input mt-2" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} inputMode="decimal" />
                  </div>
                  <div>
                    <div className="text-caption">TARGET FC%</div>
                    <input className="input mt-2" value={targetFC} onChange={(e) => setTargetFC(e.target.value)} inputMode="decimal" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Nutrition Section */}
          <div className="card-soft mb-4">
            <div className="p-3">
              <div className="text-caption flex items-center gap-2" id="sec-nutrition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M12 12l8-8M12 12l-8-8M12 12l8 8M12 12l-8 8" />
                </svg>
                NUTRITION / PORTION
              </div>
              <div className="grid grid-cols-4 gap-4 mt-3">
                <div>
                  <div className="text-caption">CAL</div>
                  <input className="input mt-2" value={calories} onChange={(e) => setCalories(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <div className="text-caption">PROTEIN g</div>
                  <input className="input mt-2" value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <div className="text-caption">CARBS g</div>
                  <input className="input mt-2" value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <div className="text-caption">FAT g</div>
                  <input className="input mt-2" value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" />
                </div>
              </div>
              <div className="text-muted flex items-center gap-1 mt-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Manual fields (no auto nutrition calc).
              </div>
            </div>
          </div>

          {/* Meta Section - Basic Information */}
          <div id="sec-basics" className="card mb-4">
            <div className="card-header">
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="text-caption flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    BASIC INFORMATION
                  </div>
                  <div className="text-muted mt-2">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Auto-save enabled • Labels above inputs
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20 text-xs font-semibold text-primary flex items-center gap-1.5">
                    <span className={`w-2 h-2 ${savePulse ? 'bg-primary animate-pulse' : 'bg-green-500'} rounded-full`} />
                    {savePulse ? 'Saving...' : 'All changes saved'}
                  </div>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-12 gap-4">
                {/* Recipe Code Section */}
                <div className="col-span-6">
                  <div className="card-soft p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M16 3h5v5M14 10l6-6M4 21h5v-5M10 14l-6 6" />
                          <rect x="8" y="8" width="8" height="8" rx="2" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary uppercase tracking-wider">RECIPE CODE</div>
                        <div className="text-[11px] text-muted">Unique identifier for this recipe</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                          CODE <span className="text-neutral-400 font-normal">(auto-generated if empty)</span>
                        </label>
                        <div className="relative">
                          <input
                            className={`input pl-10 ${!canEditCodes ? 'opacity-60 cursor-not-allowed bg-neutral-50' : ''}`}
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="PREP-003"
                            disabled={!canEditCodes}
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">#</div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                          CODE CATEGORY <span className="text-neutral-400 font-normal">(max 6 chars)</span>
                        </label>
                        <div className="relative">
                          <input
                            className={`input pl-10 ${!canEditCodes ? 'opacity-60 cursor-not-allowed bg-neutral-50' : ''}`}
                            value={codeCategory}
                            onChange={(e) => setCodeCategory(e.target.value.toUpperCase())}
                            placeholder="BASEGR"
                            maxLength={6}
                            disabled={!canEditCodes}
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">📂</div>
                        </div>
                      </div>
                      {!canEditCodes && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <span className="text-amber-600 text-sm">🔒</span>
                            <span className="text-[11px] text-amber-700">Code fields are editable by Kitchen Owners only</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recipe Identity Section */}
                <div className="col-span-6">
                  <div className="card-soft p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary uppercase tracking-wider">RECIPE IDENTITY</div>
                        <div className="text-[11px] text-muted">Basic identification details</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                          NAME <span className="text-error">*</span>
                        </label>
                        <input
                          className="input"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Chop Masala"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">CATEGORY</label>
                          <select
                            className="input select"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            <option value="">Select category</option>
                            <option value="Appetizer">Appetizer</option>
                            <option value="Main Course">Main Course</option>
                            <option value="Dessert">Dessert</option>
                            <option value="Sauce">Sauce</option>
                            <option value="Soup">Soup</option>
                            <option value="Salad">Salad</option>
                            <option value="Beverage">Beverage</option>
                            <option value="Bakery">Bakery</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">PORTIONS</label>
                          <div className="relative">
                            <input
                              className="input pl-10"
                              value={portions}
                              onChange={(e) => setPortions(e.target.value)}
                              inputMode="numeric"
                              placeholder="1"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">👥</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description Section */}
                <div className="col-span-12">
                  <div className="card-soft p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary uppercase tracking-wider">DESCRIPTION</div>
                        <div className="text-[11px] text-muted">Brief overview of the recipe</div>
                      </div>
                    </div>
                    <textarea
                      className="textarea input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Write a short description of this recipe..."
                      maxLength={500}
                    />
                    <div className="mt-1 text-right">
                      <span className="text-[10px] text-neutral-400">{description.length}/500 characters</span>
                    </div>
                  </div>
                </div>

                {/* Recipe Photo Section */}
                <div className="col-span-12">
                  <div className="card-soft p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="2" width="20" height="20" rx="2.18" />
                            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                            <path d="M21 15l-5-5L7 21" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-primary uppercase tracking-wider">RECIPE PHOTO</div>
                          <div className="text-[11px] text-muted">Upload from Supabase bucket: <span className="font-mono">{PHOTO_BUCKET}</span></div>
                        </div>
                      </div>
                      {uploading && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-medium text-primary">Uploading...</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-6 flex-wrap items-start">
                      <div className="relative w-[200px] h-[150px] rounded-xl overflow-hidden border-2 border-dashed border-primary/20 group hover:border-primary/40 transition-all">
                        {recipe?.photo_url ? (
                          <>
                            <img src={recipe.photo_url} alt="Recipe" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                className="px-3 py-1.5 bg-white rounded-lg text-xs font-medium"
                                onClick={() => {
                                  document.getElementById('photo-upload')?.click()
                                }}
                              >
                                Change
                              </button>
                            </div>
                          </>
                        ) : (
                          <label
                            htmlFor="photo-upload"
                            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-neutral-50 hover:bg-neutral-100 transition-colors"
                          >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                              <rect x="2" y="2" width="20" height="20" rx="2.18" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                              <path d="M21 15l-5-5L7 21" />
                            </svg>
                            <span className="mt-2 text-xs text-neutral-500">Click to upload</span>
                            <span className="text-[10px] text-neutral-400">PNG/JPG recommended</span>
                          </label>
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                        <input
                          id="photo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            uploadRecipePhoto(f).catch(() => {})
                            e.currentTarget.value = ''
                          }}
                        />
                        <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                          <div className="text-[11px] font-medium text-neutral-600 mb-2">Upload tips:</div>
                          <ul className="text-[10px] text-neutral-500 space-y-1 list-disc pl-4">
                            <li>Recommended size: 1200 x 800px</li>
                            <li>Max file size: 5MB</li>
                            <li>Supported formats: JPG, PNG, WebP</li>
                          </ul>
                        </div>
                        {recipe?.photo_url && (
                          <button
                            className="text-xs text-primary hover:text-primary-dark font-medium"
                            onClick={() => {
                              if (window.confirm('Remove recipe photo?')) {
                                setRecipe(prev => prev ? { ...prev, photo_url: null } : prev)
                                showToast('Photo removed')
                              }
                            }}
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subrecipe Settings */}
                <div className="col-span-12">
                  <div className="card-soft p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 7h16M4 12h16M4 17h10" />
                          <rect x="14" y="15" width="6" height="6" rx="1" stroke="currentColor" />
                          <line x1="17" y1="12" x2="17" y2="15" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-secondary uppercase tracking-wider">SUBRECIPE SETTINGS</div>
                        <div className="text-[11px] text-muted">If enabled, this recipe can be used as a component inside other recipes.</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-4">
                        <div className="bg-gradient-to-br from-secondary/5 to-transparent rounded-xl p-4 border border-secondary/10">
                          <label className="block text-[10px] font-bold text-secondary uppercase tracking-wider mb-3">IS SUBRECIPE</label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="isSubRecipe"
                                checked={isSubRecipe}
                                onChange={() => setIsSubRecipe(true)}
                                className="w-4 h-4 text-secondary"
                              />
                              <span className="text-sm font-medium">Yes</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="isSubRecipe"
                                checked={!isSubRecipe}
                                onChange={() => setIsSubRecipe(false)}
                                className="w-4 h-4 text-secondary"
                              />
                              <span className="text-sm font-medium">No</span>
                            </label>
                          </div>
                          <div className="mt-2 text-[10px] text-neutral-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-secondary rounded-full" />
                            {isSubRecipe ? 'Recipe can be used in other recipes' : 'Recipe cannot be used as a subrecipe'}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-4">
                        <div className="bg-white rounded-xl p-4 border border-neutral-200">
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">YIELD QUANTITY</label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={yieldQty}
                              onChange={(e) => setYieldQty(e.target.value)}
                              placeholder="0.0"
                              className="input"
                              disabled={!isSubRecipe}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              {yieldUnit}
                            </div>
                          </div>
                          <div className="mt-1.5 text-[10px] text-neutral-400 flex items-center justify-between">
                            <span>Total yield of this recipe</span>
                            <span className="text-secondary">Required for subrecipes</span>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-4">
                        <div className="bg-white rounded-xl p-4 border border-neutral-200">
                          <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">YIELD UNIT</label>
                          <select
                            value={yieldUnit}
                            onChange={(e) => setYieldUnit(e.target.value as any)}
                            className="input select"
                            disabled={!isSubRecipe}
                          >
                            <option value="g">g (gram)</option>
                            <option value="kg">kg (kilogram)</option>
                            <option value="ml">ml (milliliter)</option>
                            <option value="l">l (liter)</option>
                            <option value="pcs">pcs (pieces)</option>
                          </select>
                          <div className="mt-1.5 text-[10px] text-neutral-400">Unit of measurement for the yield</div>
                        </div>
                      </div>
                    </div>
                    {isSubRecipe && (
                      <div className="mt-4 p-4 bg-secondary/5 rounded-xl border border-secondary/20">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-secondary text-xs">✓</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-secondary mb-1">Subrecipe Mode Active</div>
                            <div className="text-xs text-neutral-600">
                              This recipe is now available as a component in other recipes. When used as a subrecipe,
                              the system will use the yield quantity ({yieldQty || '0'} {yieldUnit}) to calculate
                              the cost and quantity in parent recipes.
                            </div>
                            {(!yieldQty || parseFloat(yieldQty) <= 0) && (
                              <div className="mt-2 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                <span className="text-sm">⚠️</span>
                                <span className="text-xs font-medium">Please set a valid yield quantity for accurate subrecipe calculations</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ADD LINE Section */}
          <div className="card mb-4">
            <div className="card-header">
              <div className="text-caption flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                ADD LINE
              </div>
              <div className="text-muted mt-2">
                Smart rule: edit <b>Gross</b> → yield auto. edit <b>Yield%</b> → clears gross override.
              </div>
            </div>
            <div className="card-body">
              <div className="card-soft p-4">
                <div className="flex gap-2 mb-6 bg-primary/5 p-1.5 rounded-full border border-primary/10">
                  <button
                    className={cx('flex-1 flex items-center justify-center gap-2.5 py-3 rounded-full border-none bg-transparent text-muted font-bold cursor-pointer transition-all', addType === 'ingredient' && 'bg-white text-primary shadow-md border border-primary/20')}
                    onClick={() => setAddType('ingredient')}
                    type="button"
                  >
                    <span>🥗</span>
                    <span>Ingredient</span>
                  </button>
                  <button
                    className={cx('flex-1 flex items-center justify-center gap-2.5 py-3 rounded-full border-none bg-transparent text-muted font-bold cursor-pointer transition-all', addType === 'subrecipe' && 'bg-white text-primary shadow-md border border-primary/20')}
                    onClick={() => setAddType('subrecipe')}
                    type="button"
                  >
                    <span>📋</span>
                    <span>Subrecipe</span>
                  </button>
                  <button
                    className={cx('flex-1 flex items-center justify-center gap-2.5 py-3 rounded-full border-none bg-transparent text-muted font-bold cursor-pointer transition-all', addType === 'group' && 'bg-white text-primary shadow-md border border-primary/20')}
                    onClick={() => setAddType('group')}
                    type="button"
                  >
                    <span>📌</span>
                    <span>Group</span>
                  </button>
                </div>

                {addType !== 'group' && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-70 w-5 h-5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        className="input pl-12"
                        value={ingSearch}
                        onChange={(e) => setIngSearch(e.target.value)}
                        placeholder={`Search ${addType === 'ingredient' ? 'ingredients' : 'subrecipes'}...`}
                      />
                    </div>
                    <div className="col-span-2">
                      <select
                        className="input select"
                        value={addType === 'ingredient' ? addIngredientId : addSubRecipeId}
                        onChange={(e) => {
                          if (addType === 'ingredient') {
                            setAddIngredientId(e.target.value)
                          } else {
                            setAddSubRecipeId(e.target.value)
                          }
                        }}
                      >
                        <option value="">— Select {addType === 'ingredient' ? 'ingredient' : 'subrecipe'} —</option>
                        {addType === 'ingredient'
                          ? filteredIngredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name || 'Unnamed'} {i.code ? `(${i.code})` : ''}
                              </option>
                            ))
                          : subRecipeOptions.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name || 'Untitled'} {r.code ? `(${r.code})` : ''}
                              </option>
                            ))}
                      </select>
                    </div>
                  </div>
                )}

                {addType === 'group' && (
                  <div className="mb-6">
                    <input
                      className="input text-center font-semibold"
                      value={addGroupTitle}
                      onChange={(e) => setAddGroupTitle(e.target.value)}
                      placeholder="Enter group title (e.g. Sauce, Toppings, Marinade)..."
                    />
                  </div>
                )}

                {addType !== 'group' && (
                  <div className="grid grid-cols-5 gap-4 mt-4">
                    <div>
                      <label className="text-caption">NET</label>
                      <div className="relative mt-2">
                        <input
                          className="input pr-12 text-right font-mono"
                          value={addNetQty}
                          onChange={(e) => setAddNetQty(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">qty</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-caption">UNIT</label>
                      <select
                        className="input select mt-2"
                        value={addUnit}
                        onChange={(e) => setAddUnit(e.target.value)}
                      >
                        <option value="g">g (gram)</option>
                        <option value="kg">kg (kilogram)</option>
                        <option value="ml">ml (milliliter)</option>
                        <option value="l">l (liter)</option>
                        <option value="pcs">pcs (pieces)</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                        <option value="cup">cup</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-caption">YIELD %</label>
                      <div className="relative mt-2">
                        <input
                          className="input pr-12 text-right font-mono"
                          value={addYield}
                          onChange={(e) => setAddYield(e.target.value)}
                          inputMode="decimal"
                          placeholder="100"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">%</span>
                      </div>
                      <div className="text-[10px] text-muted mt-1">edit → auto gross</div>
                    </div>
                    <div>
                      <label className="text-caption">GROSS</label>
                      <div className="relative mt-2">
                        <input
                          className="input pr-12 text-right font-mono"
                          value={addGross}
                          onChange={(e) => setAddGross(e.target.value)}
                          inputMode="decimal"
                          placeholder="auto"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{addUnit || 'g'}</span>
                      </div>
                      <div className="text-[10px] text-muted mt-1">optional • auto from yield</div>
                    </div>
                    <div>
                      <label className="text-caption">NOTE</label>
                      <input
                        className="input mt-2"
                        value={addNote}
                        onChange={(e) => setAddNote(e.target.value)}
                        placeholder="e.g. Chopped, Powdered..."
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mt-6 justify-end">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={addLineLocal}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add {addType === 'group' ? 'Group' : 'Line'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => { saveLinesNow().catch(() => { }) }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Lines
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* LINES Section */}
          <div className="card mb-4">
            <div className="card-header">
              <div className="text-caption flex items-center gap-2" id="sec-lines">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                LINES
              </div>
              <div className="text-muted mt-2">
                Edit Net/Gross/Yield safely. Groups have no cost.
              </div>
            </div>
            <div className="card-body">
              {!visibleLines.length ? (
                <div className="text-center p-12 bg-gradient-to-br from-neutral-50 to-white rounded-2xl border-2 border-dashed border-primary/20">
                  <div className="text-5xl mb-4 opacity-70">📝</div>
                  <div className="text-heading mb-2">No ingredients yet</div>
                  <div className="text-muted">Start adding ingredients, subrecipes, or groups using the form above</div>
                </div>
              ) : (
                <div className="table-container">
                  <div className="p-4 flex justify-between items-center bg-gradient-to-r from-neutral-50 to-white border-b border-primary/10">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold bg-white px-3 py-1.5 rounded-full border border-primary/15 shadow-sm">{visibleLines.length} items</span>
                      {visibleLines.filter(l => l.line_type === 'group').length > 0 && (
                        <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">{visibleLines.filter(l => l.line_type === 'group').length} groups</span>
                      )}
                    </div>
                  </div>
                  <table className="table">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      {showCost ? <col /> : null}
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>CODE</th>
                        <th>INGREDIENT</th>
                        <th>NET</th>
                        <th>UNIT</th>
                        <th>GROSS</th>
                        <th>YIELD</th>
                        {showCost ? <th>COST</th> : null}
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((l) => {
                        const c = lineComputed.get(l.id)
                        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                        const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null
                        if (l.line_type === 'group') {
                          return (
                            <tr key={l.id} className={cx('row-group', flashLineId === l.id && 'row-flash')}>
                              <td colSpan={tableColSpan} className="p-3">
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg opacity-70">📌</span>
                                    <span className="font-bold text-primary">{l.group_title || 'Untitled Group'}</span>
                                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Group</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      className="w-8 h-8 border border-primary/15 rounded-lg bg-white text-muted hover:bg-primary/10 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                                      type="button"
                                      onClick={() => duplicateLineLocal(l.id)}
                                      title="Duplicate group"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                    </button>
                                    <button
                                      className="w-8 h-8 border border-error/15 rounded-lg bg-white text-muted hover:bg-error/10 hover:border-error hover:text-error transition-all flex items-center justify-center"
                                      type="button"
                                      onClick={() => deleteLineLocal(l.id)}
                                      title="Delete group"
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr
                            key={l.id}
                            className={cx(
                              flashLineId === l.id && 'row-flash',
                              l.notes && 'has-note'
                            )}
                          >
                            <td>
                              <span className="font-mono font-semibold text-primary bg-primary/5 px-2 py-1 rounded text-sm inline-block max-w-full overflow-hidden text-ellipsis">
                                {l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">
                                  {l.line_type === 'ingredient' ? (ing?.name || 'Unknown Ingredient') : (sub?.name || 'Unknown Subrecipe')}
                                </span>
                                {l.notes && (
                                  <span className="text-xs text-secondary bg-secondary/5 px-1.5 py-0.5 rounded border border-secondary/10 inline-block max-w-full overflow-hidden text-ellipsis">
                                    📝 {l.notes}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <input
                                className="input text-right font-mono py-1.5"
                                value={fmtQty(toNum(l.qty, 0))}
                                onChange={(e) => onNetChange(l.id, e.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td>
                              <span className="font-semibold text-muted bg-neutral-50 px-2 py-1 rounded text-sm inline-block text-center min-w-[40px]">{l.unit || 'g'}</span>
                            </td>
                            <td>
                              <input
                                className="input text-right font-mono py-1.5"
                                value={l.gross_qty_override != null ? fmtQty(l.gross_qty_override) : ''}
                                onChange={(e) => onGrossChange(l.id, e.target.value)}
                                inputMode="decimal"
                                placeholder={c ? fmtQty(c.gross) : ''}
                              />
                            </td>
                            <td>
                              <div className="relative">
                                <input
                                  className="input text-right font-mono py-1.5 pr-10"
                                  value={String(Math.round(clamp(toNum(l.yield_percent, 100), 0.0001, 100) * 100) / 100)}
                                  onChange={(e) => onYieldChange(l.id, e.target.value)}
                                  inputMode="decimal"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary opacity-60">%</span>
                              </div>
                            </td>
                            {showCost ? (
                              <td>
                                <div className={cx('font-mono font-semibold text-right flex items-center justify-end gap-1', (!c || c.lineCost <= 0) && 'text-muted opacity-50')}>
                                  {c && c.lineCost > 0 ? (
                                    <>
                                      <span>{fmtMoney(c.lineCost, cur)}</span>
                                      {c.warnings.length > 0 && (
                                        <span className="text-warning text-sm cursor-help" title={c.warnings[0]}>⚠</span>
                                      )}
                                    </>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </div>
                              </td>
                            ) : null}
                            <td>
                              <div className="flex gap-1.5 justify-center">
                                <button
                                  className="w-8 h-8 border border-primary/15 rounded-lg bg-white text-muted hover:bg-primary/10 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                                  type="button"
                                  onClick={() => duplicateLineLocal(l.id)}
                                  title="Duplicate line"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                </button>
                                <button
                                  className="w-8 h-8 border border-error/15 rounded-lg bg-white text-muted hover:bg-error/10 hover:border-error hover:text-error transition-all flex items-center justify-center"
                                  type="button"
                                  onClick={() => deleteLineLocal(l.id)}
                                  title="Delete line"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {visibleLines.length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-neutral-50 to-white border-t border-primary/10">
                      <div className="flex items-center gap-6 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-muted font-medium">Total items:</span>
                          <span className="font-bold text-primary bg-white px-3 py-1 rounded-full border border-primary/15">{visibleLines.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted font-medium">Ingredients:</span>
                          <span className="font-bold text-primary bg-white px-3 py-1 rounded-full border border-primary/15">{visibleLines.filter(l => l.line_type === 'ingredient').length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted font-medium">Subrecipes:</span>
                          <span className="font-bold text-primary bg-white px-3 py-1 rounded-full border border-primary/15">{visibleLines.filter(l => l.line_type === 'subrecipe').length}</span>
                        </div>
                        {showCost && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted font-medium">Total cost:</span>
                            <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">{fmtMoney(totals.totalCost, cur)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Method Section */}
          <div className="card mb-4">
            <div className="card-header">
              <div className="text-caption flex items-center gap-2" id="sec-method">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                METHOD
              </div>
              <div className="text-muted mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                  Add steps with photos. Auto-save enabled.
                </span>
              </div>
            </div>
            <div className="card-body">
              <div className="card-soft p-4 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-primary uppercase tracking-wider">NEW STEP</div>
                    <div className="text-[11px] text-muted">Write a clear, concise instruction</div>
                  </div>
                </div>
                <div className="flex gap-3 items-start flex-wrap">
                  <div className="flex-1 min-w-[300px]">
                    <input
                      className="input"
                      value={newStep}
                      onChange={(e) => setNewStep(e.target.value)}
                      placeholder="e.g., Sauté onions until golden brown..."
                      style={{ padding: '14px 18px', fontSize: '0.95rem' }}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={addStep}
                    style={{ padding: '14px 28px', whiteSpace: 'nowrap' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    ADD STEP
                  </button>
                </div>
              </div>

              {steps.length ? (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {steps.map((s, idx) => (
                    <div
                      key={idx}
                      className="card-soft p-0 border border-primary/15 transition-all h-fit flex flex-col relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-400))', opacity: 0.6 }} />
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold" style={{ fontSize: '1rem' }}>
                              {idx + 1}
                            </div>
                            <div className="text-xs font-bold text-primary uppercase tracking-wider">STEP {idx + 1}</div>
                          </div>
                          <button
                            className="text-error hover:text-red-700 transition-colors"
                            type="button"
                            onClick={() => removeStep(idx)}
                            style={{ opacity: 0.7, fontSize: '16px' }}
                          >
                            ✕
                          </button>
                        </div>
                        <textarea
                          className="textarea input"
                          value={s}
                          onChange={(e) => updateStep(idx, e.target.value)}
                          rows={4}
                          style={{ fontSize: '0.9rem', lineHeight: '1.5', padding: '10px', minHeight: '100px', marginBottom: '12px', resize: 'vertical' }}
                          placeholder={`Step ${idx + 1} description...`}
                        />
                        {stepPhotos[idx] && (
                          <div className="flex items-center gap-1.5 mb-2 text-xs text-primary">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="2" width="20" height="20" rx="2.18" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                              <path d="M21 15l-5-5L7 21" />
                            </svg>
                            <span>Photo attached</span>
                          </div>
                        )}
                        {stepPhotos[idx] ? (
                          <div className="relative group mt-2">
                            <img
                              src={stepPhotos[idx]}
                              alt={`Step ${idx + 1}`}
                              style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(20, 184, 166, 0.2)', display: 'block' }}
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                              <label
                                htmlFor={`step-photo-${idx}`}
                                className="px-2 py-1 bg-white rounded text-xs font-medium cursor-pointer hover:bg-neutral-100"
                              >
                                Change
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <input
                              type="file"
                              accept="image/*"
                              disabled={stepUploading}
                              id={`step-photo-${idx}`}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (!f) return
                                uploadStepPhoto(f, idx).catch(() => {})
                                e.currentTarget.value = ''
                              }}
                            />
                            <label
                              htmlFor={`step-photo-${idx}`}
                              className="flex items-center justify-center gap-1.5 w-full py-2 border-2 border-dashed border-neutral-300 rounded-lg text-xs text-neutral-500 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                              style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column' }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="2" width="20" height="20" rx="2.18" />
                                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                                <path d="M21 15l-5-5L7 21" />
                              </svg>
                              Add photo
                            </label>
                          </div>
                        )}
                        {stepUploading && (
                          <div className="mt-2 flex items-center justify-center gap-2 text-primary text-xs">
                            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Uploading...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-10 bg-gradient-to-br from-neutral-50 to-white rounded-2xl border-2 border-dashed border-primary/20">
                  <div className="text-4xl mb-3 opacity-70">📝</div>
                  <div className="text-heading mb-1">No steps yet</div>
                  <div className="text-muted text-sm">Add your first step above. Each step can have its own photo.</div>
                </div>
              )}

              <div className="mt-6">
                <div className="card-soft p-0">
                  <div className="flex items-center gap-3 p-4 border-b border-neutral-200/60" style={{ background: 'linear-gradient(to right, rgba(20, 184, 166, 0.02), transparent)' }}>
                    <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 7h16M4 12h16M4 17h10" />
                        <rect x="14" y="15" width="6" height="6" rx="1" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-secondary uppercase tracking-wider">LEGACY METHOD (OPTIONAL)</div>
                      <div className="text-[11px] text-muted">Use this for longer, formatted instructions or as fallback</div>
                    </div>
                  </div>
                  <div className="p-4">
                    <textarea
                      className="textarea input"
                      value={methodLegacy}
                      onChange={(e) => setMethodLegacy(e.target.value)}
                      placeholder="Write your full method here. This can be used instead of steps if you prefer a single text block..."
                      rows={4}
                      style={{ fontSize: '0.95rem', lineHeight: '1.6', padding: '14px' }}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                        {methodLegacy.length} characters
                      </div>
                      {steps.length > 0 && methodLegacy && (
                        <div className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                          <span>ℹ️</span>
                          <span>Both steps and legacy method are saved</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                @media (max-width: 1024px) {
                  .steps-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                  }
                }
                @media (max-width: 640px) {
                  .steps-grid {
                    grid-template-columns: 1fr !important;
                  }
                }
              `}</style>
            </div>
          </div>

          {/* Cost History Section */}
          {showCost && (
            <div className="card mb-4">
              <div className="card-header flex justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-caption flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    COST HISTORY
                  </div>
                  <div className="text-muted mt-2">Snapshots stored locally per recipe.</div>
                  <div className="mt-3">
                    <CostTimeline points={costPoints} currency={currency} />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-primary flex items-center gap-2" type="button" onClick={addSnapshot}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Add snapshot
                  </button>
                  <button className="btn btn-danger flex items-center gap-2" type="button" onClick={clearSnapshots}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Clear
                  </button>
                </div>
              </div>
              <div className="card-body">
                {!costPoints.length ? (
                  <div className="text-muted flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    No snapshots yet.
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    {costPoints.map((p: any) => (
                      <div key={p.id} className="card-soft p-3 rounded-xl flex justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-bold">{new Date(p.createdAt).toLocaleString()}</div>
                          <div className="text-muted mt-2">
                            Total: {fmtMoney(p.totalCost, p.currency)} • CPP: {fmtMoney(p.cpp, p.currency)} • Portions: {p.portions}
                          </div>
                        </div>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => removeSnapshot(p.id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print Section */}
      <div className="gc-print-only">
        <div className="gc-print-page">
          <div className="gc-print-header">
            <div style={{ flex: 1 }}>
              <div className="gc-print-name">{(name || 'Untitled').trim()}</div>
              <div className="gc-print-sub">
                {(category || 'Uncategorized').trim()} • Portions: {Math.max(1, Math.floor(toNum(portions, 1)))} • Currency: {cur}
              </div>
              <div className="gc-print-kpis">
                <div className="gc-print-chip">Total: {fmtMoney(totals.totalCost, cur)}</div>
                <div className="gc-print-chip">CPP: {fmtMoney(totals.cpp, cur)}</div>
                <div className="gc-print-chip">FC%: {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                <div className="gc-print-chip">Margin: {fmtMoney(totals.margin, cur)}</div>
              </div>
            </div>
            <div className="gc-print-photo">
              {recipe?.photo_url ? <img src={recipe.photo_url} alt="Recipe" /> : null}
            </div>
          </div>
          {description ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Description</div>
              <div className="gc-print-text">{description}</div>
            </div>
          ) : null}
          <div className="gc-print-section">
            <div className="gc-print-title">Ingredients</div>
            <table className="gc-print-table">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '17%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Ingredient</th>
                  <th>Net</th>
                  <th>Unit</th>
                  <th>Gross</th>
                  <th>Yield%</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines
                  .filter((l) => l.line_type !== 'group')
                  .map((l) => {
                    const c = lineComputed.get(l.id)
                    const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                    const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null
                    const code = l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')
                    const name = l.line_type === 'ingredient' ? (ing?.name || 'Ingredient') : (sub?.name || 'Subrecipe')
                    return (
                      <tr key={l.id}>
                        <td><span className="gc-code-display">{code}</span></td>
                        <td>
                          <div>
                            <div>{name}</div>
                            {l.notes && <div style={{ fontSize: '8pt', color: '#64748B' }}>{l.notes}</div>}
                          </div>
                        </td>
                        <td>{c ? fmtQty(c.net) : '—'}</td>
                        <td>{l.unit || 'g'}</td>
                        <td>{c ? fmtQty(c.gross) : '—'}</td>
                        <td>{c ? `${c.yieldPct.toFixed(1)}%` : '—'}</td>
                        <td>{l.notes || '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {steps.length ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Method</div>
              <div className="gc-print-text">
                {steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
              </div>
            </div>
          ) : methodLegacy ? (
            <div className="gc-print-section">
              <div className="gc-print-title">Method</div>
              <div className="gc-print-text">{methodLegacy}</div>
            </div>
          ) : null}
        </div>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}
