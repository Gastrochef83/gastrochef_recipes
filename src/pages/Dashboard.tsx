import React, { useState, useEffect, useMemo } from 'react'
import { useDatabase } from '../contexts/DatabaseContext'
import { useTheme } from '../contexts/ThemeContext'
import KpiCard from '../components/dashboard/KpiCard'
import CostChart from '../components/dashboard/CostChart'
import RecipeList from '../components/dashboard/RecipeList'
import WarningBanner from '../components/dashboard/WarningBanner'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Dashboard() {
  const { getRecipes, getCostHistory, loading } = useDatabase()
  const { theme } = useTheme()

  const [recipes, setRecipes] = useState<any[]>([])
  const [costHistory, setCostHistory] = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const [r, h] = await Promise.all([getRecipes(), getCostHistory()])
        if (!mounted) return
        setRecipes(r)
        setCostHistory(h)
      } catch (e) {
        console.error('Failed to load dashboard:', e)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [getRecipes, getCostHistory])

  const kpis = useMemo(() => {
    if (!recipes.length) return { avgFoodCost: 0, avgMargin: 0, totalRecipes: 0, warnings: [] as any[] }

    const totalCost = recipes.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0)
    const totalRevenue = recipes.reduce((sum, r) => sum + (Number(r.menu_price) || 0), 0)

    const avgFoodCost = totalCost / recipes.length
    const avgMargin = totalRevenue ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0

    const warnings = recipes
      .filter((r) => Number(r.food_cost_percentage) > 35)
      .map((r) => ({ recipeName: r.name, foodCost: Number(r.food_cost_percentage) }))

    return { avgFoodCost, avgMargin, totalRecipes: recipes.length, warnings }
  }, [recipes])

  if (loading) return <LoadingSpinner />

  return (
    <div className="dashboard" data-theme={theme}>
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Executive Dashboard</h1>
          <div className="gc-muted">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiCard title="Average Food Cost" value={`$${kpis.avgFoodCost.toFixed(2)}`} trend={-2.5} icon="💰" />
        <KpiCard title="Average Margin" value={`${kpis.avgMargin.toFixed(1)}%`} trend={1.2} icon="📈" />
        <KpiCard title="Total Recipes" value={kpis.totalRecipes.toString()} icon="📋" />
        <KpiCard
          title="Cost Efficiency"
          value={kpis.avgMargin > 30 ? 'Excellent' : kpis.avgMargin > 20 ? 'Good' : 'Review'}
          status={kpis.avgMargin > 30 ? 'success' : kpis.avgMargin > 20 ? 'warning' : 'danger'}
          icon="🎯"
        />
      </div>

      {kpis.warnings.length > 0 ? <WarningBanner warnings={kpis.warnings} /> : null}

      <div className="dashboard-grid">
        <div className="gc-card chart-section">
          <h2>Cost History</h2>
          <CostChart data={costHistory} />
        </div>

        <div className="gc-card recipes-section">
          <h2>Recent Recipes</h2>
          <RecipeList recipes={recipes.slice(0, 5)} />
        </div>
      </div>
    </div>
  )
}
