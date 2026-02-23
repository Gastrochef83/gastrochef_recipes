import React, { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Recipe, RecipeIngredient, CostPoint } from '../types'

type DB = {
  loading: boolean
  getRecipes: () => Promise<Recipe[]>
  getRecipe: (id: string) => Promise<Recipe | null>
  getIngredients: (recipeId: string) => Promise<RecipeIngredient[]>
  updateRecipe: (id: string, patch: Partial<Recipe> & { ingredients?: RecipeIngredient[] }) => Promise<void>
  createRecipe: (name?: string) => Promise<Recipe>
  getCostHistory: (recipeId?: string) => Promise<CostPoint[]>
}

const DatabaseContext = createContext<DB | null>(null)

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false)

  // Default table names. Change here if your schema differs.
  const T_RECIPES = 'recipes'
  const T_LINES = 'recipe_lines'
  const T_COST = 'cost_history'

  const getRecipes = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from(T_RECIPES).select('*').order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Recipe[]
    } finally {
      setLoading(false)
    }
  }, [])

  const getRecipe = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from(T_RECIPES).select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return (data ?? null) as Recipe | null
    } finally {
      setLoading(false)
    }
  }, [])

  const getIngredients = useCallback(async (recipeId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from(T_LINES).select('*').eq('recipe_id', recipeId).order('id', { ascending: true })
      if (error) throw error

      // Map DB rows to UI model (best-effort, schema-agnostic)
      const rows = (data ?? []) as any[]
      return rows.map((r) => ({
        id: String(r.id ?? crypto.randomUUID()),
        name: String(r.name ?? r.ingredient_name ?? ''),
        quantity: Number(r.quantity ?? r.net_qty ?? 0),
        unit: String(r.unit ?? 'g'),
        cost_per_unit: Number(r.cost_per_unit ?? r.unit_cost ?? 0),
        yield_percent: Number(r.yield_percent ?? r.yield_pct ?? 100),
        note: r.note ?? null,
        recipe_id: r.recipe_id
      })) as RecipeIngredient[]
    } finally {
      setLoading(false)
    }
  }, [])

  const updateRecipe = useCallback(async (id: string, patch: Partial<Recipe> & { ingredients?: RecipeIngredient[] }) => {
    setLoading(true)
    try {
      const { ingredients, ...recipePatch } = patch

      if (Object.keys(recipePatch).length) {
        const { error } = await supabase
          .from(T_RECIPES)
          .update({ ...recipePatch, updated_at: new Date().toISOString() } as any)
          .eq('id', id)
        if (error) throw error
      }

      if (ingredients) {
        // Replace lines (schema-agnostic)
        await supabase.from(T_LINES).delete().eq('recipe_id', id)
        if (ingredients.length) {
          const payload = ingredients.map((l) => ({
            recipe_id: id,
            name: l.name,
            quantity: l.quantity,
            unit: l.unit,
            cost_per_unit: l.cost_per_unit,
            yield_percent: l.yield_percent,
            note: l.note ?? null
          }))
          const { error } = await supabase.from(T_LINES).insert(payload as any)
          if (error) throw error
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const createRecipe = useCallback(async (name?: string) => {
    setLoading(true)
    try {
      const payload: any = {
        name: name ?? 'New Recipe',
        portions: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const { data, error } = await supabase.from(T_RECIPES).insert(payload).select('*').single()
      if (error) throw error
      return data as Recipe
    } finally {
      setLoading(false)
    }
  }, [])

  const getCostHistory = useCallback(async (recipeId?: string) => {
    setLoading(true)
    try {
      let q: any = supabase.from(T_COST).select('*').order('created_at', { ascending: true })
      if (recipeId) q = q.eq('recipe_id', recipeId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as CostPoint[]
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo<DB>(
    () => ({ loading, getRecipes, getRecipe, getIngredients, updateRecipe, createRecipe, getCostHistory }),
    [loading, getRecipes, getRecipe, getIngredients, updateRecipe, createRecipe, getCostHistory]
  )

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider')
  return ctx
}
