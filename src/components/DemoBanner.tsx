// src/components/DemoBanner.tsx
import { useEffect, useState } from 'react'
import { getDemoMode, setDemoMode } from '../lib/license'
import Button from './ui/Button'

export default function DemoBanner() {
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    const refresh = () => setDemo(getDemoMode())
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('gc:license', refresh as any)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('gc:license', refresh as any)
    }
  }, [])

  if (!demo) return null

  return (
    <div className="gc-demo-banner" role="status" aria-live="polite">
      <div className="gc-demo-banner__inner">
        <div>
          <div className="gc-demo-banner__title">Demo Mode is ON</div>
          <div className="gc-demo-banner__hint">Great for showcasing GastroChef to chefs & investors. Turn it off anytime.</div>
        </div>
        <div className="gc-demo-banner__actions">
          <Button
            variant="ghost"
            onClick={() => {
              setDemoMode(false)
              window.dispatchEvent(new Event('gc:license'))
            }}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  )
}
