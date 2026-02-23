import React from 'react'

type Props = {
  title: string
  value: string
  trend?: number
  icon?: string
  status?: 'success' | 'warning' | 'danger'
}

export default function KpiCard({ title, value, trend, icon, status }: Props) {
  const trendLabel = typeof trend === 'number' ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%` : null
  return (
    <div className={`kpi ${status ? `kpi--${status}` : ''}`}>
      <div className="kpi__top">
        <div>
          <div className="kpi__title">{title}</div>
          <div className="kpi__value">{value}</div>
        </div>
        <div className="kpi__icon" aria-hidden>{icon || '•'}</div>
      </div>
      {trendLabel ? <div className="kpi__trend">{trendLabel}</div> : null}

      <style>{`
        .kpi{
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem;
          box-shadow: var(--shadow-md);
        }
        .kpi__top{ display:flex; justify-content: space-between; align-items:flex-start; gap: 10px; }
        .kpi__title{ color: var(--text-tertiary); font-weight: 700; font-size: .9rem; }
        .kpi__value{ margin-top: 6px; color: var(--text-primary); font-weight: 900; font-size: 1.6rem; }
        .kpi__icon{ width: 44px; height: 44px; border-radius: 14px; display:grid; place-items:center; font-size: 1.3rem; background: var(--surface-secondary); border: 1px solid var(--border); }
        .kpi__trend{ margin-top: 10px; font-weight: 800; color: var(--text-secondary); }
        .kpi--success{ border-color: color-mix(in oklab, var(--success) 35%, var(--border)); }
        .kpi--warning{ border-color: color-mix(in oklab, var(--warning) 35%, var(--border)); }
        .kpi--danger{ border-color: color-mix(in oklab, var(--danger) 35%, var(--border)); }
      `}</style>
    </div>
  )
}
