// pages/CostHistory.tsx - Timeline visualization weapon
import React, { useState, useEffect, useMemo } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useTheme } from '../contexts/ThemeContext';
import TimelineChart from '../components/cost/TimelineChart';
import DateRangePicker from '../components/cost/DateRangePicker';
import RecipeSelector from '../components/cost/RecipeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import type { CostPoint, Recipe } from '../types';

export default function CostHistory() {
  const { getCostHistory, getRecipes, loading } = useDatabase();
  const { theme } = useTheme();
  
  const [history, setHistory] = useState<CostPoint[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    new Date()
  ]);
  
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      try {
        const [historyData, recipesData] = await Promise.all([
          getCostHistory(),
          getRecipes()
        ]);
        
        if (mounted) {
          setHistory(historyData);
          setRecipes(recipesData);
        }
      } catch (error) {
        console.error('Failed to load cost history:', error);
      }
    };
    
    loadData();
    
    return () => { mounted = false; };
  }, [getCostHistory, getRecipes]);
  
  const filteredHistory = useMemo(() => {
    let filtered = history;
    
    if (selectedRecipe !== 'all') {
      filtered = filtered.filter(h => h.recipe_id === selectedRecipe);
    }
    
    filtered = filtered.filter(h => {
      const date = new Date(h.date);
      return date >= dateRange[0] && date <= dateRange[1];
    });
    
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [history, selectedRecipe, dateRange]);
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="cost-history" data-theme={theme}>
      <header className="history-header">
        <h1>Cost Evolution Timeline</h1>
        <p>Track ingredient and recipe costs over time</p>
      </header>
      
      <div className="controls">
        <RecipeSelector
          recipes={recipes}
          value={selectedRecipe}
          onChange={setSelectedRecipe}
        />
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
        />
      </div>
      
      <div className="chart-container">
        <TimelineChart data={filteredHistory} />
      </div>
      
      <div className="insights">
        <h2>Key Insights</h2>
        <div className="insight-grid">
          {filteredHistory.length > 0 && (
            <>
              <div className="insight-card">
                <h3>Average Cost</h3>
                <p className="value">
                  ${(filteredHistory.reduce((sum, h) => sum + h.cost, 0) / filteredHistory.length).toFixed(2)}
                </p>
              </div>
              <div className="insight-card">
                <h3>Highest Cost</h3>
                <p className="value">
                  ${Math.max(...filteredHistory.map(h => h.cost)).toFixed(2)}
                </p>
              </div>
              <div className="insight-card">
                <h3>Lowest Cost</h3>
                <p className="value">
                  ${Math.min(...filteredHistory.map(h => h.cost)).toFixed(2)}
                </p>
              </div>
              <div className="insight-card">
                <h3>Trend</h3>
                <p className="value">
                  {filteredHistory.length >= 2 ? (
                    filteredHistory[filteredHistory.length - 1].cost > filteredHistory[0].cost ? '📈 Rising' : '📉 Falling'
                  ) : '—'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      
      <style>{`
        .cost-history {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        .history-header {
          margin-bottom: 2rem;
        }
        
        .history-header h1 {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 0.5rem 0;
        }
        
        .history-header p {
          color: var(--text-secondary);
          font-size: 1rem;
          margin: 0;
        }
        
        .controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          background: var(--surface);
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: var(--shadow-sm);
        }
        
        .chart-container {
          background: var(--surface);
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: var(--shadow-md);
          margin-bottom: 2rem;
          min-height: 400px;
        }
        
        .insights {
          background: var(--surface);
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: var(--shadow-sm);
        }
        
        .insights h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 1.5rem 0;
        }
        
        .insight-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        
        .insight-card {
          padding: 1rem;
          background: var(--surface-secondary);
          border-radius: 8px;
        }
        
        .insight-card h3 {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin: 0 0 0.5rem 0;
        }
        
        .insight-card .value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        
        @media (max-width: 768px) {
          .cost-history {
            padding: 1rem;
          }
          
          .controls {
            flex-direction: column;
          }
          
          .insight-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}