// src/pages/Dashboard.tsx (محدث - أحجام أصغر)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import { Skeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { motion, AnimatePresence } from 'framer-motion'

// استيراد أنماط التصميم
import '../styles/tokens.css'
import '../styles/globals.css'

type Recipe = {
  id: string
  name: string
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_archived: boolean
  is_subrecipe: boolean
}

type Line = {
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function unitFamily(u: string) {
  const x = safeUnit(u)
  if (x === 'g' || x === 'kg') return 'mass'
  if (x === 'ml' || x === 'l') return 'volume'
  if (x === 'pcs') return 'count'
  if (x === 'portion') return 'portion'
  return 'other'
}

function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const from = safeUnit(fromUnit)
  const to = safeUnit(toUnit)
  if (from === to) return { ok: true, value: qty }

  const ff = unitFamily(from)
  const tf = unitFamily(to)
  if (ff !== tf) return { ok: false, value: qty }

  if (ff === 'mass') {
    if (from === 'g' && to === 'kg') return { ok: true, value: qty / 1000 }
    if (from === 'kg' && to === 'g') return { ok: true, value: qty * 1000 }
  }
  if (ff === 'volume') {
    if (from === 'ml' && to === 'l') return { ok: true, value: qty / 1000 }
    if (from === 'l' && to === 'ml') return { ok: true, value: qty * 1000 }
  }

  return { ok: true, value: qty }
}

function money(n: number, currency = 'USD') {
  const v = Number.isFinite(n) ? n : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}

