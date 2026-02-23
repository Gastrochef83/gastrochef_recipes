// pages/Dashboard.tsx - CEO control panel with instant KPIs
import React, { useState, useEffect, useMemo } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useTheme } from '../contexts/ThemeContext';
import KpiCard from '../components/dashboard/KpiCard';
import CostChart from '../components/dashboard/CostChart';
import RecipeList from '../components/dashboard/RecipeList';
import WarningBanner from '../components/dashboard/WarningBanner';
import LoadingSpinner from '../components/LoadingSpinner';
import type { Recipe, CostPoint } from '../types';

export default function Dashboard() {
  const { getRecipes, getCostHistory, loading } = useDatabase();
  const { theme } = useTheme();
  
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [costHistory, setCostHistory] = useState<CostPoint[]>([]);
  
  useEffect(() => {
    let mounted = true;
    
    const loadDashboard = async () => {
      try {
        const [recipesData, historyData] = await Promise.all([
          getRecipes(),
          getCostHistory()
        ]);
        
        if (mounted) {
          setRecipes(recipesData);
          setCostHistory(historyData);
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      }
    };
    
    loadDashboard();
    
    return () => { mounted = false; };
  }, [getRecipes, getCostHistory]);
  
  const kpis = useMemo(() => {
    if (!recipes.length) {
      return {
        avgfoodCost: r.food_cost ?? 0 0,
        avgMargin: 0,
        totalRecipes: 0,
        warnings: []
      };
    }
    
    const totalCost = recipes.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const totalRevenue = recipes.reduce((sum, r) => sum + (r.menu_price || 0), 0);
    
    const avgFoodCost = recipes.length ? (totalCost / recipes.length) : 0;
    const avgMargin = totalRevenue ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    
    const warnings = recipes
      .filter(r => r.food_cost_percentage ?? 0 ?? 0 > 35)
      .map(r => ({
        recipeName: r.name,
        foodCost: r.food_cost ?? 0 r.food_cost_percentage ?? 0
      }));
    
    return {
      avgFoodCost,
      avgMargin,
      totalRecipes: recipes.length,
      warnings
    };
  }, [recipes]);
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="dashboard" data-theme={theme}>
      <header className="dashboard-header">
        <h1>Executive Dashboard</h1>
        <p className="date">{new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>
      </header>
      
      <div className="kpi-grid">
        <KpiCard
          title="Average Food Cost"
          value={`$${kpis.avgFoodCost.toFixed(2)}`}
          trend={-2.5}
          icon="💰"
        />
        <KpiCard
          title="Average Margin"
          value={`${kpis.avgMargin.toFixed(1)}%`}
          trend={1.2}
          icon="📈"
        />
        <KpiCard
          title="Total Recipes"
          value={kpis.totalRecipes.toString()}
          icon="📋"
        />
        <KpiCard
          title="Cost Efficiency"
          value={kpis.avgMargin > 30 ? 'Excellent' : kpis.avgMargin > 20 ? 'Good' : 'Review'}
          status={kpis.avgMargin > 30 ? 'success' : kpis.avgMargin > 20 ? 'warning' : 'danger'}
          icon="🎯"
        />
      </div>
      
      {kpis.warnings.length > 0 && (
        <WarningBanner warnings={kpis.warnings} />
      )}
      
      <div className="dashboard-grid">
        <div className="chart-section">
          <h2>Cost History</h2>
          <CostChart data={costHistory} />
        </div>
        
        <div className="recipes-section">
          <h2>Recent Recipes</h2>
          <RecipeList recipes={recipes.slice(0, 5)} />
        </div>
      </div>
      
      <style>{`
        .dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        
        .dashboard-header h1 {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        
        .dashboard-header .date {
          color: var(--text-secondary);
          font-size: 1rem;
        }
        
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 1.5rem;
          margin-top: 2rem;
        }
        
        .chart-section,
        .recipes-section {
          background: var(--surface);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: var(--shadow-md);
        }
        
        .chart-section h2,
        .recipes-section h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 1.5rem 0;
        }
        
        @media (max-width: 1024px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 640px) {
          .dashboard {
            padding: 1rem;
          }
          
          .dashboard-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
          
          .kpi-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
