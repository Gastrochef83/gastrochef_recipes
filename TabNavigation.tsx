import React, { useMemo } from 'react'
import { RecipeIngredient } from '../../types'
import Button from '../ui/Button'
import Input from '../ui/Input'

interface Props {
  ingredients: RecipeIngredient[]
  portions: number
  onUpdate: (ingredients: RecipeIngredient[]) => void
}

export default function IngredientsTable({ ingredients, portions, onUpdate }: Props) {
  const totalWeight = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + (Number(ing.quantity) || 0), 0)
  }, [ingredients])

  const handleQuantityChange = (index: number, quantity: number) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], quantity }
    onUpdate(updated)
  }

  const handleAddIngredient = () => {
    const updated: RecipeIngredient[] = [
      ...ingredients,
      {
        id: crypto.randomUUID(),
        name: '',
        quantity: 0,
        unit: 'g',
        cost_per_unit: 0,
        yield_percent: 100
      }
    ]
    onUpdate(updated)
  }

  const handleRemoveIngredient = (index: number) => {
    const updated = ingredients.filter((_, i) => i !== index)
    onUpdate(updated)
  }

  const totalCost = useMemo(() => {
    return ingredients.reduce(
      (sum, ing) => sum + (Number(ing.quantity) || 0) * (Number(ing.cost_per_unit) || 0) * ((Number(ing.yield_percent) || 100) / 100),
      0
    )
  }, [ingredients])

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
              <th />
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing, index) => (
              <tr key={ing.id}>
                <td>
                  <Input
                    value={ing.name}
                    onChange={(e) => {
                      const updated = [...ingredients]
                      updated[index] = { ...updated[index], name: e.target.value }
                      onUpdate(updated)
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
                    className="gc-select"
                    value={ing.unit}
                    onChange={(e) => {
                      const updated = [...ingredients]
                      updated[index] = { ...updated[index], unit: e.target.value }
                      onUpdate(updated)
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
                      const updated = [...ingredients]
                      updated[index] = { ...updated[index], cost_per_unit: parseFloat(e.target.value) || 0 }
                      onUpdate(updated)
                    }}
                    min={0}
                    step={0.01}
                    prefix="$"
                  />
                </td>
                <td className="cost">
                  ${((ing.quantity * ing.cost_per_unit) * ((ing.yield_percent || 100) / 100)).toFixed(2)}
                </td>
                <td>
                  <Input
                    type="number"
                    value={ing.yield_percent}
                    onChange={(e) => {
                      const updated = [...ingredients]
                      updated[index] = { ...updated[index], yield_percent: parseFloat(e.target.value) || 100 }
                      onUpdate(updated)
                    }}
                    min={0}
                    max={100}
                    suffix="%"
                  />
                </td>
                <td>
                  <Button variant="ghost" onClick={() => handleRemoveIngredient(index)} aria-label="Remove ingredient">
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
          <div>Total Cost: ${totalCost.toFixed(2)}</div>
          <div>Cost per portion: ${(portions ? totalCost / portions : 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}
