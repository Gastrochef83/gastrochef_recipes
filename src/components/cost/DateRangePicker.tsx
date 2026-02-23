import React from 'react'

function fmt(d: Date): string {
  // yyyy-mm-dd for <input type="date">
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
  return iso.slice(0, 10)
}

export default function DateRangePicker({
  value,
  onChange
}: {
  value: [Date, Date]
  onChange: (v: [Date, Date]) => void
}) {
  const [start, end] = value

  return (
    <div className="dr">
      <label className="dr__label">From</label>
      <input
        className="dr__input"
        type="date"
        value={fmt(start)}
        onChange={e => onChange([new Date(e.target.value), end])}
      />
      <label className="dr__label">To</label>
      <input
        className="dr__input"
        type="date"
        value={fmt(end)}
        onChange={e => onChange([start, new Date(e.target.value)])}
      />

      <style>{`
        .dr{ display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
        .dr__label{ color: var(--text-tertiary); font-weight: 900; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
        .dr__input{ padding: 10px 12px; border-radius: 12px; border:1px solid var(--border); background: var(--surface-secondary); color: var(--text-primary); font-weight: 800; }
      `}</style>
    </div>
  )
}
