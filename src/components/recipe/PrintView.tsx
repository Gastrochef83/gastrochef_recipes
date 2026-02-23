// components/recipe/PrintView.tsx - Professional A4 chef-ready print
import React, { forwardRef } from 'react';
import { Recipe, RecipeIngredient } from '../../types';

interface Props {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  portions: number;
}

const PrintView = forwardRef<HTMLDivElement, Props>(({ recipe, ingredients, portions }, ref) => {
  const totalCost = ingredients.reduce((sum, ing) => 
    sum + (ing.quantity * ing.cost_per_unit * (ing.yield_percent / 100)), 0
  );
  
  return (
    <div className="print-view" ref={ref}>
      <div className="print-header">
        <h1>{recipe.name}</h1>
        <div className="recipe-meta">
          <span>Portions: {portions}</span>
          <span>Date: {new Date().toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="print-grid">
        <div className="ingredients-section">
          <h2>Ingredients</h2>
          <table className="ingredients-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(ing => (
                <tr key={ing.id}>
                  <td>{ing.name}</td>
                  <td>{(ing.quantity * (ing.yield_percent / 100)).toFixed(1)}</td>
                  <td>{ing.unit}</td>
                  <td>${(ing.quantity * ing.cost_per_unit * (ing.yield_percent / 100)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="method-section">
          <h2>Method</h2>
          <p>{recipe.method || 'No method provided.'}</p>
        </div>
        
        <div className="cost-section">
          <h2>Cost Analysis</h2>
          <div className="cost-breakdown">
            <div>Total Cost: ${totalCost.toFixed(2)}</div>
            <div>Cost per Portion: ${(totalCost / portions).toFixed(2)}</div>
            {recipe.menu_price && (
              <div>Menu Price: ${recipe.menu_price.toFixed(2)}</div>
            )}
          </div>
        </div>
        
        {recipe.notes && (
          <div className="notes-section">
            <h2>Notes</h2>
            <p>{recipe.notes}</p>
          </div>
        )}
      </div>
      
      <style>{`
        .print-view {
          max-width: 210mm;
          margin: 0 auto;
          padding: 10mm;
          background: white;
          color: black;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .print-header {
          margin-bottom: 10mm;
          padding-bottom: 5mm;
          border-bottom: 2px solid #000;
        }
        
        .print-header h1 {
          font-size: 24pt;
          font-weight: 700;
          margin: 0 0 5mm 0;
          color: #000;
        }
        
        .recipe-meta {
          display: flex;
          gap: 10mm;
          font-size: 11pt;
          color: #333;
        }
        
        h2 {
          font-size: 14pt;
          font-weight: 600;
          margin: 0 0 3mm 0;
          color: #000;
          border-bottom: 1px solid #ccc;
          padding-bottom: 1mm;
        }
        
        .ingredients-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5mm;
          font-size: 10pt;
        }
        
        .ingredients-table th {
          text-align: left;
          padding: 2mm;
          border-bottom: 1px solid #000;
          font-weight: 600;
        }
        
        .ingredients-table td {
          padding: 2mm;
          border-bottom: 1px solid #eee;
        }
        
        .method-section,
        .cost-section,
        .notes-section {
          margin-bottom: 5mm;
        }
        
        .cost-breakdown {
          background: #f5f5f5;
          padding: 3mm;
          border-radius: 2mm;
          font-size: 11pt;
        }
        
        .cost-breakdown div {
          margin-bottom: 1mm;
        }
        
        @media print {
          .print-view {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
});

PrintView.displayName = 'PrintView';

export default PrintView;