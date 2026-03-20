// src/pages/RecipeEditor.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { getIngredientsCached } from '../lib/ingredientsCache'
import { CostTimeline } from '../components/CostTimeline'
import { addCostPoint, clearCostPoints, listCostPoints, deleteCostPoint } from '../lib/costHistory'
import { useKitchen } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import { exportRecipeExcelUltra } from '../utils/exportRecipeExcelUltra'

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

// Utility functions
const toNum = (x: any, fallback = 0) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

const safeUnit = (u: string) => (u ?? '').trim().toLowerCase() || 'g'

const fmtMoney = (n: number, currency: string) => {
  const v = Number.isFinite(n) ? n : 0
  const cur = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}

const fmtQty = (n: number) => {
  const v = Number.isFinite(n) ? n : 0
  if (Math.abs(v) >= 1000) return v.toFixed(0)
  if (Math.abs(v) >= 100) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return v.toFixed(3)
}

const convertQtyToPackUnit = (qty: number, lineUnit: string, packUnit: string) => {
  const u = safeUnit(lineUnit)
  const p = safeUnit(packUnit)
  if (u === 'g' && p === 'kg') return qty / 1000
  if (u === 'kg' && p === 'g') return qty * 1000
  if (u === 'ml' && p === 'l') return qty / 1000
  if (u === 'l' && p === 'ml') return qty * 1000
  return qty
}

const uid = () => `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`

const draftKey = (rid: string) => `gc_recipe_lines_draft__${rid}`

