import React from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

export default function TimelineChart({ data }: { data: any[] }) {
  const normalized = (data ?? []).map((d) => ({
    ...d,
    x: d.created_at ?? d.date,
    y: Number(d.total_cost ?? d.cost ?? 0)
  }))

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={normalized}>
          <XAxis dataKey="x" hide />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="y" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
