import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Ingredient = {
  id: string
  name: string
  category: string | null
  pack_unit: string
  net_unit_cost: number
  is_active: boolean
}

export default function Ingredients() {
  const [rows, setRows] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate ingredient?')) return
    await supabase.from('ingredients')
      .update({ is_active: false })
      .eq('id', id)
    load()
  }

  const filtered = rows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="gc-card p-6 space-y-4">
      <div className="gc-label">INGREDIENTS</div>

      <input
        className="gc-input"
        placeholder="Search ingredient..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? 'Loading...' : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.category}</td>
                <td>{r.pack_unit}</td>
                <td>{r.net_unit_cost}</td>
                <td>
                  <button
                    className="gc-btn gc-btn-ghost"
                    onClick={() => deactivate(r.id)}
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
