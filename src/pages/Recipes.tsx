import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDatabase } from '../contexts/DatabaseContext'
import { useTheme } from '../contexts/ThemeContext'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Recipes() {
  const { getRecipes, createRecipe, loading } = useDatabase()
  const { theme } = useTheme()
  const [recipes, setRecipes] = useState<any[]>([])
  const nav = useNavigate()

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const r = await getRecipes()
        if (mounted) setRecipes(r)
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [getRecipes])

  const onNew = async () => {
    const r = await createRecipe('New Recipe')
    nav(`/recipe/${r.id}`)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="recipes-page" data-theme={theme}>
      <div className="recipes-head">
        <h1>Recipes</h1>
        <Button onClick={onNew}>+ New Recipe</Button>
      </div>

      <div className="gc-grid">
        {recipes.map((r) => (
          <NavLink key={r.id} to={`/recipe/${r.id}`} className="gc-card gc-recipecard">
            <div className="gc-recipecard__title">{r.name}</div>
            <div className="gc-recipecard__meta">{r.category ?? '—'}</div>
          </NavLink>
        ))}
        {!recipes.length ? <div className="gc-muted">No recipes yet.</div> : null}
      </div>
    </div>
  )
}
