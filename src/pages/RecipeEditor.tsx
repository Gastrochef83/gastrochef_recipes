// pages/RecipeEditor.tsx - Progressive reveal with nuclear performance
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { useDatabase } from '../contexts/DatabaseContext';
import { useTheme } from '../contexts/ThemeContext';
import RecipeHeader from '../components/recipe/RecipeHeader';
import IngredientsTable from '../components/recipe/IngredientsTable';
import TabNavigation from '../components/recipe/TabNavigation';
import LoadingSpinner from '../components/LoadingSpinner';
import { Recipe, RecipeIngredient } from '../types';

// Lazy load heavy components
const CostPanel = lazy(() => import('../components/recipe/CostPanel'));
const NutritionPanel = lazy(() => import('../components/recipe/NutritionPanel'));
const NotesPanel = lazy(() => import('../components/recipe/NotesPanel'));
const PrintView = lazy(() => import('../components/recipe/PrintView'));
const CookMode = lazy(() => import('../components/recipe/CookMode'));

type Tab = 'cost' | 'nutrition' | 'notes' | 'print' | 'cook';

export default function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const { getRecipe, getIngredients, updateRecipe, loading: dbLoading } = useDatabase();
  const { theme } = useTheme();
  
  // Core state only
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [portions, setPortions] = useState(4);
  
  // Memoized calculations
  const totalCost = useMemo(() => {
    if (!ingredients.length) return 0;
    return ingredients.reduce((sum, ing) => sum + (ing.cost_per_unit * ing.quantity), 0);
  }, [ingredients]);
  
  const costPerPortion = useMemo(() => {
    return portions > 0 ? totalCost / portions : 0;
  }, [totalCost, portions]);
  
  // Single effect for data loading
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (!id) return;
      
      try {
        const [recipeData, ingredientsData] = await Promise.all([
          getRecipe(id),
          getIngredients(id)
        ]);
        
        if (mounted) {
          setRecipe(recipeData);
          setIngredients(ingredientsData);
          setPortions(recipeData?.portions || 4);
        }
      } catch (error) {
        console.error('Failed to load recipe:', error);
      }
    };
    
    loadData();
    
    return () => { mounted = false; };
  }, [id, getRecipe, getIngredients]);
  
  const handlePortionChange = useCallback((newPortions: number) => {
    setPortions(Math.max(1, newPortions));
  }, []);
  
  const handleIngredientUpdate = useCallback(async (updatedIngredients: RecipeIngredient[]) => {
    setIngredients(updatedIngredients);
    // Debounced save
    if (id) {
      await updateRecipe(id, { ingredients: updatedIngredients });
    }
  }, [id, updateRecipe]);
  
  if (dbLoading || !recipe) {
    return <LoadingSpinner />;
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
        <IngredientsTable
          ingredients={ingredients}
          portions={portions}
          onUpdate={handleIngredientUpdate}
        />
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
              <CostPanel
                totalCost={totalCost}
                costPerPortion={costPerPortion}
                ingredients={ingredients}
                portions={portions}
              />
            )}
            {activeTab === 'nutrition' && (
              <NutritionPanel
                recipeId={id!}
                ingredients={ingredients}
                portions={portions}
              />
            )}
            {activeTab === 'notes' && (
              <NotesPanel
                recipeId={id!}
                initialNotes={recipe.notes}
              />
            )}
            {activeTab === 'print' && (
              <PrintView
                recipe={recipe}
                ingredients={ingredients}
                portions={portions}
              />
            )}
            {activeTab === 'cook' && (
              <CookMode
                recipe={recipe}
                ingredients={ingredients}
              />
            )}
          </Suspense>
        </div>
      )}
      
      <style>{`
        .recipe-editor {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .ingredients-section {
          margin: 2rem 0;
          background: var(--surface);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: var(--shadow-sm);
        }
        
        .tab-panel {
          margin-top: 2rem;
          background: var(--surface);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: var(--shadow-sm);
        }
        
        @media (max-width: 768px) {
          .recipe-editor {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}