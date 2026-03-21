import React, { useState, useEffect, useMemo } from 'react'
import { useDatabase } from '../contexts/DatabaseContext'
import { useTheme } from '../contexts/ThemeContext'
import TimelineChart from '../components/cost/TimelineChart'
import DateRangePicker from '../components/cost/DateRangePicker'
import RecipeSelector from '../components/cost/RecipeSelector'
import LoadingSpinner from '../components/LoadingSpinner'

export default function CostHistory() {
  const { getCostHistory, getRecipes, loading } = useDatabase()
  const { theme } = useTheme()

  const [history, setHistory] = useState<any[]>([])
  const [recipes, setRecipes] = useState<any[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all')
  const [dateRange, setDateRange] = useState<[Date, Date]>([new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date()])

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const [h, r] = await Promise.all([getCostHistory(), getRecipes()])
        if (!mounted) return
        setHistory(h)
        setRecipes(r)
      } catch (e) {
        console.error('Failed to load cost history:', e)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [getCostHistory, getRecipes])

  const filteredHistory = useMemo(() => {
    let filtered = [...history]

    if (selectedRecipe !== 'all') {
      filtered = filtered.filter((h) => h.recipe_id === selectedRecipe)
    }

    filtered = filtered.filter((h) => {
      const d = new Date(h.created_at ?? h.date ?? Date.now())
      return d >= dateRange[0] && d <= dateRange[1]
    })

    return filtered.sort((a, b) => new Date(a.created_at ?? a.date).getTime() - new Date(b.created_at ?? b.date).getTime())
  }, [history, selectedRecipe, dateRange])

  const values = filteredHistory.map((h) => Number(h.total_cost ?? h.cost ?? 0))
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const hi = values.length ? Math.max(...values) : 0
  const lo = values.length ? Math.min(...values) : 0

  if (loading) return <LoadingSpinner />

  return (
    <div className="cost-history" data-theme={theme}>
      <header className="history-header">
        <h1>Cost Evolution Timeline</h1>
        <p className="gc-muted">Track recipe costs over time.</p>
      </header>

      <div className="controls">
        <RecipeSelector recipes={recipes} value={selectedRecipe} onChange={setSelectedRecipe} />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="chart-container">
        <TimelineChart data={filteredHistory} />
      </div>

      <div className="insights">
        <h2>Key Insights</h2>
        <div className="insight-grid">
          <div className="insight-card">
            <h3>Average Cost</h3>
            <p className="value">${avg.toFixed(2)}</p>
          </div>
          <div className="insight-card">
            <h3>Highest Cost</h3>
            <p className="value">${hi.toFixed(2)}</p>
          </div>
          <div className="insight-card">
            <h3>Lowest Cost</h3>
            <p className="value">${lo.toFixed(2)}</p>
          </div>
          <div className="insight-card">
            <h3>Trend</h3>
            <p className="value">
              {values.length >= 2 ? (values[values.length - 1] > values[0] ? '📈 Rising' : '📉 Falling') : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
