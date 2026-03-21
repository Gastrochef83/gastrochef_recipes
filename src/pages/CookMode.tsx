// src/pages/CookMode.tsx
import { useSearchParams } from 'react-router-dom'

export default function CookMode() {
  const [sp] = useSearchParams()
  const id = sp.get('id')

  return (
    <div className="neo-cook-mode">
      <div className="neo-cook-header">
        <h1>Cook Mode</h1>
        <p>Recipe ID: {id || 'Not specified'}</p>
      </div>
      <div className="neo-cook-content">
        <p>This is a placeholder for Cook Mode page.</p>
      </div>
    </div>
  )
}
