// components/ComparePanel.tsx
import { memo } from 'react'
import type { IngredientRow } from './Ingredients'

export default memo(function ComparePanel({ 
  ingredients, 
  onClose 
}: { 
  ingredients: (IngredientRow | undefined)[]
  onClose: () => void 
}) {
  const validIngredients = ingredients.filter(Boolean) as IngredientRow[]
  
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-bold">مقارنة المكونات</h2>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        
        <table className="w-full">
          <thead>
            <tr>
              <th className="p-2 border"></th>
              {validIngredients.map(ing => (
                <th key={ing.id} className="p-2 border">{ing.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border font-medium">الفئة</td>
              {validIngredients.map(ing => (
                <td key={ing.id} className="p-2 border">{ing.category || '—'}</td>
              ))}
            </tr>
            <tr>
              <td className="p-2 border font-medium">المورد</td>
              {validIngredients.map(ing => (
                <td key={ing.id} className="p-2 border">{ing.supplier || '—'}</td>
              ))}
            </tr>
            <tr>
              <td className="p-2 border font-medium">سعر العبوة</td>
              {validIngredients.map(ing => (
                <td key={ing.id} className="p-2 border">
                  {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(ing.pack_price || 0)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-2 border font-medium">تكلفة الوحدة</td>
              {validIngredients.map(ing => (
                <td key={ing.id} className="p-2 border">
                  {new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(ing.net_unit_cost || 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})
