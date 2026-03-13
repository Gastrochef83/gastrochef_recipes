// src/components/LicenseBadge.tsx
import { getDemoMode, getLicenseLabel, getPlan } from '../lib/license'
import { useEffect, useState } from 'react'

export default function LicenseBadge() {
  const [demo, setDemo] = useState(false)
  const [label, setLabel] = useState('Community • Free')
  const [plan, setPlan] = useState<'FREE' | 'PRO' | 'TEAM'>('FREE')

  useEffect(() => {
    const refresh = () => {
      setDemo(getDemoMode())
      setLabel(getLicenseLabel())
      setPlan(getPlan())
    }
    refresh()
    window.addEventListener('storage', refresh)
    // local updates (settings toggles)
    window.addEventListener('gc:license', refresh as any)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('gc:license', refresh as any)
    }
  }, [])

  const klass =
    plan === 'TEAM' ? 'gc-badge gc-badge-team' : plan === 'PRO' ? 'gc-badge gc-badge-pro' : 'gc-badge'

  return (
    <div className="gc-license-stack">
      <span className={klass} title="GastroChef license status">
        {label}
      </span>
      {demo && (
        <span className="gc-badge gc-badge-demo" title="Demo mode is enabled">
          Demo Mode
        </span>
      )}
    </div>
  )
}
