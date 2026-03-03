import React, { useCallback, useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipesCount, setRecipesCount] = useState<number>(0)
  const [ingredientsCount, setIngredientsCount] = useState<number>(0)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { count: rCount, error: rError } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })

      if (rError) throw rError

      const { count: iCount, error: iError } = await supabase
        .from('ingredients')
        .select('*', { count: 'exact', head: true })

      if (iError) throw iError

      setRecipesCount(rCount || 0)
      setIngredientsCount(iCount || 0)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="gc-card p-8 text-center">
        <div className="gc-label">Loading</div>
        <div className="mt-2 text-sm text-neutral-600">
          Preparing your kitchen dashboard...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        title="We couldn't load your dashboard"
        message="Please check your connection and try again."
        details={error}
        onRetry={load}
        variant="page"
      />
    )
  }

  if (recipesCount === 0 && ingredientsCount === 0) {
    return (
      <EmptyState
        title="Your kitchen is ready"
        description="Start by adding ingredients or creating your first recipe to see insights here."
        primaryAction={{
          label: "Add Ingredient",
          onClick: () => window.location.hash = "/ingredients"
        }}
        secondaryAction={{
          label: "Create Recipe",
          onClick: () => window.location.hash = "/recipes"
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="gc-label">Overview</div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="gc-card p-4">
            <div className="text-sm text-neutral-600">Total Recipes</div>
            <div className="mt-2 text-2xl font-extrabold">
              {recipesCount}
            </div>
          </div>

          <div className="gc-card p-4">
            <div className="text-sm text-neutral-600">Total Ingredients</div>
            <div className="mt-2 text-2xl font-extrabold">
              {ingredientsCount}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
