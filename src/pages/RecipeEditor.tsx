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

// =================== استيراد المكونات المنفصلة ===================
import { RecipeHeader } from '../components/recipe/RecipeHeader'
import { RecipeMeta } from '../components/recipe/RecipeMeta'
import { RecipePricing } from '../components/recipe/RecipePricing'
import { RecipeNutrition } from '../components/recipe/RecipeNutrition'
import { RecipeLines } from '../components/recipe/RecipeLines'
import { RecipeMethod } from '../components/recipe/RecipeMethod'
import { RecipePrint } from '../components/recipe/RecipePrint'
import { RecipeCostHistory } from '../components/recipe/RecipeCostHistory'
import { RecipePhotoUpload } from '../components/recipe/RecipePhotoUpload'

// =================== استيراد الأنواع ===================
import type { Recipe, Ingredient, Line } from '../types/recipe.types'

// =================== دوال مساعدة ===================
import { toNum, clamp, safeUnit, fmtMoney, fmtQty, convertQtyToPackUnit, uid } from '../utils/recipeUtils'

// =================== ثوابت ===================
const PHOTO_BUCKET = 'recipe-photos'
const DRAFT_KEY_PREFIX = 'gc_recipe_lines_draft__'

// =================== دوال مساعدة للـ Draft ===================
const getDraftKey = (rid: string) => `${DRAFT_KEY_PREFIX}${rid}`

