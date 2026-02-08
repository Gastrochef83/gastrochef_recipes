import { useEffect, useState } from 'react'
import KPI from '../components/KPI'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [recipes, setRecipes] = useState(0)
  const [ingredients, setIngredients] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { count: rc } = await supabase.from('recipes').select('*', { count: 'exact', head: true })
      const { count: ic } = await supabase.from('ingredients').select('*', { count: 'exact', head: true })
      setRecipes(rc ?? 0)
      setIngredients(ic ?? 0)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm font-semibold tracking-wide text-neutral-500">DASHBOARD</div>
        <div className="mt-1 text-2xl font-semibold">Overview</div>
        <div className="mt-2 text-sm text-neutral-600">Starter KPIs (expand with charts later).</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KPI label="Recipes" value={String(recipes)} />
        <KPI label="Ingredients" value={String(ingredients)} />
        <KPI label="Avg Food Cost %" value="—" />
      </div>
    </div>
  )
}
