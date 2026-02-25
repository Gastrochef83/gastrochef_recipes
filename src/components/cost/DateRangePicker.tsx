import React from 'react'

export default function DateRangePicker({
  value,
  onChange
}: {
  value: [Date, Date]
  onChange: (v: [Date, Date]) => void
}) {
  const [from, to] = value

  return (
    <div className="gc-range">
      <label className="gc-field">
        <span className="gc-field__label">From</span>
        <input
          className="gc-input"
          type="date"
          value={from.toISOString().slice(0, 10)}
          onChange={(e) => onChange([new Date(e.target.value + 'T00:00:00'), to])}
        />
      </label>
      <label className="gc-field">
        <span className="gc-field__label">To</span>
        <input
          className="gc-input"
          type="date"
          value={to.toISOString().slice(0, 10)}
          onChange={(e) => onChange([from, new Date(e.target.value + 'T23:59:59')])}
        />
      </label>
    </div>
  )
}
