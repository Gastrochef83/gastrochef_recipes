import * as React from 'react'
import type { CostPoint } from '../lib/costHistory'

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function fmt(n: number) {
  return Number.isFinite(n) ? n : 0
}

/**
 * Ultra-light timeline (SVG) — no deps, no schema changes.
 * Shows CPP evolution using local snapshots.
 */
export function CostTimeline({
  points,
  currency,
  height = 88
}: {
  points: CostPoint[]
  currency: string
  height?: number
}) {
  const data = React.useMemo(() => {
    const p = (points || []).slice().sort((a, b) => a.createdAt - b.createdAt)
    if (!p.length) return { p, min: 0, max: 0 }
    const vals = p.map(x => fmt(x.cpp))
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    return { p, min, max: min === max ? max + 1 : max }
  }, [points])

  if (!data.p.length) {
    return (
      <div className="gc-hint" style={{ marginTop: 10 }}>
        No snapshots yet.
      </div>
    )
  }

  const W = 520
  const H = height
  const pad = 10

  const mapX = (i: number) => {
    const n = data.p.length
    if (n === 1) return W / 2
    return pad + (i * (W - pad * 2)) / (n - 1)
  }

  const mapY = (v: number) => {
    const t = (v - data.min) / (data.max - data.min)
    return pad + (1 - clamp(t, 0, 1)) * (H - pad * 2)
  }

  const d = data.p
    .map((pt, i) => {
      const x = mapX(i)
      const y = mapY(fmt(pt.cpp))
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  const last = data.p[data.p.length - 1]
  const lastLabel = (() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(fmt(last.cpp))
    } catch {
      return `${fmt(last.cpp).toFixed(2)} ${(currency || 'USD').toUpperCase()}`
    }
  })()

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div className="gc-hint">CPP evolution</div>
        <div className="gc-chip" title="Latest cost/portion">
          Latest: <b style={{ marginLeft: 6 }}>{lastLabel}</b>
        </div>
      </div>

      <div style={{ marginTop: 8, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Cost timeline">
          <path d={d} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.2" />
          {data.p.map((pt, i) => {
            const x = mapX(i)
            const y = mapY(fmt(pt.cpp))
            return <circle key={pt.id} cx={x} cy={y} r={3.4} fill="currentColor" fillOpacity={0.55} />
          })}
        </svg>
      </div>
    </div>
  )
}
