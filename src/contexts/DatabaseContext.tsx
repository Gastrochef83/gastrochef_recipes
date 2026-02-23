import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CostPoint, Recipe, RecipeIngredient } from '../types'
import { useAuth } from './AuthContext'

interface DatabaseContextType {
  loading: boolean
  getRecipes: () => Promise<Recipe[]>
  getRecipe: (id: string) => Promise<Recipe>
  getIngredients: (recipeId: string) => Promise<RecipeIngredient[]>
  updateRecipe: (id: string, data: Partial<Recipe> & { ingredients?: RecipeIngredient[] }) => Promise<void>
  getCostHistory: () => Promise<CostPoint[]>
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined)

export const useDatabase = () => {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider')
  return ctx
}

function asNumber(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  const getRecipes = useCallback(async (): Promise<Recipe[]> => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as Recipe[]
    } catch (e) {
      console.warn('getRecipes fallback (check table name "recipes"):', e)
      // Safe fallback so UI works even before DB is wired
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const getRecipe = useCallback(async (id: string): Promise<Recipe> => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single()
      if (error) throw error
      return data as Recipe
    } catch (e) {
      console.warn('getRecipe fallback:', e)
      return { id, name: 'Untitled Recipe', portions: 4 }
    } finally {
      setLoading(false)
    }
  }, [])

  const getIngredients = useCallback(async (recipeId: string): Promise<RecipeIngredient[]> => {
    setLoading(true)
    try {
      // try common table names
      const tryTables = ['recipe_ingredients', 'ingredients', 'recipe_lines']
      for (const table of tryTables) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('recipe_id', recipeId)
          .order('position', { ascending: true })

        if (!error && Array.isArray(data)) {
          // normalize fields
          return data.map((row: any) => ({
            id: String(row.id ?? crypto.randomUUID()),
            recipe_id: String(row.recipe_id ?? recipeId),
            name: String(row.name ?? row.ingredient_name ?? ''),
            quantity: asNumber(row.quantity ?? row.gross_qty ?? 0),
            unit: String(row.unit ?? row.qty_unit ?? 'g'),
            cost_per_unit: asNumber(row.cost_per_unit ?? row.unit_cost ?? 0),
            yield_percent: asNumber(row.yield_percent ?? row.yield_pct ?? 100)
          })) as RecipeIngredient[]
        }
      }
      return []
    } catch (e) {
      console.warn('getIngredients fallback:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const updateRecipe = useCallback(
    async (id: string, data: Partial<Recipe> & { ingredients?: RecipeIngredient[] }) => {
      setLoading(true)
      try {
        // Update recipe core fields if present
        const recipePatch: any = { ...data }
        delete recipePatch.ingredients

        if (Object.keys(recipePatch).length) {
          const { error } = await supabase.from('recipes').update(recipePatch).eq('id', id)
          if (error) throw error
        }

        // Ingredients upsert (best-effort)
        if (data.ingredients) {
          // prefer recipe_ingredients
          const rows = data.ingredients.map((i, idx) => ({
            id: i.id,
            recipe_id: id,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            cost_per_unit: i.cost_per_unit,
            yield_percent: i.yield_percent,
            position: idx
          }))

          const { error } = await supabase.from('recipe_ingredients').upsert(rows, { onConflict: 'id' })
          if (error) {
            console.warn('upsert recipe_ingredients failed (check schema):', error)
          }
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const getCostHistory = useCallback(async (): Promise<CostPoint[]> => {
    setLoading(true)
    try {
      const tryTables = ['cost_history', 'cost_points', 'recipe_cost_history']
      for (const table of tryTables) {
        const { data, error } = await supabase.from(table).select('*').order('date', { ascending: true })
        if (!error && Array.isArray(data)) {
          return data.map((row: any) => ({
            id: row.id,
            recipe_id: String(row.recipe_id ?? row.recipeId ?? ''),
            date: String(row.date ?? row.created_at ?? new Date().toISOString()),
            cost: asNumber(row.cost ?? row.total_cost ?? 0)
          })) as CostPoint[]
        }
      }
      return []
    } catch (e) {
      console.warn('getCostHistory fallback:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo<DatabaseContextType>(
    () => ({ loading, getRecipes, getRecipe, getIngredients, updateRecipe, getCostHistory }),
    [loading, getRecipes, getRecipe, getIngredients, updateRecipe, getCostHistory]
  )

  // If no user yet, still provide context (reads may be blocked by RLS)
  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}
