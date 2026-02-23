import React, { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDatabase } from '../contexts/DatabaseContext'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import type { Recipe } from '../types'

export default function Recipes() {
  const { getRecipes, loading } = useDatabase()
  const { theme } = useTheme()

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const data = await getRecipes()
      if (mounted) setRecipes(data)
    })()
    return () => {
      mounted = false
    }
  }, [getRecipes])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return recipes
    return recipes.filter(r => (r.name || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s))
  }, [recipes, q])

  if (loading) return <LoadingSpinner />

  return (
    <div className="recipes" data-theme={theme}>
      <header className="recipes__header">
        <div>
          <h1>Recipes</h1>
          <p>Manage your recipe library</p>
        </div>
        <div className="recipes__actions">
          <div style={{ minWidth: 320 }}>
            <Input placeholder="Search recipes…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => alert('Create flow is not wired yet. Hook it to your existing DB create recipe logic.')}>New</Button>
        </div>
      </header>

      <div className="recipes__grid">
        {filtered.map(r => (
          <NavLink key={r.id} to={`/recipe/${r.id}`} className="recipe-card">
            <div className="recipe-card__top">
              <div className="recipe-card__title">{r.name}</div>
              <div className="recipe-card__meta">
                <span>{r.category || '—'}</span>
                <span>•</span>
                <span>{r.portions || 0} portions</span>
              </div>
            </div>
            <div className="recipe-card__bottom">
              <div className="pill">Open Editor</div>
            </div>
          </NavLink>
        ))}

        {!filtered.length ? (
          <div className="empty">
            <h2>No recipes found</h2>
            <p>Add recipes in your DB (table: recipes) or wire the create button.</p>
          </div>
        ) : null}
      </div>

      <style>{`
        .recipes{ max-width: 1400px; margin: 0 auto; padding: 2rem; }
        .recipes__header{ display:flex; justify-content: space-between; align-items:flex-end; gap: 1rem; margin-bottom: 1.5rem; }
        .recipes__header h1{ margin:0; font-size: 2rem; color: var(--text-primary); }
        .recipes__header p{ margin:.35rem 0 0; color: var(--text-secondary); }
        .recipes__actions{ display:flex; align-items:center; gap: .75rem; flex-wrap: wrap; }

        .recipes__grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .recipe-card{
          text-decoration:none;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
          box-shadow: var(--shadow-md);
          color: var(--text-primary);
          display:flex;
          flex-direction: column;
          min-height: 130px;
        }
        .recipe-card:hover{ transform: translateY(-1px); }
        .recipe-card__title{ font-weight: 800; font-size: 1.05rem; }
        .recipe-card__meta{ margin-top: 6px; display:flex; gap: 8px; align-items:center; color: var(--text-tertiary); font-weight: 600; font-size: .9rem; }
        .recipe-card__bottom{ margin-top: auto; display:flex; justify-content:flex-end; }
        .pill{ padding: 8px 10px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border)); background: color-mix(in oklab, var(--primary) 10%, transparent); font-weight: 700; font-size: .9rem; }

        .empty{ grid-column: 1 / -1; padding: 24px; border-radius: 16px; background: var(--surface); border:1px dashed var(--border); color: var(--text-secondary); }
        .empty h2{ margin:0 0 6px; color: var(--text-primary); }

        @media (max-width: 1024px){ .recipes__grid{ grid-template-columns: repeat(2, 1fr);} }
        @media (max-width: 640px){ .recipes{ padding: 1rem; } .recipes__grid{ grid-template-columns: 1fr;} }
      `}</style>
    </div>
  )
}