function readDraftLines(rid: string): Line[] {
  try {
    const raw = localStorage.getItem(getDraftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeDraftLines(rid: string, lines: Line[]) {
  try {
    localStorage.setItem(getDraftKey(rid), JSON.stringify(lines))
  } catch {
    // ignore
  }
}

function clearDraftLines(rid: string) {
  try {
    localStorage.removeItem(getDraftKey(rid))
  } catch {
    // ignore
  }
}

function mergeDbAndDraft(db: Line[], draft: Line[]): Line[] {
  const dbIds = new Set(db.map(l => l.id))
  const extraDrafts = draft.filter(l => l && l.id && !dbIds.has(l.id))
  return [...db, ...extraDrafts].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

// =================== المكون الرئيسي (مبسط) ===================
export default function RecipeEditor() {
  const { isKitchen, isMgmt } = useMode()
  const showCost = isMgmt
  const { isOwner } = useKitchen()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recipeId = searchParams.get('id')
  const autosave = useAutosave()

  // ===== States =====
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)

  // Recipe data
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])

  // Meta fields
  const [code, setCode] = useState('')
  const [codeCategory, setCodeCategory] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [portions, setPortions] = useState('1')
  const [description, setDescription] = useState('')
  const [isSubRecipe, setIsSubRecipe] = useState(false)
  const [yieldQty, setYieldQty] = useState('')
  const [yieldUnit, setYieldUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs'>('g')

  // Steps
  const [steps, setSteps] = useState<string[]>([])
  const [stepPhotos, setStepPhotos] = useState<string[]>([])
  const [methodLegacy, setMethodLegacy] = useState('')

  // Nutrition
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  // Pricing
  const [currency, setCurrency] = useState('USD')
  const [sellingPrice, setSellingPrice] = useState('')
  const [targetFC, setTargetFC] = useState('30')

  // UI
  const [density, setDensity] = useState<'comfort' | 'compact'>(() => {
    try {
      const v = localStorage.getItem('gc_density')
      return v === 'compact' || v === 'comfort' ? v : 'comfort'
    } catch {
      return 'comfort'
    }
  })

  // Refs
  const deletedLineIdsRef = useRef<string[]>([])
  const linesRef = useRef<Line[]>([])
  const recipeRef = useRef<Recipe | null>(null)

  // Update refs when state changes
  useEffect(() => { recipeRef.current = recipe }, [recipe])
  useEffect(() => { linesRef.current = lines }, [lines])

  // ===== Derived Data =====
  const currencyCode = (currency || 'USD').toUpperCase()
  
  const ingById = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients])
  const recipeById = useMemo(() => new Map(allRecipes.map(r => [r.id, r])), [allRecipes])

  // ===== Line Computations =====
  const lineComputed = useMemo(() => {
    const map = new Map()
    
    for (const line of lines) {
      if (line.line_type === 'group') continue
      
      const net = Math.max(0, toNum(line.qty, 0))
      const yieldPct = clamp(toNum(line.yield_percent, 100), 0.0001, 100)
      const gross = line.gross_qty_override != null && line.gross_qty_override > 0 
        ? Math.max(0, line.gross_qty_override) 
        : net / (yieldPct / 100)

      let unitCost = 0
      let lineCost = 0
      const warnings: string[] = []

      if (line.line_type === 'ingredient' && line.ingredient_id) {
        const ing = ingById.get(line.ingredient_id)
        unitCost = toNum(ing?.net_unit_cost, 0)
        if (!ing) warnings.push('Missing ingredient')
        if (unitCost <= 0) warnings.push('Ingredient without price')
        
        const packUnit = ing?.pack_unit || line.unit
        const qtyInPack = convertQtyToPackUnit(gross, line.unit, packUnit)
        lineCost = qtyInPack * unitCost
      }

      map.set(line.id, { net, gross, yieldPct, unitCost, lineCost, warnings })
    }

    return map
  }, [lines, ingById])

  // ===== Totals =====
  const totals = useMemo(() => {
    let totalCost = 0
    const warnings: string[] = []

    for (const line of lines) {
      if (line.line_type === 'group') continue
      const comp = lineComputed.get(line.id)
      if (comp) {
        totalCost += comp.lineCost
        warnings.push(...comp.warnings)
      }
    }

    const portionCount = Math.max(1, toNum(portions, 1))
    const cpp = totalCost / portionCount
    const sell = Math.max(0, toNum(sellingPrice, 0))
    const fcPct = sell > 0 ? (cpp / sell) * 100 : null
    const margin = sell - cpp
    const marginPct = sell > 0 ? (margin / sell) * 100 : null

    return {
      totalCost,
      cpp,
      fcPct,
      margin,
      marginPct,
      warnings: Array.from(new Set(warnings)).slice(0, 4)
    }
  }, [lines, lineComputed, portions, sellingPrice])

  // ===== Cost History =====
  const [costPoints, setCostPoints] = useState(() => recipeId ? listCostPoints(recipeId) : [])
  
  useEffect(() => {
    if (recipeId) setCostPoints(listCostPoints(recipeId))
  }, [recipeId])

  // ===== Show Toast =====
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }, [])

  // ===== Load Data =====
  useEffect(() => {
    if (!recipeId) {
      setError('Missing recipe ID')
      setLoading(false)
      return
    }

    let isMounted = true

    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Load recipe
        const { data: recipeData, error: recipeError } = await supabase
          .from('recipes')
          .select('*')
          .eq('id', recipeId)
          .single()

        if (recipeError) throw recipeError
        if (!isMounted) return

        setRecipe(recipeData)
        setCode((recipeData.code || '').toUpperCase())
        setCodeCategory((recipeData.code_category || '').toUpperCase())
        setName(recipeData.name || '')
        setCategory(recipeData.category || '')
        setPortions(String(recipeData.portions ?? 1))
        setDescription(recipeData.description || '')
        setIsSubRecipe(!!recipeData.is_subrecipe)
        setYieldQty(recipeData.yield_qty != null ? String(recipeData.yield_qty) : '')
        setYieldUnit((safeUnit(recipeData.yield_unit || 'g') as any) || 'g')

        setSteps(recipeData.method_steps || [])
        setStepPhotos(recipeData.method_step_photos || [])
        setMethodLegacy(recipeData.method || '')

        setCalories(recipeData.calories != null ? String(recipeData.calories) : '')
        setProtein(recipeData.protein_g != null ? String(recipeData.protein_g) : '')
        setCarbs(recipeData.carbs_g != null ? String(recipeData.carbs_g) : '')
        setFat(recipeData.fat_g != null ? String(recipeData.fat_g) : '')

        setCurrency((recipeData.currency || 'USD').toUpperCase())
        setSellingPrice(recipeData.selling_price != null ? String(recipeData.selling_price) : '')
        setTargetFC(recipeData.target_food_cost_pct != null ? String(recipeData.target_food_cost_pct) : '30')

        // Load lines
        const { data: linesData, error: linesError } = await supabase
          .from('recipe_lines')
          .select('*')
          .eq('recipe_id', recipeId)
          .order('position')

        if (linesError) throw linesError
        if (!isMounted) return

        const draft = readDraftLines(recipeId)
        setLines(mergeDbAndDraft(linesData || [], draft))

        // Load ingredients
        const ingredientsData = await getIngredientsCached()
        if (!isMounted) return
        setIngredients(ingredientsData || [])

        // Load recipes for subrecipe picker
        const { data: recipesData, error: recipesError } = await supabase
          .from('recipes')
          .select('*')
          .order('name')

        if (recipesError) throw recipesError
        if (!isMounted) return
        setAllRecipes(recipesData || [])

      } catch (err: any) {
        if (!isMounted) return
        setError(err?.message || 'Failed to load recipe')
        autosave.setError(err?.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()

    return () => { isMounted = false }
  }, [recipeId, autosave])

  // ===== Save Lines =====
  const saveLines = useCallback(async (linesToSave?: Line[]) => {
    if (!recipeId) return false

    const kitchenId = recipeRef.current?.kitchen_id
    if (!kitchenId) {
      setError('Kitchen ID not resolved')
      return false
    }

    try {
      autosave.setSaving()
      const currentLines = linesToSave || linesRef.current

      // Delete removed lines
      const deletedIds = deletedLineIdsRef.current.filter(id => !id.startsWith('tmp_'))
      if (deletedIds.length) {
        await supabase.from('recipe_lines').delete().in('id', deletedIds)
        deletedLineIdsRef.current = []
      }

      // Update existing lines
      const persistedLines = currentLines.filter(l => !l.id.startsWith('tmp_'))
      if (persistedLines.length) {
        await supabase.from('recipe_lines').upsert(
          persistedLines.map(l => ({
            id: l.id,
            kitchen_id: kitchenId,
            recipe_id: recipeId,
            ingredient_id: l.ingredient_id,
            sub_recipe_id: l.sub_recipe_id,
            position: l.position,
            qty: toNum(l.qty, 0),
            unit: safeUnit(l.unit),
            yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
            notes: l.notes,
            gross_qty_override: l.gross_qty_override,
            line_type: l.line_type,
            group_title: l.group_title,
          }))
        )
      }

      // Insert new lines
      const draftLines = currentLines.filter(l => l.id.startsWith('tmp_'))
      if (draftLines.length) {
        await supabase.from('recipe_lines').insert(
          draftLines.map(l => ({
            kitchen_id: kitchenId,
            recipe_id: recipeId,
            ingredient_id: l.ingredient_id,
            sub_recipe_id: l.sub_recipe_id,
            position: l.position,
            qty: toNum(l.qty, 0),
            unit: safeUnit(l.unit),
            yield_percent: clamp(toNum(l.yield_percent, 100), 0.0001, 100),
            notes: l.notes,
            gross_qty_override: l.gross_qty_override,
            line_type: l.line_type,
            group_title: l.group_title,
          }))
        )
      }

      // Reload if needed
      if (draftLines.length || deletedIds.length) {
        const { data: freshLines } = await supabase
          .from('recipe_lines')
          .select('*')
          .eq('recipe_id', recipeId)
          .order('position')

        if (freshLines) {
          setLines(freshLines as Line[])
          clearDraftLines(recipeId)
        }
      } else {
        clearDraftLines(recipeId)
      }

      autosave.setSaved()
      return true

    } catch (err: any) {
      writeDraftLines(recipeId, currentLines)
      autosave.setError(err?.message)
      setError(err?.message)
      return false
    }
  }, [recipeId, autosave])

  // ===== Save Meta =====
  const saveMeta = useCallback(async () => {
    if (!recipeId) return

    try {
      const updates = {
        code: code.toUpperCase() || null,
        code_category: codeCategory.toUpperCase() || null,
        name: name.trim() || 'Untitled',
        category: category.trim() || null,
        portions: Math.max(1, Math.floor(toNum(portions, 1))),
        description: description || '',
        is_subrecipe: isSubRecipe,
        yield_qty: yieldQty ? toNum(yieldQty) : null,
        yield_unit: yieldUnit,
        method_steps: steps,
        method_step_photos: stepPhotos,
        method: methodLegacy || '',
        calories: calories ? toNum(calories) : null,
        protein_g: protein ? toNum(protein) : null,
        carbs_g: carbs ? toNum(carbs) : null,
        fat_g: fat ? toNum(fat) : null,
        currency: currency.toUpperCase(),
        selling_price: sellingPrice ? toNum(sellingPrice) : null,
        target_food_cost_pct: targetFC ? toNum(targetFC) : null,
      }

      await supabase.from('recipes').update(updates).eq('id', recipeId)
      showToast('Saved')

    } catch (err: any) {
      setError(err?.message)
    }
  }, [recipeId, code, codeCategory, name, category, portions, description, isSubRecipe,
      yieldQty, yieldUnit, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat,
      currency, sellingPrice, targetFC, showToast])

  // ===== Auto-save Meta =====
  const metaInitialized = useRef(false)
  
  useEffect(() => {
    if (!recipe) return
    if (!metaInitialized.current) {
      metaInitialized.current = true
      return
    }
    const timer = setTimeout(saveMeta, 650)
    return () => clearTimeout(timer)
  }, [
    code, codeCategory, name, category, portions, description, isSubRecipe,
    yieldQty, yieldUnit, steps, stepPhotos, methodLegacy, calories, protein, carbs, fat,
    currency, sellingPrice, targetFC
  ])

  // ===== Export Excel =====
  const exportToExcel = useCallback(async () => {
    try {
      showToast('Preparing Excel export...')

      const excelLines = lines
        .filter(l => l.line_type !== 'group')
        .map(l => {
          const comp = lineComputed.get(l.id)
          const ing = l.ingredient_id ? ingById.get(l.ingredient_id) : null
          const sub = l.sub_recipe_id ? recipeById.get(l.sub_recipe_id) : null

          return {
            type: l.line_type === 'subrecipe' ? 'subrecipe' : 'ingredient',
            code: l.line_type === 'ingredient' ? (ing?.code || '') : (sub?.code || ''),
            name: l.line_type === 'ingredient' ? (ing?.name || 'Ingredient') : (sub?.name || 'Subrecipe'),
            net_qty: comp?.net ?? 0,
            unit: l.unit || 'g',
            yield_percent: comp?.yieldPct ?? 100,
            gross_qty: comp?.gross ?? 0,
            unit_cost: comp?.unitCost ?? 0,
            line_cost: comp?.lineCost ?? 0,
            notes: l.notes || '',
            warnings: comp?.warnings || [],
          }
        })

      await exportRecipeExcelUltra({
        meta: {
          id: recipeId,
          code,
          kitchen_id: recipe?.kitchen_id,
          name,
          category,
          portions: Math.max(1, Math.floor(toNum(portions, 1))),
          yield_qty: yieldQty ? toNum(yieldQty) : 3500,
          yield_unit: yieldUnit || 'g',
          currency,
          selling_price: sellingPrice ? toNum(sellingPrice) : null,
          target_food_cost_pct: targetFC ? toNum(targetFC) : 30,
          photo_url: recipe?.photo_url,
          step_photos,
          description,
          steps,
          calories: calories ? toNum(calories) : null,
          protein_g: protein ? toNum(protein) : null,
          carbs_g: carbs ? toNum(carbs) : null,
          fat_g: fat ? toNum(fat) : null,
        },
        totals,
        lines: excelLines,
      })

      showToast('Excel exported successfully!')

    } catch (error) {
      console.error('Export failed:', error)
      showToast('Failed to export Excel file')
    }
  }, [recipeId, recipe, code, name, category, portions, yieldQty, yieldUnit,
      currency, sellingPrice, targetFC, stepPhotos, description, steps,
      calories, protein, carbs, fat, lines, lineComputed, ingById,
      recipeById, totals, showToast])

  // ===== Add Snapshot =====
  const addSnapshot = useCallback(() => {
    if (!recipeId) return
    addCostPoint(recipeId, {
      createdAt: Date.now(),
      totalCost: totals.totalCost,
      cpp: totals.cpp,
      portions: Math.max(1, Math.floor(toNum(portions, 1))),
      currency: currencyCode,
    })
    setCostPoints(listCostPoints(recipeId))
    showToast('Cost snapshot added')
  }, [recipeId, totals, portions, currencyCode, showToast])

  // ===== Loading / Error States =====
  if (loading) {
    return (
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label">RECIPE EDITOR</div>
        <div className="gc-hint" style={{ marginTop: 10 }}>Loading…</div>
      </div>
    )
  }

  if (!recipeId) {
    return (
      <div className="gc-card" style={{ padding: 16 }}>
        <div className="gc-label">ERROR</div>
        <div className="gc-hint" style={{ marginTop: 10 }}>Missing recipe ID</div>
      </div>
    )
  }

  // ===== Render =====
  return (
    <>
      <style>{`
        .gc-recipe-pro{ position: relative; }
        .gc-recipe-pro .gc-card-head{
          align-items: center;
          padding: 14px 16px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,.94), rgba(247,248,244,.94));
          border: 1px solid rgba(118,128,108,.12);
          box-shadow: 0 10px 24px rgba(38,46,31,.05), inset 0 1px 0 rgba(255,255,255,.82);
        }
        .gc-recipe-pro .gc-card-soft,
        .gc-recipe-pro .gc-card{
          border-radius: 22px;
          border: 1px solid rgba(118,128,108,.11);
          background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,248,245,.95));
          box-shadow: 0 8px 24px rgba(38,46,31,.04), inset 0 1px 0 rgba(255,255,255,.8);
        }
        .gc-recipe-pro .gc-btn-soft{
          border-radius: 999px;
          border: 1px solid rgba(118,128,108,.12);
          background: rgba(255,255,255,.82);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
        }
        .gc-recipe-pro .gc-btn-soft.is-active{
          box-shadow: inset 0 0 0 1px rgba(116,141,63,.28), 0 4px 14px rgba(116,141,63,.10);
          background: rgba(116,141,63,.10);
        }
        .gc-recipe-pro .gc-kpi-card{
          border-radius: 20px;
          border: 1px solid rgba(118,128,108,.12);
          background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(244,246,241,.94));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.86);
          padding: 14px 14px 12px;
        }
        .gc-recipe-pro .gc-kpi-label{
          font-size: .77rem;
          line-height: 1;
          letter-spacing: .1em;
          font-weight: 900;
          color: #72806b;
          margin-bottom: 12px;
        }
        .gc-recipe-pro .gc-kpi-value{
          font-size: 1.75rem;
          line-height: 1;
          letter-spacing: -0.03em;
          font-weight: 950;
          color: #15200e;
        }
        .gc-recipe-pro .gc-grid-4{
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 980px){
          .gc-recipe-pro .gc-grid-4{ grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 760px){
          .gc-recipe-pro .gc-grid-4{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="gc-card gc-screen-only gc-recipe-pro">
        <RecipeHeader
          name={name}
          isSubRecipe={isSubRecipe}
          autosave={autosave}
          density={density}
          onDensityChange={setDensity}
          onNavigateBack={() => navigate('/recipes')}
        >
          <button className="gc-btn-soft" type="button" onClick={exportToExcel}>
            Export Excel
          </button>
        </RecipeHeader>

        <div className="gc-card-body">
          {error && (
            <div className="gc-card-soft" style={{ padding: 12, borderRadius: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 900, color: 'var(--gc-danger)' }}>{error}</div>
            </div>
          )}

          {/* Print Section */}
          <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
            <RecipePrint
              recipeId={recipeId}
              onPrint={() => window.open(`#/print?id=${recipeId}&autoprint=1`, '_blank')}
              onExport={exportToExcel}
            />
          </div>

          {/* Cook Mode Section */}
          <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="gc-label">COOK MODE</div>
                <div className="gc-hint" style={{ marginTop: 6 }}>Zero distraction cooking workflow</div>
              </div>
              <button 
                className="gc-btn gc-btn-primary gc-btn-hero" 
                type="button" 
                onClick={() => navigate(`/cook?id=${recipeId}`)}
              >
                Open Cook Mode
              </button>
            </div>
          </div>

          {/* KPI Section */}
          {showCost && (
            <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
              <div style={{ padding: 14 }}>
                <div className="gc-highlight-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div className="gc-label">KPI</div>
                    <div className="gc-hint">Live recipe performance overview</div>
                  </div>
                  <div className="gc-hint" style={{ fontWeight: 800 }}>Currency: {currencyCode}</div>
                </div>

                <div className="gc-grid-4">
                  <div className="gc-kpi-card">
                    <div className="gc-kpi-label">TOTAL COST</div>
                    <div className="gc-kpi-value">{fmtMoney(totals.totalCost, currencyCode)}</div>
                  </div>
                  <div className="gc-kpi-card">
                    <div className="gc-kpi-label">COST / PORTION</div>
                    <div className="gc-kpi-value">{fmtMoney(totals.cpp, currencyCode)}</div>
                  </div>
                  <div className="gc-kpi-card">
                    <div className="gc-kpi-label">FC%</div>
                    <div className="gc-kpi-value">{totals.fcPct != null ? `${totals.fcPct.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div className="gc-kpi-card">
                    <div className="gc-kpi-label">MARGIN</div>
                    <div className="gc-kpi-value">{fmtMoney(totals.margin, currencyCode)}</div>
                  </div>
                </div>

                {totals.warnings?.length > 0 && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,191,64,.09)', border: '1px solid rgba(236,164,30,.28)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 14 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: '.78rem', fontWeight: 900, color: '#9a5a00', marginBottom: 6 }}>PRICING WARNING</div>
                        <div style={{ fontWeight: 900, color: 'var(--gc-warn)' }}>{totals.warnings[0]}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meta Section */}
          <div className="gc-section gc-card" style={{ marginBottom: 14 }}>
            <RecipeMeta
              code={code}
              codeCategory={codeCategory}
              name={name}
              category={category}
              portions={portions}
              description={description}
              isSubRecipe={isSubRecipe}
              yieldQty={yieldQty}
              yieldUnit={yieldUnit}
              canEditCodes={isOwner}
              onCodeChange={setCode}
              onCodeCategoryChange={setCodeCategory}
              onNameChange={setName}
              onCategoryChange={setCategory}
              onPortionsChange={setPortions}
              onDescriptionChange={setDescription}
              onIsSubRecipeChange={setIsSubRecipe}
              onYieldQtyChange={setYieldQty}
              onYieldUnitChange={setYieldUnit}
            />
          </div>

          {/* Photo Section */}
          <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
            <RecipePhotoUpload
              photoUrl={recipe?.photo_url}
              onUpload={async (file) => {
                // Upload logic here
                if (!recipeId) return
                // ... photo upload implementation
              }}
            />
          </div>

          {/* Pricing Section */}
          {showCost && (
            <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
              <RecipePricing
                currency={currency}
                sellingPrice={sellingPrice}
                targetFC={targetFC}
                onCurrencyChange={setCurrency}
                onSellingPriceChange={setSellingPrice}
                onTargetFCChange={setTargetFC}
              />
            </div>
          )}

          {/* Nutrition Section */}
          <div className="gc-section gc-card-soft" style={{ marginBottom: 14 }}>
            <RecipeNutrition
              calories={calories}
              protein={protein}
              carbs={carbs}
              fat={fat}
              onCaloriesChange={setCalories}
              onProteinChange={setProtein}
              onCarbsChange={setCarbs}
              onFatChange={setFat}
            />
          </div>

          {/* Lines Section */}
          <div className="gc-section gc-card" style={{ marginBottom: 14 }}>
            <RecipeLines
              lines={lines}
              ingredients={ingredients}
              subRecipes={allRecipes.filter(r => r.is_subrecipe)}
              ingById={ingById}
              recipeById={recipeById}
              lineComputed={lineComputed}
              showCost={showCost}
              currency={currencyCode}
              onLinesChange={setLines}
              onSave={saveLines}
            />
          </div>

          {/* Method Section */}
          <div className="gc-section gc-card" style={{ marginBottom: 14 }}>
            <RecipeMethod
              steps={steps}
              stepPhotos={stepPhotos}
              methodLegacy={methodLegacy}
              onStepsChange={setSteps}
              onStepPhotosChange={setStepPhotos}
              onMethodLegacyChange={setMethodLegacy}
            />
          </div>

          {/* Cost History Section */}
          {showCost && (
            <div className="gc-section gc-card" style={{ marginBottom: 14 }}>
              <RecipeCostHistory
                points={costPoints}
                currency={currencyCode}
                onAddSnapshot={addSnapshot}
                onClearSnapshots={() => {
                  if (recipeId && confirm('Clear all cost snapshots?')) {
                    clearCostPoints(recipeId)
                    setCostPoints([])
                    showToast('Snapshots cleared')
                  }
                }}
                onRemoveSnapshot={(pointId) => {
                  if (recipeId) {
                    deleteCostPoint(recipeId, pointId)
                    setCostPoints(listCostPoints(recipeId))
                    showToast('Snapshot removed')
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {toastOpen && <Toast message={toastMsg} onClose={() => setToastOpen(false)} />}
    </>
  )
}