export default function Dashboard() {
  const nav = useNavigate()
  const lastId = (() => {
    try {
      return localStorage.getItem('gc_last_recipe_id') || ''
    } catch {
      return ''
    }
  })()
  const lastName = (() => {
    try {
      return localStorage.getItem('gc_last_recipe_name') || ''
    } catch {
      return ''
    }
  })()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const [
        { data: r, error: re },
        { data: i, error: ie }
      ] = await Promise.all([
        supabase
          .from('recipes')
          .select('id,name,portions,yield_qty,yield_unit,is_archived,is_subrecipe'),
        supabase
          .from('ingredients')
          .select('id,name,pack_unit,net_unit_cost,is_active')
      ])
      if (re) throw re
      if (ie) throw ie

      const { data: l, error: le } = await supabase
        .from('recipe_lines')
        .select('recipe_id,ingredient_id,sub_recipe_id,qty,unit')
      if (le) throw le

      setRecipes((r ?? []) as Recipe[])
      setLines((l ?? []) as Line[])
      setIngredients((i ?? []) as Ingredient[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])

  const activeRecipes = useMemo(() => recipes.filter((r) => !r.is_archived), [recipes])
  const activeIngredientsCount = useMemo(
    () => ingredients.filter((i) => i.is_active !== false).length,
    [ingredients]
  )
  const subRecipeCount = useMemo(
    () => recipes.filter((r) => r.is_subrecipe && !r.is_archived).length,
    [recipes]
  )

  type CostEngineResult = {
    totals: Map<string, number>
    diag: {
      unitMismatchCount: number
      missingYieldSubrecipeCount: number
      missingIngredientCostCount: number
    }
  }

  const [costEngine, setCostEngine] = useState<CostEngineResult | null>(null)
  const [costEngineLoading, setCostEngineLoading] = useState(false)

  const computeCostEngine = useCallback((): CostEngineResult => {
    const totals = new Map<string, number>()
    const diag = {
      unitMismatchCount: 0,
      missingYieldSubrecipeCount: 0,
      missingIngredientCostCount: 0,
    }

    for (const r of recipes) totals.set(r.id, 0)

    const linesByRecipe = new Map<string, Line[]>()
    for (const l of lines) {
      if (!linesByRecipe.has(l.recipe_id)) linesByRecipe.set(l.recipe_id, [])
      linesByRecipe.get(l.recipe_id)!.push(l)
    }

    const maxPass = 12
    for (let pass = 0; pass < maxPass; pass++) {
      let changed = false

      for (const r of recipes) {
        const rLines = linesByRecipe.get(r.id) ?? []
        let sum = 0

        for (const l of rLines) {
          const qty = Math.max(0, toNum(l.qty, 0))
          const u = safeUnit(l.unit)

          if (l.ingredient_id) {
            const ing = ingById.get(l.ingredient_id)
            if (!ing || ing.is_active === false) continue

            const net = toNum(ing.net_unit_cost, 0)
            const packUnit = safeUnit(ing.pack_unit ?? 'g')

            if (!Number.isFinite(net) || net <= 0) {
              diag.missingIngredientCostCount += 1
              continue
            }

            const conv = convertQty(qty, u, packUnit)
            if (!conv.ok) diag.unitMismatchCount += 1

            sum += conv.value * net
            continue
          }

          if (l.sub_recipe_id) {
            const sub = recipeById.get(l.sub_recipe_id)
            const subTotal = totals.get(l.sub_recipe_id) ?? 0
            if (!sub) continue

            const subPortions = Math.max(1, toNum(sub.portions, 1))
            const subCpp = subTotal / subPortions

            if (u === 'portion') {
              sum += qty * subCpp
              continue
            }

            const yq = toNum(sub.yield_qty, 0)
            const yu = safeUnit(sub.yield_unit ?? '')

            if (yq > 0 && yu && unitFamily(u) === unitFamily(yu)) {
              const costPerYieldUnit = subTotal / yq
              const conv = convertQty(qty, u, yu)
              if (!conv.ok) diag.unitMismatchCount += 1
              sum += conv.value * costPerYieldUnit
              continue
            }

            if (sub.is_subrecipe) diag.missingYieldSubrecipeCount += 1
            sum += qty * subCpp
            continue
          }
        }

        const prev = totals.get(r.id) ?? 0
        if (Math.abs(prev - sum) > 1e-7) {
          totals.set(r.id, sum)
          changed = true
        }
      }

      if (!changed) break
    }

    return { totals, diag }
  }, [recipes, lines, ingById, recipeById])

  useEffect(() => {
    if (loading || err) return

    let cancelled = false
    setCostEngineLoading(true)

    const t = window.setTimeout(() => {
      if (cancelled) return
      try {
        const res = computeCostEngine()
        setCostEngine(res)
      } finally {
        if (!cancelled) setCostEngineLoading(false)
      }
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [loading, err, computeCostEngine])


  const recipeTotalCost = costEngine?.totals ?? new Map<string, number>()
  const diag =
    costEngine?.diag ??
    {
      unitMismatchCount: 0,
      missingYieldSubrecipeCount: 0,
      missingIngredientCostCount: 0,
    }

  const ingredientsUsedMissingCost = useMemo(() => {
    const activeRecipeIds = new Set(activeRecipes.map((r) => r.id))
    const used = new Set<string>()
    for (const l of lines) {
      if (!activeRecipeIds.has(l.recipe_id)) continue
      if (!l.ingredient_id) continue
      used.add(l.ingredient_id)
    }

    const byId = new Map<string, Ingredient>()
    for (const ing of ingredients) byId.set(ing.id, ing)

    let c = 0
    for (const id of used) {
      const v = Number(byId.get(id)?.net_unit_cost)
      if (!Number.isFinite(v) || v <= 0) c += 1
    }
    return c
  }, [activeRecipes, lines, ingredients])

  const avgCostPerPortion = useMemo(() => {
    if (activeRecipes.length === 0) return 0
    const cps = activeRecipes.map((r) => {
      const total = recipeTotalCost.get(r.id) ?? 0
      const portions = Math.max(1, toNum(r.portions, 1))
      return total / portions
    })
    return cps.reduce((a, b) => a + b, 0) / cps.length
  }, [activeRecipes, recipeTotalCost])

  const mostExpensiveRecipe = useMemo(() => {
    let best: { id: string; name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotalCost.get(r.id) ?? 0
      if (!best || total > best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotalCost])

  const cheapestRecipe = useMemo(() => {
    let best: { id: string; name: string; total: number } | null = null
    for (const r of activeRecipes) {
      const total = recipeTotalCost.get(r.id) ?? 0
      if (!best || total < best.total) best = { id: r.id, name: r.name, total }
    }
    return best
  }, [activeRecipes, recipeTotalCost])

  const totalActiveCost = useMemo(() => {
    return activeRecipes.reduce((sum, r) => sum + (recipeTotalCost.get(r.id) ?? 0), 0)
  }, [activeRecipes, recipeTotalCost])

  const top5 = useMemo(() => {
    return [...activeRecipes]
      .map((r) => ({
        id: r.id,
        name: r.name,
        total: recipeTotalCost.get(r.id) ?? 0,
        cpp: (recipeTotalCost.get(r.id) ?? 0) / Math.max(1, toNum(r.portions, 1)),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [activeRecipes, recipeTotalCost])

  const subRecipesMissingYield = useMemo(() => {
    return recipes
      .filter((r) => r.is_subrecipe && !r.is_archived)
      .filter((r) => toNum(r.yield_qty, 0) <= 0 || !safeUnit(r.yield_unit ?? ''))
  }, [recipes])

  const hasOutliers = useMemo(() => {
    const big = top5.find((x) => x.total > 10000)
    return !!big
  }, [top5])

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      className="gc-dashboard"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      style={{ padding: 'var(--gc-16)' }}
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="gc-card gc-page-header" style={{ 
          background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)',
          color: 'white',
          border: 'none',
          padding: 'var(--gc-16)'
        }}>
          <div className="gc-card-body" style={{ padding: 0 }}>
            <div className="gc-label" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>DASHBOARD</div>
            <div className="gc-page-title" style={{ color: 'white', fontSize: '20px', fontWeight: 800 }}>Kitchen Overview</div>
            <div className="gc-hint" style={{ color: 'rgba(255,255,255,0.9)', marginTop: '4px', fontSize: '12px' }}>
              Your kitchen snapshot: recipes, ingredients, and cost diagnostics.
            </div>
          </div>
        </div>
      </motion.div>

      {/* Continue Cooking Card */}
      <motion.div variants={itemVariants}>
        <div className="gc-card is-interactive" style={{ 
          marginTop: '12px',
          padding: '12px'
        }}>
          <div className="gc-card-body" style={{ padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>Continue Cooking</div>
              <div className="gc-hint" style={{ marginTop: '2px', fontSize: '12px' }}>
                {lastId ? (
                  <>
                    Jump back to <span style={{ fontWeight: 700, color: 'var(--gc-brand-olive)' }}>{lastName || 'your last recipe'}</span>.
                  </>
                ) : (
                  <>Open Recipes and start cooking.</>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => {
                    if (lastId) nav(`/cook?id=${encodeURIComponent(lastId)}`)
                    else nav('/recipes')
                  }}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Continue Cooking 🍳
                </Button>
              </motion.div>
              {lastId ? (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button variant="ghost" size="small" onClick={() => nav(`/recipe?id=${encodeURIComponent(lastId)}`)} style={{ fontSize: '12px', padding: '6px 12px' }}>
                    Open Editor
                  </Button>
                </motion.div>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Skeleton Loading */}
      {loading && (
        <motion.div 
          variants={containerVariants}
          style={{ marginTop: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="gc-card"
                style={{ padding: '12px' }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="gc-card-body" style={{ padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '8px' }} />
                    <div className="skeleton" style={{ width: 80, height: 12 }} />
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <div className="skeleton" style={{ width: 60, height: 20 }} />
                    <div style={{ marginTop: '4px' }}>
                      <div className="skeleton" style={{ width: 50, height: 10 }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {err && (
        <motion.div 
          variants={itemVariants}
          style={{ marginTop: '12px' }}
          animate={{ x: [0, -5, 5, -5, 5, 0] }}
          transition={{ duration: 0.4 }}
        >
          <ErrorState
            title="We couldn't load your dashboard"
            message="Please check your connection and try again."
            details={err}
            onRetry={load}
            variant="banner"
          />
        </motion.div>
      )}

      {/* Main Content */}
      {!loading && !err && (
        <>
          {/* Empty States */}
          <AnimatePresence>
            {activeRecipes.length === 0 && activeIngredientsCount === 0 && (
              <motion.div 
                key="empty1"
                variants={itemVariants}
                style={{ marginTop: '16px' }}
              >
                <EmptyState
                  title="Your kitchen is ready"
                  description="Add a few ingredients, then create your first recipe."
                  primaryAction={{
                    label: 'Add Ingredient',
                    onClick: () => nav('/ingredients')
                  }}
                  secondaryAction={{
                    label: 'Create Recipe',
                    onClick: () => nav('/recipes')
                  }}
                  icon="✨"
                />
              </motion.div>
            )}

            {activeRecipes.length === 0 && activeIngredientsCount > 0 && (
              <motion.div 
                key="empty2"
                variants={itemVariants}
                style={{ marginTop: '16px' }}
              >
                <EmptyState
                  title="Create your first recipe"
                  description="You already have ingredients. Now create a recipe."
                  primaryAction={{
                    label: 'Create Recipe',
                    onClick: () => nav('/recipes')
                  }}
                  secondaryAction={{
                    label: 'Add more ingredients',
                    onClick: () => nav('/ingredients')
                  }}
                  icon="🍳"
                />
              </motion.div>
            )}

            {activeIngredientsCount === 0 && activeRecipes.length > 0 && (
              <motion.div 
                key="empty3"
                variants={itemVariants}
                style={{ marginTop: '16px' }}
              >
                <EmptyState
                  title="Add ingredients to unlock costing"
                  description="Recipes are ready, but ingredient costs are missing."
                  primaryAction={{
                    label: 'Add Ingredient',
                    onClick: () => nav('/ingredients')
                  }}
                  secondaryAction={{
                    label: 'View recipes',
                    onClick: () => nav('/recipes')
                  }}
                  icon="🧂"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Warning Card */}
          {hasOutliers && (
            <motion.div 
              variants={itemVariants}
              className="gc-card" 
              style={{ marginTop: '12px', padding: '12px' }}
              animate={{ 
                boxShadow: ['0 0 0 0 rgba(245, 158, 11, 0.3)', '0 0 0 3px rgba(245, 158, 11, 0)', '0 0 0 0 rgba(245, 158, 11, 0)']
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="gc-card-body" style={{ padding: 0 }}>
                <div className="gc-label" style={{ color: 'var(--gc-warn)', fontSize: '10px' }}>⚠️ WARNING</div>
                <div className="gc-hint" style={{ marginTop: '4px', color: 'var(--gc-warn)', fontSize: '12px' }}>
                  Some recipe costs are extremely high. Check pack_unit and net_unit_cost.
                </div>
              </div>
            </motion.div>
          )}

          {/* KPI Grid */}
          <motion.div 
            variants={containerVariants}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '16px' }}
          >
            {[
              { icon: '🍳', label: 'RECIPES', value: activeRecipes.length, sub: 'Active' },
              { icon: '🧩', label: 'SUB-RECIPES', value: subRecipeCount, sub: 'Active' },
              { icon: '🧂', label: 'INGREDIENTS', value: activeIngredientsCount, sub: 'Active' },
              { icon: '💵', label: 'AVG COST', value: money(avgCostPerPortion), sub: 'Per portion' }
            ].map((item, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -2 }}
                className="gc-card"
                style={{ padding: '12px' }}
              >
                <div className="gc-card-body" style={{ padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{item.icon}</span>
                    <div className="gc-label" style={{ fontSize: '9px' }}>{item.label}</div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gc-brand-olive)' }}>
                    {item.value}
                  </div>
                  <div className="gc-hint" style={{ marginTop: '2px', fontSize: '10px' }}>{item.sub}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Second Row */}
          <motion.div 
            variants={containerVariants}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}
          >
            <motion.div
              variants={itemVariants}
              whileHover={{ y: -2 }}
              className="gc-card"
              style={{ gridColumn: 'span 2', padding: '12px', background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)', color: 'white' }}
            >
              <div className="gc-card-body" style={{ padding: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>∑</span>
                  <div className="gc-label" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '9px' }}>TOTAL ACTIVE COST</div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>
                  {money(totalActiveCost)}
                </div>
                <div className="gc-hint" style={{ marginTop: '2px', color: 'rgba(255,255,255,0.9)', fontSize: '10px' }}>Sum of all active recipes</div>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              whileHover={{ y: -2 }}
              className="gc-card"
              style={{ padding: '12px' }}
            >
              <div className="gc-card-body" style={{ padding: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🟢</span>
                  <div className="gc-label" style={{ fontSize: '9px' }}>CHEAPEST</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gc-success)' }}>
                  {cheapestRecipe?.name?.length > 15 ? cheapestRecipe.name.substring(0, 12) + '...' : cheapestRecipe?.name ?? '—'}
                </div>
                <div className="gc-hint" style={{ marginTop: '2px', fontSize: '10px' }}>{money(cheapestRecipe?.total ?? 0)}</div>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              whileHover={{ y: -2 }}
              className="gc-card"
              style={{ padding: '12px' }}
            >
              <div className="gc-card-body" style={{ padding: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🔴</span>
                  <div className="gc-label" style={{ fontSize: '9px' }}>MOST EXPENSIVE</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gc-danger)' }}>
                  {mostExpensiveRecipe?.name?.length > 15 ? mostExpensiveRecipe.name.substring(0, 12) + '...' : mostExpensiveRecipe?.name ?? '—'}
                </div>
                <div className="gc-hint" style={{ marginTop: '2px', fontSize: '10px' }}>{money(mostExpensiveRecipe?.total ?? 0)}</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Top 5 Table */}
          <motion.div variants={itemVariants} className="gc-card" style={{ marginTop: '16px', padding: '12px' }}>
            <div className="gc-card-body" style={{ padding: 0 }}>
              <div className="gc-label" style={{ fontSize: '10px', marginBottom: '8px' }}>🏆 TOP 5 RECIPES</div>
              <div className="gc-data-table-wrap" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table className="gc-data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: '10px', padding: '6px' }}>Recipe</th>
                      <th className="gc-th-right" style={{ fontSize: '10px', padding: '6px' }}>Total</th>
                      <th className="gc-th-right" style={{ fontSize: '10px', padding: '6px' }}>Cost/Portion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((x, index) => (
                      <motion.tr 
                        key={x.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{ backgroundColor: 'var(--gc-brand-olive-100)' }}
                      >
                        <td style={{ fontSize: '11px', fontWeight: 500, padding: '6px' }}>
                          {index === 0 && '🥇 '}
                          {index === 1 && '🥈 '}
                          {index === 2 && '🥉 '}
                          {x.name.length > 20 ? x.name.substring(0, 17) + '...' : x.name}
                        </td>
                        <td className="gc-td-right" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gc-brand-olive)', padding: '6px' }}>{money(x.total)}</td>
                        <td className="gc-td-right" style={{ fontSize: '11px', padding: '6px' }}>{money(x.cpp)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Diagnostics */}
          <motion.div variants={itemVariants} className="gc-card" style={{ marginTop: '12px', padding: '12px' }}>
            <div className="gc-card-body" style={{ padding: 0 }}>
              <div className="gc-label" style={{ fontSize: '10px', marginBottom: '8px' }}>🔍 DIAGNOSTICS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { label: 'Unit mismatches', value: diag.unitMismatchCount, color: 'var(--gc-warn)' },
                  { label: 'Missing yield', value: subRecipesMissingYield.length, color: 'var(--gc-danger)' },
                  { label: 'Missing cost', value: ingredientsUsedMissingCost, color: 'var(--gc-danger)' }
                ].map((item, index) => (
                  <motion.div 
                    key={index}
                    className="gc-card-soft"
                    whileHover={{ y: -2 }}
                    style={{ padding: '8px' }}
                  >
                    <div className="gc-card-body" style={{ padding: 0 }}>
                      <div className="gc-hint" style={{ fontWeight: 600, fontSize: '9px', marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: item.color }}>
                        {item.value}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
