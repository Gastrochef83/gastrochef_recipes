import React from 'react'

export default function WarningBanner({ warnings }: { warnings: { recipeName: string; foodCost: number }[] }) {
  return (
    <div className="wb" role="status">
      <div className="wb__title">High Food Cost Alerts</div>
      <div className="wb__items">
        {warnings.map((w, i) => (
          <div key={i} className="wb__chip">{w.recipeName}: {w.foodCost.toFixed(1)}%</div>
        ))}
      </div>

      <style>{`
        .wb{ margin-top: 1rem; padding: 14px; border-radius: 14px; border:1px solid color-mix(in oklab, var(--warning) 40%, var(--border)); background: color-mix(in oklab, var(--warning) 12%, transparent); }
        .wb__title{ font-weight: 900; color: var(--text-primary); margin-bottom: 8px; }
        .wb__items{ display:flex; flex-wrap: wrap; gap: 8px; }
        .wb__chip{ padding: 8px 10px; border-radius: 999px; background: var(--surface); border:1px solid var(--border); font-weight: 800; color: var(--text-primary); }
      `}</style>
    </div>
  )
}
