// components/recipe/IngredientsTable.tsx - Zero clipping, clear workflow
import React, { useMemo } from 'react';
import { RecipeIngredient } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface Props {
  ingredients: RecipeIngredient[];
  portions: number;
  onUpdate: (ingredients: RecipeIngredient[]) => void;
}

export default function IngredientsTable({ ingredients, portions, onUpdate }: Props) {
  const totalWeight = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + ing.quantity, 0);
  }, [ingredients]);
  
  const handleQuantityChange = (index: number, quantity: number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], quantity };
    onUpdate(updated);
  };
  
  const handleAddIngredient = () => {
    const updated = [...ingredients, {
      id: crypto.randomUUID(),
      name: '',
      quantity: 0,
      unit: 'g',
      cost_per_unit: 0,
      yield_percent: 100
    }];
    onUpdate(updated);
  };
  
  const handleRemoveIngredient = (index: number) => {
    const updated = ingredients.filter((_, i) => i !== index);
    onUpdate(updated);
  };
  
  return (
    <div className="ingredients-table">
      <div className="table-header">
        <h3>Ingredients</h3>
        <div className="table-meta">
          <span>Total Weight: {totalWeight.toFixed(1)}g</span>
          <span>Portions: {portions}</span>
        </div>
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Cost/Unit</th>
              <th>Total Cost</th>
              <th>Yield %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing, index) => (
              <tr key={ing.id}>
                <td>
                  <Input
                    value={ing.name}
                    onChange={(e) => {
                      const updated = [...ingredients];
                      updated[index] = { ...updated[index], name: e.target.value };
                      onUpdate(updated);
                    }}
                    placeholder="Ingredient name"
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                    min={0}
                    step={0.1}
                  />
                </td>
                <td>
                  <select
                    value={ing.unit}
                    onChange={(e) => {
                      const updated = [...ingredients];
                      updated[index] = { ...updated[index], unit: e.target.value };
                      onUpdate(updated);
                    }}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="pcs">pcs</option>
                  </select>
                </td>
                <td>
                  <Input
                    type="number"
                    value={ing.cost_per_unit}
                    onChange={(e) => {
                      const updated = [...ingredients];
                      updated[index] = { ...updated[index], cost_per_unit: parseFloat(e.target.value) || 0 };
                      onUpdate(updated);
                    }}
                    min={0}
                    step={0.01}
                    prefix="$"
                  />
                </td>
                <td className="cost">
                  ${((ing.quantity * ing.cost_per_unit) * (ing.yield_percent / 100)).toFixed(2)}
                </td>
                <td>
                  <Input
                    type="number"
                    value={ing.yield_percent}
                    onChange={(e) => {
                      const updated = [...ingredients];
                      updated[index] = { ...updated[index], yield_percent: parseFloat(e.target.value) || 100 };
                      onUpdate(updated);
                    }}
                    min={0}
                    max={100}
                    suffix="%"
                  />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() => handleRemoveIngredient(index)}
                    aria-label="Remove ingredient"
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="table-footer">
        <Button onClick={handleAddIngredient} variant="secondary">
          + Add Ingredient
        </Button>
        
        <div className="cost-summary">
          <div>Total Cost: ${ingredients.reduce((sum, ing) => 
            sum + (ing.quantity * ing.cost_per_unit * (ing.yield_percent / 100)), 0
          ).toFixed(2)}</div>
          <div>Cost per portion: ${(ingredients.reduce((sum, ing) => 
            sum + (ing.quantity * ing.cost_per_unit * (ing.yield_percent / 100)), 0
          ) / portions).toFixed(2)}</div>
        </div>
      </div>
      
      <style>{`
        .ingredients-table {
          width: 100%;
        }
        
        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .table-header h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        
        .table-meta {
          display: flex;
          gap: 1rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        
        .table-container {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 800px;
        }
        
        th {
          text-align: left;
          padding: 1rem;
          background: var(--surface-secondary);
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
          border-bottom: 2px solid var(--border);
        }
        
        td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          color: var(--text-primary);
        }
        
        tr:last-child td {
          border-bottom: none;
        }
        
        td.cost {
          font-weight: 600;
          color: var(--success);
        }
        
        select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--surface);
          color: var(--text-primary);
          font-size: 0.875rem;
        }
        
        .table-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        
        .cost-summary {
          display: flex;
          gap: 2rem;
          font-weight: 600;
        }
        
        .cost-summary div:first-child {
          color: var(--text-primary);
        }
        
        .cost-summary div:last-child {
          color: var(--primary);
        }
        
        @media (max-width: 768px) {
          .table-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
          
          .table-footer {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }
          
          .cost-summary {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}