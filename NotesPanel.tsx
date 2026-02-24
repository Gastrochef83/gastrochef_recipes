import React from 'react'

export default function WarningBanner({ warnings }: { warnings: { recipeName: string; foodCost: number }[] }) {
  return (
    <div className="gc-warning">
      <strong>High food cost recipes:</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>
            {w.recipeName} — {Number(w.foodCost).toFixed(1)}%
          </li>
        ))}
      </ul>
    </div>
  )
}
