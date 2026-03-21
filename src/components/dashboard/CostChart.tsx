import React from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

export default function CostChart({ data }: { data: any[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data ?? []}>
          <XAxis dataKey="created_at" hide />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="total_cost" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
