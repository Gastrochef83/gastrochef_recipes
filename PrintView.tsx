import React from 'react'

export default function KpiCard({
  title,
  value,
  trend,
  status,
  icon
}: {
  title: string
  value: string
  trend?: number
  status?: 'success' | 'warning' | 'danger'
  icon?: string
}) {
  return (
    <div className={`gc-card gc-kpi ${status ? `is-${status}` : ''}`.trim()}>
      <div className="gc-kpi__top">
        <div>
          <div className="gc-kpi__title">{title}</div>
          <div className="gc-kpi__value">{value}</div>
        </div>
        <div className="gc-kpi__icon">{icon ?? ''}</div>
      </div>
      {typeof trend === 'number' ? (
        <div className={`gc-kpi__trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</div>
      ) : null}
    </div>
  )
}
