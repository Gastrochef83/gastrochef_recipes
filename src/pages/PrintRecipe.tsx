// src/pages/PrintRecipe.tsx
import { useSearchParams } from 'react-router-dom'

export default function PrintRecipe() {
  const [sp] = useSearchParams()
  const id = sp.get('id')
  const autoprint = sp.get('autoprint')

  return (
    <div className="neo-print-recipe">
      <div className="neo-print-header">
        <h1>Print Recipe</h1>
        <p>Recipe ID: {id || 'Not specified'}</p>
        {autoprint && <p>Auto-print enabled</p>}
      </div>
      <div className="neo-print-content">
        <p>This is a placeholder for Print Recipe page.</p>
      </div>
    </div>
  )
}
