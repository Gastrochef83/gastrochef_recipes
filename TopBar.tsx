export default function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
