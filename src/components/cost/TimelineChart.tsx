import React from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export default function TimelineChart({ data }: { data: any[] }) {
  const chartData = (data || []).map(d => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString()
  }))

  return (
    <div style={{ width: '100%', height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="dateLabel" minTickGap={24} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="cost" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
