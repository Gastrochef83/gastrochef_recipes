import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { useDatabase } from '../contexts/DatabaseContext'
import { useTheme } from '../contexts/ThemeContext'
import RecipeHeader from '../components/recipe/RecipeHeader'
import IngredientsTable from '../components/recipe/IngredientsTable'
import TabNavigation from '../components/recipe/TabNavigation'
import LoadingSpinner from '../components/LoadingSpinner'
import { Recipe, RecipeIngredient } from '../types'

const CostPanel = lazy(() => import('../components/recipe/CostPanel'))
const NutritionPanel = lazy(() => import('../components/recipe/NutritionPanel'))
const NotesPanel = lazy(() => import('../components/recipe/NotesPanel'))
const PrintView = lazy(() => import('../components/recipe/PrintView'))
const CookMode = lazy(() => import('../components/recipe/CookMode'))

type Tab = 'cost' | 'nutrition' | 'notes' | 'print' | 'cook'

export default function RecipeEditor() {
  const { id } = useParams<{ id: string }>()
  const { getRecipe, getIngredients, updateRecipe, loading: dbLoading } = useDatabase()
  const { theme } = useTheme()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [portions, setPortions] = useState(4)

  const totalCost = useMemo(() => {
    if (!ingredients.length) return 0
    return ingredients.reduce((sum, ing) => sum + (Number(ing.cost_per_unit) || 0) * (Number(ing.quantity) || 0) * ((Number(ing.yield_percent) || 100) / 100), 0)
  }, [ingredients])

  const costPerPortion = useMemo(() => {
    return portions > 0 ? totalCost / portions : 0
  }, [totalCost, portions])

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      if (!id) return
      try {
        const [recipeData, ingredientsData] = await Promise.all([getRecipe(id), getIngredients(id)])
        if (!mounted) return
        setRecipe(recipeData)
        setIngredients(ingredientsData)
        setPortions((recipeData?.portions as number) || 4)
      } catch (error) {
        console.error('Failed to load recipe:', error)
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [id, getRecipe, getIngredients])

  const handlePortionChange = useCallback((newPortions: number) => {
    setPortions(Math.max(1, newPortions))
  }, [])

  const handleIngredientUpdate = useCallback(
    async (updatedIngredients: RecipeIngredient[]) => {
      setIngredients(updatedIngredients)
      if (id) {
        await updateRecipe(id, { ingredients: updatedIngredients })
      }
    },
    [id, updateRecipe]
  )

  if (dbLoading || !recipe) {
    return <LoadingSpinner />
  }

  return (
    <div className="recipe-editor" data-theme={theme}>
      <RecipeHeader
        name={recipe.name}
        portions={portions}
        onPortionChange={handlePortionChange}
        totalCost={totalCost}
        costPerPortion={costPerPortion}
      />

      <div className="ingredients-section">
        <IngredientsTable ingredients={ingredients} portions={portions} onUpdate={handleIngredientUpdate} />
      </div>

      <TabNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: 'cost', label: 'Cost Analysis' },
          { id: 'nutrition', label: 'Nutrition' },
          { id: 'notes', label: 'Notes' },
          { id: 'print', label: 'Print' },
          { id: 'cook', label: 'Cook Mode' }
        ]}
      />

      {activeTab && (
        <div className="tab-panel">
          <Suspense fallback={<LoadingSpinner />}>
            {activeTab === 'cost' && (
              <CostPanel totalCost={totalCost} costPerPortion={costPerPortion} ingredients={ingredients} portions={portions} />
            )}
            {activeTab === 'nutrition' && <NutritionPanel recipeId={id!} ingredients={ingredients} portions={portions} />}
            {activeTab === 'notes' && <NotesPanel recipeId={id!} initialNotes={recipe.notes ?? ''} />}
            {activeTab === 'print' && <PrintView recipe={recipe} ingredients={ingredients} portions={portions} />}
            {activeTab === 'cook' && <CookMode recipe={recipe} ingredients={ingredients} />}
          </Suspense>
        </div>
      )}
    </div>
  )
}