const readDraftLines = (rid: string): Line[] => {
  try {
    const raw = localStorage.getItem(draftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

const writeDraftLines = (rid: string, lines: Line[]) => {
  try { localStorage.setItem(draftKey(rid), JSON.stringify(lines)) } catch {}
}

const clearDraftLines = (rid: string) => {
  try { localStorage.removeItem(draftKey(rid)) } catch {}
}

const mergeDbAndDraft = (db: Line[], draft: Line[]): Line[] => {
  const byId = new Set((db || []).map((l) => l.id))
  const extra = (draft || []).filter((l) => l?.id && !byId.has(l.id))
  return [...(db || []), ...extra].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
}

const PHOTO_BUCKET = 'recipe-photos'

// Styles - Defined at module level
const styles = `
/* ===== Artisan Kitchen Design System ===== */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Source+Sans+Pro:wght@400;500;600;700&display=swap');

:root {
  --ak-cream: #FBF7F4;
  --ak-cream-dark: #F5EDE7;
  --ak-sienna: #A0522D;
  --ak-sienna-light: #CD853F;
  --ak-sienna-dark: #8B4513;
  --ak-olive: #556B2F;
  --ak-olive-light: #6B8E23;
  --ak-charcoal: #2C2C2C;
  --ak-charcoal-light: #4A4A4A;
  --ak-sage: #9CAF88;
  --ak-terracotta: #CC6B49;
  --ak-white: #FFFFFF;
  --ak-border: rgba(160, 82, 45, 0.15);
  --ak-border-dark: rgba(160, 82, 45, 0.3);
  --ak-shadow-sm: 0 2px 8px rgba(139, 69, 19, 0.06);
  --ak-shadow: 0 4px 20px rgba(139, 69, 19, 0.08);
  --ak-shadow-lg: 0 12px 40px rgba(139, 69, 19, 0.12);
  --ak-radius: 12px;
  --ak-radius-lg: 20px;
  --ak-radius-xl: 28px;
  --ak-font-display: 'Playfair Display', Georgia, serif;
  --ak-font-body: 'Source Sans Pro', -apple-system, sans-serif;
  --ak-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ak-app {
  min-height: 100vh;
  background: var(--ak-cream);
  font-family: var(--ak-font-body);
  color: var(--ak-charcoal);
}

/* ===== Header ===== */
.ak-header {
  background: linear-gradient(180deg, var(--ak-white) 0%, var(--ak-cream) 100%);
  border-bottom: 1px solid var(--ak-border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.ak-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.ak-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.ak-back-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ak-white);
  border: 1px solid var(--ak-border);
  border-radius: var(--ak-radius);
  color: var(--ak-sienna);
  text-decoration: none;
  transition: var(--ak-transition);
  box-shadow: var(--ak-shadow-sm);
}

.ak-back-btn:hover {
  background: var(--ak-sienna);
  color: var(--ak-white);
  transform: translateX(-2px);
}

.ak-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ak-recipe-type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: linear-gradient(135deg, var(--ak-sage), var(--ak-olive-light));
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ak-white);
  text-transform: uppercase;
  width: fit-content;
}

.ak-recipe-name {
  font-family: var(--ak-font-display);
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--ak-charcoal);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.ak-autosave {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--ak-charcoal-light);
}

.ak-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ak-olive);
  position: relative;
}

.ak-status-dot::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--ak-olive);
  opacity: 0.3;
  animation: ak-pulse 2s infinite;
}

.ak-status-dot.saving {
  background: var(--ak-terracotta);
}

.ak-status-dot.saving::after {
  border-color: var(--ak-terracotta);
}

@keyframes ak-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.4); opacity: 0; }
}

/* ===== Navigation ===== */
.ak-nav {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--ak-cream-dark);
  border-radius: var(--ak-radius-xl);
  border: 1px solid var(--ak-border);
}

.ak-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--ak-radius-lg);
  border: none;
  background: transparent;
  color: var(--ak-charcoal-light);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ak-transition);
  font-family: inherit;
}

.ak-nav-item:hover {
  background: var(--ak-white);
  color: var(--ak-sienna);
}

.ak-nav-item.active {
  background: var(--ak-white);
  color: var(--ak-sienna-dark);
  box-shadow: var(--ak-shadow-sm);
}

.ak-nav-icon {
  font-size: 1rem;
}

/* ===== Main Content ===== */
.ak-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px;
}

/* ===== Section Cards ===== */
.ak-section {
  background: var(--ak-white);
  border-radius: var(--ak-radius-xl);
  margin-bottom: 28px;
  box-shadow: var(--ak-shadow);
  border: 1px solid var(--ak-border);
  overflow: hidden;
}

.ak-section-alt {
  background: linear-gradient(135deg, var(--ak-cream) 0%, var(--ak-white) 100%);
}

.ak-section-header {
  padding: 24px 32px;
  border-bottom: 1px solid var(--ak-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: linear-gradient(90deg, rgba(160, 82, 45, 0.03), transparent);
}

.ak-section-title {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ak-section-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--ak-sienna-light), var(--ak-sienna));
  border-radius: var(--ak-radius);
  color: var(--ak-white);
  font-size: 1.25rem;
}

.ak-section-title-text h2 {
  font-family: var(--ak-font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ak-charcoal);
  margin: 0;
}

.ak-section-title-text span {
  font-size: 0.8rem;
  color: var(--ak-charcoal-light);
}

.ak-section-body {
  padding: 32px;
}

/* ===== KPI Grid ===== */
.ak-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.ak-kpi {
  background: linear-gradient(145deg, var(--ak-white), var(--ak-cream));
  border-radius: var(--ak-radius-lg);
  padding: 24px;
  border: 1px solid var(--ak-border);
  position: relative;
  overflow: hidden;
  transition: var(--ak-transition);
}

.ak-kpi::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, var(--ak-sienna), var(--ak-terracotta));
}

.ak-kpi:hover {
  transform: translateY(-4px);
  box-shadow: var(--ak-shadow-lg);
}

.ak-kpi-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ak-charcoal-light);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.ak-kpi-value {
  font-family: var(--ak-font-display);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ak-sienna-dark);
}

.ak-kpi-value.negative {
  color: var(--ak-terracotta);
}

/* ===== Forms ===== */
.ak-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.ak-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ak-field.span-2 {
  grid-column: span 2;
}

.ak-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ak-charcoal-light);
}

.ak-input,
.ak-select,
.ak-textarea {
  width: 100%;
  padding: 14px 18px;
  background: var(--ak-cream);
  border: 2px solid var(--ak-border);
  border-radius: var(--ak-radius);
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--ak-charcoal);
  transition: var(--ak-transition);
}

.ak-input:focus,
.ak-select:focus,
.ak-textarea:focus {
  outline: none;
  border-color: var(--ak-sienna);
  background: var(--ak-white);
  box-shadow: 0 0 0 4px rgba(160, 82, 45, 0.1);
}

.ak-input::placeholder,
.ak-textarea::placeholder {
  color: var(--ak-charcoal-light);
  opacity: 0.6;
}

.ak-input-lg {
  padding: 18px 20px;
  font-size: 1.1rem;
  font-family: var(--ak-font-display);
  font-weight: 500;
}

.ak-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23A0522D'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  background-size: 18px;
  padding-right: 48px;
  cursor: pointer;
}

.ak-textarea {
  min-height: 120px;
  resize: vertical;
  line-height: 1.6;
}

/* ===== Toggle ===== */
.ak-toggle-wrap {
  padding: 24px;
  background: linear-gradient(90deg, var(--ak-cream), var(--ak-white));
  border-radius: var(--ak-radius-lg);
  border: 1px solid var(--ak-border);
}

.ak-toggle-label {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
}

.ak-toggle {
  display: none;
}

.ak-toggle-slider {
  width: 52px;
  height: 28px;
  background: var(--ak-cream-dark);
  border: 2px solid var(--ak-border);
  border-radius: 14px;
  position: relative;
  transition: var(--ak-transition);
}

.ak-toggle-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: var(--ak-white);
  border-radius: 50%;
  transition: var(--ak-transition);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.ak-toggle:checked + .ak-toggle-slider {
  background: var(--ak-sienna);
  border-color: var(--ak-sienna);
}

.ak-toggle:checked + .ak-toggle-slider::after {
  left: 29px;
}

.ak-toggle-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ak-charcoal);
  letter-spacing: 0.05em;
}

.ak-toggle-fields {
  display: flex;
  gap: 20px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--ak-border);
}

/* ===== Photo Upload ===== */
.ak-photo-section {
  margin-top: 24px;
}

.ak-photo-upload {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-top: 12px;
}

.ak-photo-preview {
  position: relative;
  width: 180px;
  height: 135px;
  border-radius: var(--ak-radius-lg);
  overflow: hidden;
  border: 2px solid var(--ak-border);
  box-shadow: var(--ak-shadow-sm);
}

.ak-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ak-photo-overlay {
  position: absolute;
  inset: 0;
  background: rgba(44, 44, 44, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: var(--ak-transition);
}

.ak-photo-preview:hover .ak-photo-overlay {
  opacity: 1;
}

.ak-photo-btn {
  padding: 10px 20px;
  background: var(--ak-white);
  border-radius: var(--ak-radius);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ak-sienna);
  cursor: pointer;
}

.ak-photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 180px;
  height: 135px;
  background: var(--ak-cream);
  border: 2px dashed var(--ak-border-dark);
  border-radius: var(--ak-radius-lg);
  color: var(--ak-charcoal-light);
  cursor: pointer;
  transition: var(--ak-transition);
}

.ak-photo-placeholder:hover {
  border-color: var(--ak-sienna);
  color: var(--ak-sienna);
  background: var(--ak-white);
}

.ak-photo-placeholder span {
  font-size: 0.85rem;
  font-weight: 500;
}

.ak-photo-tips {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ak-tip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: var(--ak-charcoal-light);
}

.ak-tip-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ak-sage);
  color: var(--ak-white);
  border-radius: 50%;
  font-size: 0.75rem;
}

/* ===== Type Selector ===== */
.ak-type-selector {
  display: flex;
  gap: 12px;
  padding: 20px;
  background: var(--ak-cream);
  border-radius: var(--ak-radius-lg);
  margin-bottom: 24px;
}

.ak-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--ak-white);
  border: 2px solid var(--ak-border);
  border-radius: var(--ak-radius);
  color: var(--ak-charcoal-light);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ak-transition);
  font-family: inherit;
}

.ak-type-btn:hover {
  border-color: var(--ak-sienna);
  color: var(--ak-sienna);
}

.ak-type-btn.active {
  background: linear-gradient(135deg, var(--ak-sienna), var(--ak-sienna-light));
  border-color: var(--ak-sienna);
  color: var(--ak-white);
  box-shadow: var(--ak-shadow);
}

.ak-type-icon {
  font-size: 1.2rem;
}

/* ===== Quantity Grid ===== */
.ak-qty-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.ak-qty-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ak-qty-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ak-charcoal-light);
}

.ak-qty-input-wrap {
  position: relative;
}

.ak-qty-input {
  width: 100%;
  padding: 12px 14px;
  background: var(--ak-white);
  border: 2px solid var(--ak-border);
  border-radius: var(--ak-radius);
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  text-align: right;
  color: var(--ak-charcoal);
  transition: var(--ak-transition);
}

.ak-qty-input:focus {
  outline: none;
  border-color: var(--ak-sienna);
}

.ak-qty-unit {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ak-sienna);
  background: var(--ak-cream);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ===== Buttons ===== */
.ak-btn-group {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--ak-border);
}

.ak-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 28px;
  border-radius: var(--ak-radius);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: var(--ak-transition);
  border: none;
}

.ak-btn-primary {
  background: linear-gradient(135deg, var(--ak-sienna), var(--ak-sienna-light));
  color: var(--ak-white);
  box-shadow: 0 4px 16px rgba(160, 82, 45, 0.3);
}

.ak-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(160, 82, 45, 0.4);
}

.ak-btn-secondary {
  background: var(--ak-white);
  color: var(--ak-sienna);
  border: 2px solid var(--ak-border-dark);
}

.ak-btn-secondary:hover {
  border-color: var(--ak-sienna);
  background: var(--ak-cream);
}

.ak-btn-sm {
  padding: 10px 18px;
  font-size: 0.85rem;
}

/* ===== Table ===== */
.ak-table-wrap {
  overflow-x: auto;
  border-radius: var(--ak-radius-lg);
  border: 1px solid var(--ak-border);
}

.ak-table {
  width: 100%;
  border-collapse: collapse;
}

.ak-table thead {
  background: linear-gradient(90deg, var(--ak-cream), var(--ak-cream-dark));
}

.ak-table th {
  padding: 16px 14px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ak-sienna);
  border-bottom: 2px solid var(--ak-border);
}

.ak-table td {
  padding: 14px;
  border-bottom: 1px solid var(--ak-border);
  vertical-align: middle;
}

.ak-table tbody tr {
  transition: var(--ak-transition);
}

.ak-table tbody tr:hover {
  background: rgba(160, 82, 45, 0.03);
}

.ak-table-code {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ak-sienna);
  background: var(--ak-cream);
  padding: 4px 10px;
  border-radius: 6px;
}

.ak-table-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ak-table-item-name {
  font-weight: 500;
  color: var(--ak-charcoal);
}

.ak-table-item-note {
  font-size: 0.75rem;
  color: var(--ak-olive);
  background: rgba(85, 107, 47, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}

.ak-table-input {
  width: 80px;
  padding: 8px 10px;
  background: var(--ak-cream);
  border: 1px solid var(--ak-border);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  text-align: right;
  color: var(--ak-charcoal);
  transition: var(--ak-transition);
}

.ak-table-input:focus {
  outline: none;
  border-color: var(--ak-sienna);
  background: var(--ak-white);
}

.ak-table-unit {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ak-charcoal-light);
  background: var(--ak-cream);
  padding: 4px 10px;
  border-radius: 6px;
}

.ak-table-cost {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: var(--ak-sienna-dark);
}

.ak-table-actions {
  display: flex;
  gap: 8px;
}

.ak-table-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ak-white);
  border: 1px solid var(--ak-border);
  border-radius: 8px;
  color: var(--ak-charcoal-light);
  cursor: pointer;
  transition: var(--ak-transition);
}

.ak-table-btn:hover {
  border-color: var(--ak-sienna);
  color: var(--ak-sienna);
}

.ak-table-btn.danger:hover {
  border-color: var(--ak-terracotta);
  color: var(--ak-terracotta);
}

/* ===== Group Row ===== */
.ak-group-row {
  background: linear-gradient(90deg, rgba(160, 82, 45, 0.06), rgba(204, 107, 73, 0.03));
}

.ak-group-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
}

.ak-group-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ak-group-icon {
  font-size: 1.1rem;
}

.ak-group-name {
  font-family: var(--ak-font-display);
  font-weight: 600;
  font-size: 1rem;
  color: var(--ak-sienna-dark);
}

.ak-group-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ak-terracotta);
  background: rgba(204, 107, 73, 0.1);
  padding: 3px 10px;
  border-radius: 10px;
  text-transform: uppercase;
}

/* ===== Empty State ===== */
.ak-empty {
  text-align: center;
  padding: 60px 40px;
}

.ak-empty-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
  opacity: 0.6;
}

.ak-empty-title {
  font-family: var(--ak-font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ak-charcoal);
  margin-bottom: 8px;
}

.ak-empty-text {
  font-size: 0.9rem;
  color: var(--ak-charcoal-light);
}

/* ===== Steps ===== */
.ak-step-input {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
}

.ak-step-input .ak-field {
  flex: 1;
}

.ak-steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.ak-step-card {
  background: linear-gradient(145deg, var(--ak-white), var(--ak-cream));
  border-radius: var(--ak-radius-lg);
  border: 1px solid var(--ak-border);
  overflow: hidden;
  transition: var(--ak-transition);
}

.ak-step-card:hover {
  box-shadow: var(--ak-shadow);
}

.ak-step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--ak-cream);
  border-bottom: 1px solid var(--ak-border);
}

.ak-step-num {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--ak-sienna), var(--ak-sienna-light));
  border-radius: 50%;
  font-family: var(--ak-font-display);
  font-weight: 700;
  font-size: 1rem;
  color: var(--ak-white);
}

.ak-step-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ak-charcoal-light);
  flex: 1;
}

.ak-step-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--ak-border);
  border-radius: 50%;
  color: var(--ak-charcoal-light);
  cursor: pointer;
  transition: var(--ak-transition);
}

.ak-step-remove:hover {
  background: var(--ak-terracotta);
  border-color: var(--ak-terracotta);
  color: var(--ak-white);
}

.ak-step-body {
  padding: 20px;
}

.ak-step-textarea {
  width: 100%;
  min-height: 100px;
  padding: 0;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--ak-charcoal);
  resize: vertical;
}

.ak-step-textarea:focus {
  outline: none;
}

.ak-step-photo {
  margin-top: 16px;
}

.ak-step-photo-preview {
  aspect-ratio: 1;
  border-radius: var(--ak-radius);
  overflow: hidden;
  border: 1px solid var(--ak-border);
}

.ak-step-photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ak-step-photo-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 1;
  background: var(--ak-cream);
  border: 2px dashed var(--ak-border);
  border-radius: var(--ak-radius);
  color: var(--ak-charcoal-light);
  cursor: pointer;
  transition: var(--ak-transition);
}

.ak-step-photo-upload:hover {
  border-color: var(--ak-sienna);
  color: var(--ak-sienna);
}

/* ===== Nutrition ===== */
.ak-nutrition-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.ak-nutrition-card {
  background: linear-gradient(145deg, var(--ak-white), var(--ak-cream));
  border-radius: var(--ak-radius-lg);
  padding: 20px;
  border: 1px solid var(--ak-border);
  text-align: center;
  transition: var(--ak-transition);
}

.ak-nutrition-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--ak-shadow-sm);
}

.ak-nutrition-icon {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.ak-nutrition-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ak-charcoal-light);
  margin-bottom: 8px;
}

.ak-nutrition-input {
  width: 100%;
  padding: 12px;
  background: var(--ak-white);
  border: 1px solid var(--ak-border);
  border-radius: var(--ak-radius);
  font-family: inherit;
  font-size: 1rem;
  text-align: center;
  color: var(--ak-charcoal);
}

.ak-nutrition-input:focus {
  outline: none;
  border-color: var(--ak-sienna);
}

/* ===== Warning ===== */
.ak-warning {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: rgba(204, 107, 73, 0.08);
  border: 1px solid rgba(204, 107, 73, 0.2);
  border-radius: var(--ak-radius-lg);
  margin-top: 24px;
}

.ak-warning-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ak-terracotta);
  border-radius: 50%;
  color: var(--ak-white);
  font-size: 1.25rem;
  flex-shrink: 0;
}

.ak-warning-content {
  flex: 1;
}

.ak-warning-title {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ak-terracotta);
  margin-bottom: 4px;
}

.ak-warning-text {
  font-size: 0.9rem;
  color: var(--ak-charcoal);
}

/* ===== History ===== */
.ak-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ak-history-actions {
  display: flex;
  gap: 10px;
}

/* ===== Animations ===== */
.ak-flash {
  animation: ak-flash 0.6s ease;
}

@keyframes ak-flash {
  0%, 100% { background: transparent; }
  50% { background: rgba(160, 82, 45, 0.15); }
}

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .ak-kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .ak-steps-grid { grid-template-columns: repeat(2, 1fr); }
  .ak-nutrition-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 900px) {
  .ak-header-inner { flex-direction: column; align-items: stretch; }
  .ak-nav { flex-wrap: wrap; }
  .ak-form-grid { grid-template-columns: 1fr; }
  .ak-field.span-2 { grid-column: span 1; }
  .ak-steps-grid { grid-template-columns: 1fr; }
  .ak-qty-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .ak-main { padding: 16px; }
  .ak-kpi-grid { grid-template-columns: 1fr; }
  .ak-nutrition-grid { grid-template-columns: 1fr; }
  .ak-section-body { padding: 20px; }
}

/* ===== Loading ===== */
.ak-loading {
  min-height: 100vh;
  background: var(--ak-cream);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ak-loading-inner {
  text-align: center;
}

.ak-loading-spinner {
  width: 60px;
  height: 60px;
  margin: 0 auto 24px;
  position: relative;
}

.ak-loading-spinner::before,
.ak-loading-spinner::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid transparent;
}

.ak-loading-spinner::before {
  border-top-color: var(--ak-sienna);
  animation: ak-spin 1s linear infinite;
}

.ak-loading-spinner::after {
  border-right-color: var(--ak-sage);
  animation: ak-spin 1.5s linear infinite reverse;
}

@keyframes ak-spin {
  to { transform: rotate(360deg); }
}

.ak-loading-text {
  font-family: var(--ak-font-display);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--ak-sienna);
  margin-bottom: 8px;
}

.ak-loading-hint {
  font-size: 0.9rem;
  color: var(--ak-charcoal-light);
}

.ak-error-page {
  min-height: 100vh;
  background: var(--ak-cream);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}

.ak-error-icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.ak-error-title {
  font-family: var(--ak-font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--ak-terracotta);
  margin-bottom: 8px;
}

.ak-error-text {
  font-size: 1rem;
  color: var(--ak-charcoal-light);
}

.ak-error-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(204, 107, 73, 0.1);
  border: 1px solid rgba(204, 107, 73, 0.25);
  border-radius: var(--ak-radius-lg);
  margin-bottom: 24px;
  color: var(--ak-terracotta);
}

.ak-error-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--ak-terracotta);
  cursor: pointer;
  font-size: 1.25rem;
  opacity: 0.7;
  transition: var(--ak-transition);
}

.ak-error-close:hover { opacity: 1; }
`

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
    return () => { mounted.current = false }
  }, [])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])

  const setLinesSafe = useCallback((updater: any) => {
    setLines((prev) => {
      try {
        return typeof updater === 'function' ? updater(prev) : Array.isArray(updater) ? updater : prev
      } catch { return prev }
    })
  }, [])

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = useCallback((msg: string) => { setToastMsg(msg); setToastOpen(true) }, [])

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

  const [activeSection, setActiveSection] = useState('sec-basics')
  useEffect(() => {
    const ids = ['sec-basics', 'sec-method', 'sec-nutrition', 'sec-lines', 'sec-cost']
    const els = ids.map((x) => document.getElementById(x)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id)
      },
      { root: null, rootMargin: '-20% 0px -70% 0px', threshold: [0.05, 0.1, 0.2, 0.35] }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const [addType, setAddType] = useState<LineType>('ingredient')
  const [ingSearch, setIngSearch] = useState('')
  const [addNote, setAddNote] = useState('')
  const cur = (currency || 'USD').toUpperCase()
  const visibleLines = useMemo(() => [...lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [lines])

  const filteredIngredients = useMemo(() => {
    const s = ingSearch.trim().toLowerCase()
    return s ? ingredients.filter((i) => (i.name || '').toLowerCase().includes(s)).slice(0, 60) : ingredients.slice(0, 60)
  }, [ingredients, ingSearch])

  const subRecipeOptions = useMemo(() => allRecipes.filter((r) => !!r.is_subrecipe && !r.is_archived).slice(0, 200), [allRecipes])

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
    const t = setTimeout(() => setFlashLineId(null), 700)
    return () => clearTimeout(t)
  }, [flashLineId])

  useEffect(() => {
    const raw = addGross.trim()
    if (!raw) return
    const gross = toNum(raw, NaN as any)
    if (!Number.isFinite(gross) || gross <= 0) return
    const net = Math.max(0, toNum(addNetQty, 0))
    setAddYield(String(Math.round(clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100) * 100) / 100))
  }, [addGross, addNetQty])

  const [costPoints, setCostPoints] = useState(() => (id ? listCostPoints(id) : []))
  useEffect(() => { if (id) setCostPoints(listCostPoints(id)) }, [id])

  const recipeRef = useRef<Recipe | null>(null)
  const linesRef = useRef<Line[]>([])
  useEffect(() => { recipeRef.current = recipe }, [recipe])
  useEffect(() => { linesRef.current = lines }, [lines])

  const deletedLineIdsRef = useRef<string[]>([])
  const isDraftLine = useCallback((l: Line) => (l?.id || '').startsWith('tmp_'), [])

  useEffect(() => {
    if (!id) return
    const cur = lines as Line[]
    if (cur.some(isDraftLine) || deletedLineIdsRef.current.length > 0) writeDraftLines(id, cur)
  }, [id, lines, isDraftLine])

  useEffect(() => {
    if (!id) { setErr('Missing recipe id.'); setLoading(false); return }
    let alive = true
    async function load() {
      if (!alive) return
      setLoading(true)
      setErr(null)
      try {
        const { data: r, error: rErr } = await supabase.from('recipes').select('id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,method,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,selling_price,currency,target_food_cost_pct').eq('id', id).single()
        if (rErr) throw rErr
        const recipeRow = r as Recipe
        if (!alive) return

        setRecipe(recipeRow)
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

        const { data: l, error: lErr } = await supabase.from('recipe_lines').select('id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title').eq('recipe_id', id).order('position', { ascending: true })
        if (lErr) throw lErr
        if (!alive) return
        const draft = id ? readDraftLines(id) : []
        setLines(draft?.length ? mergeDbAndDraft((l || []) as Line[], draft) : ((l || []) as Line[]))

        const ing = await getIngredientsCached()
        if (!alive) return
        setIngredients((ing || []) as Ingredient[])

        const { data: rs } = await supabase.from('recipes').select('id,code,code_category,kitchen_id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,photo_url,description,currency').order('name', { ascending: true })
        if (!alive) return
        setAllRecipes((rs || []) as Recipe[])
      } catch (e: any) {
        autosave.setError(e?.message || 'Failed to load recipe.')
        if (!alive) return
        setErr(e?.message || 'Failed to load recipe.')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }
    load().catch(() => {})
    return () => { alive = false }
  }, [id])

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const recipeById = useMemo(() => new Map(allRecipes.map((r) => [r.id, r])), [allRecipes])

  const lineComputed = useMemo(() => {
    const res = new Map<string, { net: number; gross: number; yieldPct: number; unitCost: number; lineCost: number; warnings: string[] }>()
    for (const l of lines) {
      const warnings: string[] = []
      const net = Math.max(0, toNum(l.qty, 0))
      const yieldPct = clamp(toNum(l.yield_percent, 100), 0.0001, 100)
      const gross = l.gross_qty_override != null && l.gross_qty_override > 0 ? Math.max(0, l.gross_qty_override) : net / (yieldPct / 100)
      let unitCost = 0, lineCost = 0
      if (l.line_type === 'ingredient') {
        const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
        unitCost = toNum(ing?.net_unit_cost, 0)
        if (!ing) warnings.push('Missing ingredient')
        if (!Number.isFinite(unitCost) || unitCost <= 0) warnings.push('Ingredient without price')
        const qtyInPack = convertQtyToPackUnit(gross, l.unit, ing?.pack_unit || l.unit)
        lineCost = qtyInPack * unitCost
      } else if (l.line_type === 'subrecipe') {
        warnings.push('Subrecipe cost not expanded')
      }
      res.set(l.id, { net, gross, yieldPct, unitCost, lineCost: Number.isFinite(lineCost) ? lineCost : 0, warnings })
    }
    return res
  }, [lines, ingById])

  const totals = useMemo(() => {
    let totalCost = 0, warnings: string[] = []
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
    return { totalCost, cpp, fcPct: sell > 0 ? (cpp / sell) * 100 : null, margin: sell - cpp, marginPct: sell > 0 ? ((sell - cpp) / sell) * 100 : null, warnings: Array.from(new Set(warnings)).slice(0, 4) }
  }, [lines, lineComputed, portions, sellingPrice])

  const [savingMeta, setSavingMeta] = useState(false)
  const [savingLines, setSavingLines] = useState(false)
  const [savePulse, setSavePulse] = useState(false)

  useEffect(() => {
    const active = savingMeta || savingLines
    if (active) { setSavePulse(true); return }
    const t = setTimeout(() => setSavePulse(false), 700)
    return () => clearTimeout(t)
  }, [savingMeta, savingLines])

  const saveLinesNow = useCallback(async (override?: Line[]): Promise<boolean> => {
    if (!id) return false
    const kitchenId = recipeRef.current?.kitchen_id ?? k.kitchenId ?? null
    if (!kitchenId) { setErr('Kitchen not resolved.'); return false }
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
      const cur = (override ?? linesRef.current || []) as Line[]
      const drafts = cur.filter(isDraftLine)
      const persisted = cur.filter((l) => !isDraftLine(l))
      const needsReload = drafts.length > 0 || delIds.length > 0

      if (persisted.length) {
        const { error: upErr } = await supabase.from('recipe_lines').upsert(persisted.map((l) => ({ id: l.id, kitchen_id: l.kitchen_id ?? kitchenId, recipe_id: id, ingredient_id: l.ingredient_id, sub_recipe_id: l.sub_recipe_id, position: l.position, qty: toNum(l.qty, 0), unit: safeUnit(l.unit), yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100), notes: l.notes ?? null, gross_qty_override: l.gross_qty_override ?? null, line_type: l.line_type, group_title: l.group_title ?? null })))
        if (upErr) throw upErr
      }
      if (drafts.length) {
        const { error: insErr } = await supabase.from('recipe_lines').insert(drafts.map((l) => ({ kitchen_id: kitchenId, recipe_id: id, ingredient_id: l.ingredient_id, sub_recipe_id: l.sub_recipe_id, position: l.position, qty: toNum(l.qty, 0), unit: safeUnit(l.unit), yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100), notes: l.notes ?? null, gross_qty_override: l.gross_qty_override ?? null, line_type: l.line_type, group_title: l.group_title ?? null })))
        if (insErr) throw insErr
      }
      if (needsReload) {
        const { data: l2, error: l2Err } = await supabase.from('recipe_lines').select('id,kitchen_id,recipe_id,ingredient_id,sub_recipe_id,position,qty,unit,yield_percent,notes,gross_qty_override,line_type,group_title').eq('recipe_id', id).order('position', { ascending: true })
        if (l2Err) throw l2Err
        setLinesSafe((l2 || []) as Line[])
        clearDraftLines(id)
      } else {
        clearDraftLines(id)
      }
      autosave.setSaved()
      return true
    } catch (e: any) {
      writeDraftLines(id, (override ?? linesRef.current || []) as Line[])
      autosave.setError(e?.message || 'Failed to save.')
      setErr(e?.message || 'Failed to save.')
      return false
    } finally {
      setSavingLines(false)
    }
  }, [id, isDraftLine, setLinesSafe, k.kitchenId, autosave])

  const scheduleLinesSave = useCallback(() => {
    if (!id) return
    setTimeout(() => saveLinesNow().catch(() => {}), 650)
  }, [id, saveLinesNow])

  const updateLine = useCallback((lineId: string, patch: Partial<Line>) => {
    if (!lineId) return
    const next = (linesRef.current || []).map((l) => l.id === lineId ? { ...l, ...patch } : l)
    linesRef.current = next
    setLinesSafe(next)
    scheduleLinesSave()
  }, [scheduleLinesSave, setLinesSafe])

  const duplicateLineLocal = useCallback((lineId: string) => {
    if (!lineId) return
    const cur = linesRef.current || []
    const src = cur.find((l) => l.id === lineId)
    if (!src) return
    const maxPos = cur.reduce((m, l) => Math.max(m, toNum(l.position, 0)), 0)
    const copy: Line = { ...src, id: uid(), position: maxPos + 1 }
    const next = [...cur, copy].sort((a, b) => toNum(a.position, 0) - toNum(b.position, 0))
    linesRef.current = next
    setLinesSafe(next)
    saveLinesNow(next).catch(() => {})
  }, [setLinesSafe, saveLinesNow])

  const deleteLineLocal = useCallback((lineId: string) => {
    if (!lineId) return
    const next = (linesRef.current || []).filter((x) => x.id !== lineId)
    if (!lineId.startsWith('tmp_') && !deletedLineIdsRef.current.includes(lineId)) deletedLineIdsRef.current.push(lineId)
    linesRef.current = next
    setLinesSafe(next)
    saveLinesNow(next).catch(() => {})
  }, [setLinesSafe, saveLinesNow])

  const buildMetaPatch = useCallback(() => ({
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
  }), [code, codeCategory, name, category, portions, description, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC, isSubRecipe, yieldQty, yieldUnit])

  const saveMetaNow = useCallback(async () => {
    if (!id) return
    setErr(null)
    setSavingMeta(true)
    try {
      const { error } = await supabase.from('recipes').update(buildMetaPatch()).eq('id', id)
      if (error) throw error
      showToast('Saved.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to save.')
    } finally {
      setSavingMeta(false)
    }
  }, [id, buildMetaPatch, showToast])

  useEffect(() => {
    if (!recipe) return
    const t = setTimeout(() => saveMetaNow().catch(() => {}), 650)
    return () => clearTimeout(t)
  }, [code, codeCategory, name, category, portions, description, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat, currency, sellingPrice, targetFC, isSubRecipe, yieldQty, yieldUnit, recipe, saveMetaNow])

  const addLineLocal = useCallback(async () => {
    if (!id) return
    const basePos = (linesRef.current?.length || 0) + 1
    const yRaw = clamp(toNum(addYield, 100), 0.0001, 100)
    const net = Math.max(0, toNum(addNetQty, 0))
    const gross = addGross.trim() === '' ? null : Math.max(0, toNum(addGross, 0))
    const y = gross != null && gross > 0 && net >= 0 ? clamp((net / Math.max(0.0000001, gross)) * 100, 0.0001, 100) : yRaw

    if (addType === 'ingredient') {
      if (!addIngredientId) { setErr('Pick an ingredient.'); return }
      const newL: Line = { id: uid(), kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null, recipe_id: id, ingredient_id: addIngredientId, sub_recipe_id: null, position: basePos, qty: net, unit: addUnit || 'g', yield_percent: y, notes: addNote || null, gross_qty_override: gross, line_type: 'ingredient', group_title: null }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      if (ok) { showToast('Line added.'); setAddNote(''); setAddNetQty('1'); setAddGross(''); setAddYield('100'); setAddIngredientId(''); setIngSearch('') }
      else showToast('Saved locally.')
      return
    }
    if (addType === 'subrecipe') {
      if (!addSubRecipeId) { setErr('Pick a subrecipe.'); return }
      const newL: Line = { id: uid(), kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null, recipe_id: id, ingredient_id: null, sub_recipe_id: addSubRecipeId, position: basePos, qty: net, unit: addUnit || 'g', yield_percent: y, notes: addNote || null, gross_qty_override: gross, line_type: 'subrecipe', group_title: null }
      setErr(null)
      const next = [...(linesRef.current || []), newL]
      linesRef.current = next
      setLinesSafe(next)
      setFlashLineId(newL.id)
      const ok = await saveLinesNow(next)
      showToast(ok ? 'Subrecipe added.' : 'Saved locally.')
      if (ok) { setAddNote(''); setAddNetQty('1'); setAddGross(''); setAddYield('100'); setAddSubRecipeId(''); setIngSearch('') }
      return
    }
    const title = (addGroupTitle || '').trim()
    if (!title) { setErr('Enter group title.'); return }
    const newL: Line = { id: uid(), kitchen_id: recipeRef.current?.kitchen_id ?? k.kitchenId ?? null, recipe_id: id, ingredient_id: null, sub_recipe_id: null, position: basePos, qty: 0, unit: 'g', yield_percent: 100, notes: null, gross_qty_override: null, line_type: 'group', group_title: title }
    setErr(null)
    const next = [...(linesRef.current || []), newL]
    linesRef.current = next
    setLinesSafe(next)
    const ok = await saveLinesNow(next)
    showToast(ok ? 'Group added.' : 'Saved locally.')
    if (ok) setAddGroupTitle('')
  }, [id, addType, addIngredientId, addSubRecipeId, addGroupTitle, addNetQty, addUnit, addYield, addGross, addNote, setLinesSafe, saveLinesNow, showToast, k.kitchenId])

  const onNetChange = useCallback((lineId: string, value: string) => {
    const net = Math.max(0, toNum(value, 0))
    const line = linesRef.current.find((x) => x.id === lineId)
    if (!line) return
    if (line.gross_qty_override != null && line.gross_qty_override > 0) {
      updateLine(lineId, { qty: net, yield_percent: clamp((net / Math.max(0.0000001, line.gross_qty_override)) * 100, 0.0001, 100) })
    } else {
      updateLine(lineId, { qty: net })
    }
  }, [updateLine])

  const onGrossChange = useCallback((lineId: string, value: string) => {
    const line = linesRef.current.find((x) => x.id === lineId)
    if (!line) return
    if (value.trim() === '') { updateLine(lineId, { gross_qty_override: null }); return }
    const gross = Math.max(0, toNum(value, 0))
    if (gross <= 0) { updateLine(lineId, { gross_qty_override: null }); return }
    updateLine(lineId, { gross_qty_override: gross, yield_percent: clamp((Math.max(0, toNum(line.qty, 0)) / gross) * 100, 0.0001, 100) })
  }, [updateLine])

  const onYieldChange = useCallback((lineId: string, value: string) => {
    updateLine(lineId, { yield_percent: clamp(toNum(value, 100), 0.0001, 100), gross_qty_override: null })
  }, [updateLine])

  const uploadRecipePhoto = useCallback(async (file: File) => {
    if (!id) return
    setErr(null)
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${id}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      const url = pub?.publicUrl || null
      const { error: rErr } = await supabase.from('recipes').update({ photo_url: url }).eq('id', id)
      if (rErr) throw rErr
      setRecipe((prev) => prev ? { ...prev, photo_url: url } : prev)
      showToast('Photo updated.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to upload.')
    } finally {
      setUploading(false)
    }
  }, [id, showToast])

  const uploadStepPhoto = useCallback(async (file: File, stepIndex: number) => {
    if (!id) return
    setErr(null)
    setStepUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${id}/steps/${stepIndex}_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      setStepPhotos((prev) => { const next = [...prev]; next[stepIndex] = pub?.publicUrl || ''; return next })
      showToast('Step photo updated.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to upload.')
    } finally {
      setStepUploading(false)
    }
  }, [id, showToast])

  const addStep = useCallback(() => {
    const s = (newStep || '').trim()
    if (!s) return
    setSteps((prev) => [...prev, s])
    setStepPhotos((prev) => [...prev, ''])
    setNewStep('')
  }, [newStep])

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx))
    setStepPhotos((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const updateStep = useCallback((idx: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? value : s))
  }, [])

  const addSnapshot = useCallback(() => {
    if (!id) return
    addCostPoint(id, { createdAt: Date.now(), totalCost: totals.totalCost, cpp: totals.cpp, portions: Math.max(1, Math.floor(toNum(portions, 1))), currency: cur } as any)
    setCostPoints(listCostPoints(id))
    showToast('Snapshot added.')
  }, [id, portions, cur, totals.totalCost, totals.cpp, showToast])

  const clearSnapshots = useCallback(() => {
    if (!id) return
    if (!window.confirm('Clear all cost snapshots?')) return
    clearCostPoints(id)
    setCostPoints(listCostPoints(id))
    showToast('Snapshots cleared.')
  }, [id, showToast])

  const removeSnapshot = useCallback((pid: string) => {
    if (!id) return
    deleteCostPoint(id, pid)
    setCostPoints(listCostPoints(id))
    showToast('Snapshot removed.')
  }, [id, showToast])

  const printNow = useCallback(() => {
    if (!id) return
    window.open(`#/print?id=${encodeURIComponent(id)}&autoprint=1`, '_blank', 'noopener,noreferrer')
  }, [id])

  const exportExcel = useCallback(async () => {
    try {
      const meta = { id, code, name: name || 'Recipe', category, portions: Math.max(1, Math.floor(Number(portions || 1))), yield_qty: yieldQty ? Number(yieldQty) : null, yield_unit: yieldUnit, currency, selling_price: sellingPrice ? Number(sellingPrice) : null, target_food_cost_pct: targetFC ? Number(targetFC) : null, photo_url: recipe?.photo_url, step_photos: stepPhotos, description, steps: steps.filter(Boolean), calories: calories ? Number(calories) : null, protein_g: protein ? Number(protein) : null, carbs_g: carbs ? Number(carbs) : null, fat_g: fat ? Number(fat) : null }
      const rows = lines.filter((l) => l.line_type !== 'group').map((l) => {
        const c = lineComputed.get(l.id)
        return { type: l.line_type === 'subrecipe' ? 'subrecipe' : 'ingredient', code: l.line_type === 'ingredient' ? (l.ingredient_id ? (ingById.get(l.ingredient_id) as any)?.code : '') || '' : (allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.code || ''), name: l.line_type === 'ingredient' ? ingById.get(l.ingredient_id!)?.name || 'Ingredient' : allRecipes.find((sr) => sr.id === l.sub_recipe_id)?.name || 'Subrecipe', net_qty: c?.net ?? 0, unit: l.unit, yield_percent: c?.yieldPct ?? 100, gross_qty: c?.gross ?? 0, unit_cost: c?.unitCost ?? 0, line_cost: c?.lineCost ?? 0, notes: l.notes || '', warnings: c?.warnings || [] }
      })
      await exportRecipeExcelUltra({ meta, totals: { totalCost: totals.totalCost, cpp: totals.cpp, fcPct: totals.fcPct, margin: totals.margin, marginPct: totals.marginPct }, lines: rows as any })
      showToast('Excel exported.')
    } catch (e) {
      showToast('Excel export failed.')
    }
  }, [id, code, name, category, portions, yieldQty, yieldUnit, currency, sellingPrice, targetFC, recipe, stepPhotos, description, steps, calories, protein, carbs, fat, lines, lineComputed, ingById, allRecipes, totals, showToast])

  if (loading) {
    return (
      <div className="ak-loading">
        <style>{styles}</style>
        <div className="ak-loading-inner">
          <div className="ak-loading-spinner"></div>
          <div className="ak-loading-text">Loading Recipe</div>
          <div className="ak-loading-hint">Preparing your workspace...</div>
        </div>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="ak-error-page">
        <style>{styles}</style>
        <div className="ak-error-icon">⚠️</div>
        <div className="ak-error-title">No Recipe Selected</div>
        <div className="ak-error-text">Please select a recipe to edit.</div>
      </div>
    )
  }

  return (
    <>
      <style>{styles}</style>
      <div className="ak-app">
        {/* Header */}
        <header className="ak-header">
          <div className="ak-header-inner">
            <div className="ak-header-left">
              <NavLink to="/recipes" className="ak-back-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </NavLink>
              <div className="ak-header-info">
                <div className="ak-recipe-type">
                  {isSubRecipe ? '🧪 SUBRECIPE' : '🍽️ MAIN RECIPE'}
                </div>
                <h1 className="ak-recipe-name">{(name || 'Untitled').trim()}</h1>
                <div className="ak-autosave">
                  <span className={`ak-status-dot ${savePulse ? 'saving' : ''}`}></span>
                  <span>{savePulse ? 'Saving...' : autosave.lastSavedAt ? `Saved ${Math.max(1, Math.round((Date.now() - autosave.lastSavedAt) / 1000))}s ago` : 'Auto-save ready'}</span>
                </div>
              </div>
            </div>

            <nav className="ak-nav">
              <button className={`ak-nav-item ${activeSection === 'sec-basics' ? 'active' : ''}`} onClick={() => scrollToSection('sec-basics')}>
                <span className="ak-nav-icon">📋</span>
                <span>Basics</span>
              </button>
              <button className={`ak-nav-item ${activeSection === 'sec-lines' ? 'active' : ''}`} onClick={() => scrollToSection('sec-lines')}>
                <span className="ak-nav-icon">📦</span>
                <span>Lines</span>
              </button>
              <button className={`ak-nav-item ${activeSection === 'sec-method' ? 'active' : ''}`} onClick={() => scrollToSection('sec-method')}>
                <span className="ak-nav-icon">📝</span>
                <span>Method</span>
              </button>
              {showCost && (
                <button className={`ak-nav-item ${activeSection === 'sec-cost' ? 'active' : ''}`} onClick={() => scrollToSection('sec-cost')}>
                  <span className="ak-nav-icon">💰</span>
                  <span>Cost</span>
                </button>
              )}
              <button className={`ak-nav-item ${activeSection === 'sec-nutrition' ? 'active' : ''}`} onClick={() => scrollToSection('sec-nutrition')}>
                <span className="ak-nav-icon">🥗</span>
                <span>Nutrition</span>
              </button>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="ak-main">
          {err && (
            <div className="ak-error-banner">
              <span>⚠️</span>
              <span>{err}</span>
              <button className="ak-error-close" onClick={() => setErr(null)}>✕</button>
            </div>
          )}

          {/* Quick Actions */}
          <div className="ak-section" style={{ padding: '16px 32px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="ak-btn ak-btn-secondary ak-btn-sm" onClick={printNow}>🖨️ Print</button>
            <button className="ak-btn ak-btn-primary ak-btn-sm" onClick={exportExcel}>📊 Export Excel</button>
            <button className="ak-btn ak-btn-secondary ak-btn-sm" onClick={() => navigate(`/cook?id=${encodeURIComponent(id)}`)}>🔥 Cook Mode</button>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ak-charcoal-light)', fontSize: '0.85rem' }}>
              Currency: <strong style={{ color: 'var(--ak-sienna)' }}>{cur}</strong>
            </span>
          </div>

          {/* KPI Section */}
          {showCost && (
            <section id="sec-cost" className="ak-section">
              <div className="ak-section-header">
                <div className="ak-section-title">
                  <div className="ak-section-icon">💰</div>
                  <div className="ak-section-title-text">
                    <h2>Cost Analysis</h2>
                    <span>Real-time financial metrics</span>
                  </div>
                </div>
              </div>
              <div className="ak-section-body" style={{ paddingBottom: '24px' }}>
                <div className="ak-kpi-grid">
                  <div className="ak-kpi">
                    <div className="ak-kpi-label">Total Cost</div>
                    <div className="ak-kpi-value">{fmtMoney(totals.totalCost, cur)}</div>
                  </div>
                  <div className="ak-kpi">
                    <div className="ak-kpi-label">Cost/Portion</div>
                    <div className="ak-kpi-value">{fmtMoney(totals.cpp, cur)}</div>
                  </div>
                  <div className="ak-kpi">
                    <div className="ak-kpi-label">Food Cost %</div>
                    <div className={`ak-kpi-value ${totals.fcPct && totals.fcPct > 30 ? 'negative' : ''}`}>
                      {totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div className="ak-kpi">
                    <div className="ak-kpi-label">Margin</div>
                    <div className="ak-kpi-value">{fmtMoney(totals.margin, cur)}</div>
                  </div>
                </div>
                {totals.warnings?.length > 0 && (
                  <div className="ak-warning">
                    <div className="ak-warning-icon">⚠️</div>
                    <div className="ak-warning-content">
                      <div className="ak-warning-title">Pricing Warning</div>
                      <div className="ak-warning-text">{totals.warnings[0]}</div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Basics Section */}
          <section id="sec-basics" className="ak-section">
            <div className="ak-section-header">
              <div className="ak-section-title">
                <div className="ak-section-icon">📋</div>
                <div className="ak-section-title-text">
                  <h2>Basic Information</h2>
                  <span>Core recipe details</span>
                </div>
              </div>
            </div>
            <div className="ak-section-body">
              <div className="ak-form-grid">
                <div className="ak-field">
                  <label className="ak-label">Recipe Code</label>
                  <input className="ak-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PREP-001" disabled={!canEditCodes} />
                </div>
                <div className="ak-field">
                  <label className="ak-label">Code Category</label>
                  <input className="ak-input" value={codeCategory} onChange={(e) => setCodeCategory(e.target.value.toUpperCase())} placeholder="BASE" maxLength={6} disabled={!canEditCodes} />
                </div>
                <div className="ak-field span-2">
                  <label className="ak-label">Recipe Name *</label>
                  <input className="ak-input ak-input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter recipe name" />
                </div>
                <div className="ak-field">
                  <label className="ak-label">Category</label>
                  <select className="ak-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Select...</option>
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
                <div className="ak-field">
                  <label className="ak-label">Portions</label>
                  <input className="ak-input" type="number" value={portions} onChange={(e) => setPortions(e.target.value)} min="1" />
                </div>
                <div className="ak-field">
                  <label className="ak-label">Currency</label>
                  <input className="ak-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
                </div>
                <div className="ak-field">
                  <label className="ak-label">Selling Price</label>
                  <input className="ak-input" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div className="ak-field span-2">
                  <label className="ak-label">Description</label>
                  <textarea className="ak-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={3} />
                </div>
              </div>

              {/* Subrecipe Toggle */}
              <div className="ak-toggle-wrap" style={{ marginTop: '24px' }}>
                <label className="ak-toggle-label">
                  <input type="checkbox" checked={isSubRecipe} onChange={(e) => setIsSubRecipe(e.target.checked)} className="ak-toggle" />
                  <span className="ak-toggle-slider"></span>
                  <span className="ak-toggle-text">Use as Subrecipe</span>
                </label>
                {isSubRecipe && (
                  <div className="ak-toggle-fields">
                    <div className="ak-field">
                      <label className="ak-label">Yield Quantity</label>
                      <input className="ak-input" type="number" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="1000" />
                    </div>
                    <div className="ak-field">
                      <label className="ak-label">Yield Unit</label>
                      <select className="ak-select" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value as any)}>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="pcs">pcs</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Photo Upload */}
              <div className="ak-photo-section">
                <label className="ak-label">Recipe Photo</label>
                <div className="ak-photo-upload">
                  {recipe?.photo_url ? (
                    <div className="ak-photo-preview">
                      <img src={recipe.photo_url} alt="Recipe" />
                      <div className="ak-photo-overlay">
                        <label htmlFor="photo-upload" className="ak-photo-btn">Change</label>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="photo-upload" className="ak-photo-placeholder">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="2" width="20" height="20" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L7 21"/>
                      </svg>
                      <span>Upload Photo</span>
                    </label>
                  )}
                  <input id="photo-upload" type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRecipePhoto(f) }} />
                  <div className="ak-photo-tips">
                    <div className="ak-tip-item"><span className="ak-tip-icon">✓</span> Recommended: 1200 x 800px</div>
                    <div className="ak-tip-item"><span className="ak-tip-icon">✓</span> Max size: 5MB</div>
                    <div className="ak-tip-item"><span className="ak-tip-icon">✓</span> Formats: JPG, PNG, WebP</div>
                  </div>
                </div>
                {uploading && <div style={{ marginTop: '12px', color: 'var(--ak-sienna)', fontSize: '0.85rem' }}>Uploading...</div>}
              </div>
            </div>
          </section>

          {/* Add Line Section */}
          <section className="ak-section ak-section-alt">
            <div className="ak-section-header">
              <div className="ak-section-title">
                <div className="ak-section-icon">➕</div>
                <div className="ak-section-title-text">
                  <h2>Add Line</h2>
                  <span>Add ingredients, subrecipes, or groups</span>
                </div>
              </div>
            </div>
            <div className="ak-section-body">
              <div className="ak-type-selector">
                {(['ingredient', 'subrecipe', 'group'] as LineType[]).map((t) => (
                  <button key={t} className={`ak-type-btn ${addType === t ? 'active' : ''}`} onClick={() => setAddType(t)}>
                    <span className="ak-type-icon">{t === 'ingredient' ? '🥗' : t === 'subrecipe' ? '📋' : '📁'}</span>
                    <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                  </button>
                ))}
              </div>

              {addType !== 'group' ? (
                <>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div className="ak-field" style={{ flex: 1 }}>
                      <input className="ak-input" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder={`Search ${addType}s...`} />
                    </div>
                    <div className="ak-field" style={{ flex: 2 }}>
                      <select className="ak-select" value={addType === 'ingredient' ? addIngredientId : addSubRecipeId} onChange={(e) => addType === 'ingredient' ? setAddIngredientId(e.target.value) : setAddSubRecipeId(e.target.value)}>
                        <option value="">— Select —</option>
                        {addType === 'ingredient' ? filteredIngredients.map((i) => <option key={i.id} value={i.id}>{i.name} {i.code && `(${i.code})`}</option>) : subRecipeOptions.map((r) => <option key={r.id} value={r.id}>{r.name} {r.code && `(${r.code})`}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="ak-qty-grid">
                    <div className="ak-qty-field">
                      <label className="ak-qty-label">Net</label>
                      <input className="ak-qty-input" type="number" value={addNetQty} onChange={(e) => setAddNetQty(e.target.value)} placeholder="0" />
                    </div>
                    <div className="ak-qty-field">
                      <label className="ak-qty-label">Unit</label>
                      <select className="ak-select" value={addUnit} onChange={(e) => setAddUnit(e.target.value)} style={{ padding: '12px 14px' }}>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="pcs">pcs</option>
                      </select>
                    </div>
                    <div className="ak-qty-field">
                      <label className="ak-qty-label">Yield %</label>
                      <div className="ak-qty-input-wrap">
                        <input className="ak-qty-input" type="number" value={addYield} onChange={(e) => setAddYield(e.target.value)} placeholder="100" style={{ paddingRight: '32px' }} />
                        <span className="ak-qty-unit">%</span>
                      </div>
                    </div>
                    <div className="ak-qty-field">
                      <label className="ak-qty-label">Gross</label>
                      <input className="ak-qty-input" type="number" value={addGross} onChange={(e) => setAddGross(e.target.value)} placeholder="auto" />
                    </div>
                    <div className="ak-qty-field">
                      <label className="ak-qty-label">Note</label>
                      <input className="ak-qty-input" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Optional" style={{ textAlign: 'left', fontFamily: 'inherit' }} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="ak-field">
                  <input className="ak-input ak-input-lg" value={addGroupTitle} onChange={(e) => setAddGroupTitle(e.target.value)} placeholder="Group title (e.g., Sauce, Toppings)" />
                </div>
              )}

              <div className="ak-btn-group">
                <button className="ak-btn ak-btn-secondary" onClick={() => saveLinesNow()}>Save Lines</button>
                <button className="ak-btn ak-btn-primary" onClick={addLineLocal}>Add {addType === 'group' ? 'Group' : 'Line'}</button>
              </div>
            </div>
          </section>

          {/* Lines Table */}
          <section id="sec-lines" className="ak-section">
            <div className="ak-section-header">
              <div className="ak-section-title">
                <div className="ak-section-icon">📦</div>
                <div className="ak-section-title-text">
                  <h2>Recipe Lines</h2>
                  <span>{visibleLines.length} items</span>
                </div>
              </div>
            </div>
            {!visibleLines.length ? (
              <div className="ak-empty">
                <div className="ak-empty-icon">📦</div>
                <div className="ak-empty-title">No Lines Yet</div>
                <div className="ak-empty-text">Add ingredients, subrecipes, or groups above</div>
              </div>
            ) : (
              <div className="ak-table-wrap">
                <table className="ak-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Gross</th>
                      <th style={{ textAlign: 'right' }}>Yield</th>
                      {showCost && <th style={{ textAlign: 'right' }}>Cost</th>}
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((l) => {
                      const c = lineComputed.get(l.id)
                      const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
                      const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

                      if (l.line_type === 'group') {
                        return (
                          <tr key={l.id} className={`ak-group-row ${flashLineId === l.id ? 'ak-flash' : ''}`}>
                            <td colSpan={tableColSpan} style={{ padding: '16px' }}>
                              <div className="ak-group-content">
                                <div className="ak-group-left">
                                  <span className="ak-group-icon">📁</span>
                                  <span className="ak-group-name">{l.group_title}</span>
                                  <span className="ak-group-badge">GROUP</span>
                                </div>
                                <div className="ak-table-actions">
                                  <button className="ak-table-btn" onClick={() => duplicateLineLocal(l.id)}>⧉</button>
                                  <button className="ak-table-btn danger" onClick={() => deleteLineLocal(l.id)}>✕</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={l.id} className={flashLineId === l.id ? 'ak-flash' : ''}>
                          <td><span className="ak-table-code">{l.line_type === 'ingredient' ? (ing?.code || '—') : (sub?.code || '—')}</span></td>
                          <td>
                            <div className="ak-table-item">
                              <span className="ak-table-item-name">{l.line_type === 'ingredient' ? (ing?.name || 'Unknown') : (sub?.name || 'Unknown')}</span>
                              {l.notes && <span className="ak-table-item-note">{l.notes}</span>}
                            </div>
                          </td>
                          <td><input className="ak-table-input" type="number" value={fmtQty(toNum(l.qty, 0))} onChange={(e) => onNetChange(l.id, e.target.value)} /></td>
                          <td><span className="ak-table-unit">{l.unit || 'g'}</span></td>
                          <td><input className="ak-table-input" type="number" value={l.gross_qty_override != null ? fmtQty(l.gross_qty_override) : ''} onChange={(e) => onGrossChange(l.id, e.target.value)} placeholder={c ? fmtQty(c.gross) : ''} /></td>
                          <td><input className="ak-table-input" type="number" value={String(Math.round(clamp(toNum(l.yield_percent, 100), 0.0001, 100) * 100) / 100)} onChange={(e) => onYieldChange(l.id, e.target.value)} /></td>
                          {showCost && <td style={{ textAlign: 'right' }}><span className="ak-table-cost">{c && c.lineCost > 0 ? fmtMoney(c.lineCost, cur) : '—'}</span></td>}
                          <td>
                            <div className="ak-table-actions" style={{ justifyContent: 'center' }}>
                              <button className="ak-table-btn" onClick={() => duplicateLineLocal(l.id)}>⧉</button>
                              <button className="ak-table-btn danger" onClick={() => deleteLineLocal(l.id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Method Section */}
          <section id="sec-method" className="ak-section">
            <div className="ak-section-header">
              <div className="ak-section-title">
                <div className="ak-section-icon">📝</div>
                <div className="ak-section-title-text">
                  <h2>Cooking Method</h2>
                  <span>Step-by-step instructions</span>
                </div>
              </div>
            </div>
            <div className="ak-section-body">
              <div className="ak-step-input">
                <div className="ak-field">
                  <input className="ak-input ak-input-lg" value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a cooking step..." onKeyDown={(e) => e.key === 'Enter' && addStep()} />
                </div>
                <button className="ak-btn ak-btn-primary" onClick={addStep}>Add Step</button>
              </div>

              {steps.length > 0 ? (
                <div className="ak-steps-grid">
                  {steps.map((s, idx) => (
                    <div key={idx} className="ak-step-card">
                      <div className="ak-step-header">
                        <div className="ak-step-num">{idx + 1}</div>
                        <span className="ak-step-label">Step</span>
                        <button className="ak-step-remove" onClick={() => removeStep(idx)}>✕</button>
                      </div>
                      <div className="ak-step-body">
                        <textarea className="ak-step-textarea" value={s} onChange={(e) => updateStep(idx, e.target.value)} rows={4} placeholder="Describe this step..." />
                        <div className="ak-step-photo">
                          {stepPhotos[idx] ? (
                            <div className="ak-step-photo-preview"><img src={stepPhotos[idx]} alt={`Step ${idx + 1}`} /></div>
                          ) : (
                            <label htmlFor={`step-photo-${idx}`} className="ak-step-photo-upload">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="2" y="2" width="20" height="20" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L7 21"/>
                              </svg>
                              <span>Add Photo</span>
                            </label>
                          )}
                          <input id={`step-photo-${idx}`} type="file" accept="image/*" style={{ display: 'none' }} disabled={stepUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStepPhoto(f, idx) }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ak-empty">
                  <div className="ak-empty-icon">📝</div>
                  <div className="ak-empty-title">No Steps Yet</div>
                  <div className="ak-empty-text">Add your first cooking step above</div>
                </div>
              )}

              <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--ak-border)' }}>
                <label className="ak-label">Legacy Method (Optional)</label>
                <textarea className="ak-textarea" value={methodLegacy} onChange={(e) => setMethodLegacy(e.target.value)} placeholder="Alternative full method text..." rows={4} />
              </div>
            </div>
          </section>

          {/* Nutrition Section */}
          <section id="sec-nutrition" className="ak-section">
            <div className="ak-section-header">
              <div className="ak-section-title">
                <div className="ak-section-icon">🥗</div>
                <div className="ak-section-title-text">
                  <h2>Nutrition Per Portion</h2>
                  <span>Manual nutritional information</span>
                </div>
              </div>
            </div>
            <div className="ak-section-body" style={{ paddingBottom: '24px' }}>
              <div className="ak-nutrition-grid">
                <div className="ak-nutrition-card">
                  <div className="ak-nutrition-icon">🔥</div>
                  <div className="ak-nutrition-label">Calories</div>
                  <input className="ak-nutrition-input" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="0" />
                </div>
                <div className="ak-nutrition-card">
                  <div className="ak-nutrition-icon">🥩</div>
                  <div className="ak-nutrition-label">Protein (g)</div>
                  <input className="ak-nutrition-input" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="0" />
                </div>
                <div className="ak-nutrition-card">
                  <div className="ak-nutrition-icon">🍞</div>
                  <div className="ak-nutrition-label">Carbs (g)</div>
                  <input className="ak-nutrition-input" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="0" />
                </div>
                <div className="ak-nutrition-card">
                  <div className="ak-nutrition-icon">🧈</div>
                  <div className="ak-nutrition-label">Fat (g)</div>
                  <input className="ak-nutrition-input" type="number" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          </section>

          {/* Cost History */}
          {showCost && (
            <section className="ak-section">
              <div className="ak-section-header ak-history-header">
                <div className="ak-section-title">
                  <div className="ak-section-icon">📊</div>
                  <div className="ak-section-title-text">
                    <h2>Cost History</h2>
                    <span>Track cost changes over time</span>
                  </div>
                </div>
                <div className="ak-history-actions">
                  <button className="ak-btn ak-btn-primary ak-btn-sm" onClick={addSnapshot}>+ Snapshot</button>
                  {costPoints.length > 0 && <button className="ak-btn ak-btn-secondary ak-btn-sm" onClick={clearSnapshots}>Clear</button>}
                </div>
              </div>
              <div className="ak-section-body">
                <CostTimeline points={costPoints} currency={currency} />
                {!costPoints.length && <div className="ak-empty"><div className="ak-empty-text">No snapshots yet</div></div>}
              </div>
            </section>
          )}
        </main>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}
