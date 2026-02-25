export default function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="gc-kpi-card">
      <div className="gc-kpi-label">{label}</div>
      <div className="gc-kpi-value">{value}</div>
    </div>
  )
}
