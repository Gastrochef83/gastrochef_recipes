import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'

type Recipe = {
  id: string
  name: string
  category: string | null
  portions: number
  yield_qty: number | null
  yield_unit: string | null
  is_subrecipe: boolean
  is_archived: boolean
}

type Line = {
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
}

type Ingredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function safeUnit(u: string) {
  const x = (u ?? '').trim().toLowerCase()
  return x || 'g'
}

function unitFamily(u: string) {
  const x = safeUnit(u)
  if (x === 'g' || x === 'kg') return 'mass'
  if (x === 'ml' || x === 'l') return 'volume'
  if (x === 'pcs') return 'count'
  if (x === 'portion') return 'portion'
  return 'other'
}

function convertQty(qty: number, fromUnit: string, toUnit: string) {
  const from = safeUnit(fromUnit)
  const to = safeUnit(toUnit)
  if (from === to) return { ok: true, value: qty }

  const ff = unitFamily(from)
  const tf = unitFamily(to)
  if (ff !== tf) return { ok: false, value: qty }

  if (ff === 'mass') {
    if (from === 'g' && to === 'kg') return { ok: true, value: qty / 1000 }
    if (from === 'kg' && to === 'g') return { ok: true, value: qty * 1000 }
  }
  if (ff === 'volume') {
    if (from === 'ml' && to === 'l') return { ok: true, value: qty / 1000 }
    if (from === 'l' && to === 'ml') return { ok: true, value: qty * 1000 }
  }
  return { ok: true, value: qty }
}

// Simple CSV parser (comma-separated, no quoted commas). Enough for clean exports.
function parseCsv(text: string) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return { headers: [], rows: [] as Record<string, string>[] }

  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ''))
    return obj
  })

  return { headers, rows }
}

export default function Recipes() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Import modal
  const [importOpen, setImportOpen] = useState(false)
  const [importType, setImportType] = useState<'ingredients' | 'recipes' | 'lines'>('ingredients')
  const [importBusy, setImportBusy] = useState(false)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data: rData, error: rErr } = await supabase
        .from('recipes')
        .select('id,name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived')
        .order('name', { ascending: true })
      if (rErr) throw rErr

      const { data: lData, error: lErr } = await supabase
        .from('recipe_lines')
        .select('recipe_id,ingredient_id,sub_recipe_id,qty,unit')
      if (lErr) throw lErr

      const { data: iData, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit,net_unit_cost,is_active')
      if (iErr) throw iErr

      setRecipes((rData ?? []) as Recipe[])
      setLines((lData ?? []) as Line[])
      setIngredients((iData ?? []) as Ingredient[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])

  // Cost engine with sub-recipes (iterate until stable)
  const recipeTotalCost = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of recipes) totals.set(r.id, 0)

    const maxPass = 10
    for (let pass = 0; pass < maxPass; pass++) {
      let changed = false

      for (const r of recipes) {
        // compute total from its lines
        const rLines = lines.filter((l) => l.recipe_id === r.id)
        let sum = 0

        for (const l of rLines) {
          const qty = toNum(l.qty, 0)

          // ingredient line
          if (l.ingredient_id) {
            const ing = ingById.get(l.ingredient_id)
            const packUnit = safeUnit(ing?.pack_unit ?? 'g')
            const net = toNum(ing?.net_unit_cost, 0)
            const conv = convertQty(qty, l.unit, packUnit)
            sum += conv.value * net
            continue
          }

          // sub-recipe line
          if (l.sub_recipe_id) {
            const sub = recipeById.get(l.sub_recipe_id)
            const subTotal = totals.get(l.sub_recipe_id) ?? 0
            const u = safeUnit(l.unit)

            if (sub) {
              const subPortions = Math.max(1, toNum(sub.portions, 1))
              const cpp = subTotal / subPortions

              if (u === 'portion') {
                sum += qty * cpp
                continue
              }

              const yq = toNum(sub.yield_qty, 0)
              const yu = safeUnit(sub.yield_unit ?? '')
              if (yq > 0 && yu) {
                const costPerYieldUnit = subTotal / yq
                const conv = convertQty(qty, l.unit, yu)
                sum += conv.value * costPerYieldUnit
                continue
              }

              // fallback
              sum += qty * cpp
              continue
            }

            // unknown sub-recipe
            sum += 0
          }
        }

        const prev = totals.get(r.id) ?? 0
        if (Math.abs(prev - sum) > 1e-9) {
          totals.set(r.id, sum)
          changed = true
        }
      }

      if (!changed) break
    }

    return totals
  }, [recipes, lines, ingById, recipeById])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return recipes
      .filter((r) => (showArchived ? true : !r.is_archived))
      .filter((r) => !s || r.name.toLowerCase().includes(s) || (r.category ?? '').toLowerCase().includes(s))
  }, [recipes, search, showArchived])

  const openEditor = (id: string) => {
    window.location.href = `/#/recipe-editor?id=${id}`
  }

  const toggleArchive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('recipes').update({ is_archived: next }).eq('id', id)
    if (error) return showToast(error.message)
    showToast(next ? 'Recipe archived ✅' : 'Recipe restored ✅')
    await load()
  }

  const onImportFile = async (file: File) => {
    setImportBusy(true)
    try {
      const text = await file.text()
      const { rows } = parseCsv(text)
      if (rows.length === 0) {
        showToast('CSV is empty.')
        setImportBusy(false)
        return
      }

      if (importType === 'ingredients') {
        // expected columns: name,category,supplier,pack_size,pack_unit,pack_price,net_unit_cost,is_active
        const payload = rows.map((r) => ({
          name: r.name,
          category: r.category || null,
          supplier: r.supplier || null,
          pack_size: r.pack_size ? toNum(r.pack_size, 1) : 1,
          pack_unit: r.pack_unit || 'g',
          pack_price: r.pack_price ? toNum(r.pack_price, 0) : 0,
          net_unit_cost: r.net_unit_cost ? toNum(r.net_unit_cost, 0) : 0,
          is_active: r.is_active === '' ? true : r.is_active.toLowerCase() !== 'false',
        }))
        const { error } = await supabase.from('ingredients').insert(payload)
        if (error) throw error
        showToast(`Imported ingredients: ${payload.length} ✅`)
      }

      if (importType === 'recipes') {
        // expected columns: name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,description,method
        const payload = rows.map((r) => ({
          name: r.name,
          category: r.category || null,
          portions: Math.max(1, toNum(r.portions, 1)),
          yield_qty: r.yield_qty === '' ? null : toNum(r.yield_qty, 0),
          yield_unit: r.yield_unit || null,
          is_subrecipe: (r.is_subrecipe || '').toLowerCase() === 'true',
          is_archived: (r.is_archived || '').toLowerCase() === 'true',
          description: r.description || null,
          method: r.method || null,
        }))
        const { error } = await supabase.from('recipes').insert(payload)
        if (error) throw error
        showToast(`Imported recipes: ${payload.length} ✅`)
      }

      if (importType === 'lines') {
        // expected columns: recipe_id,ingredient_id,sub_recipe_id,qty,unit
        const payload = rows.map((r) => ({
          recipe_id: r.recipe_id,
          ingredient_id: r.ingredient_id || null,
          sub_recipe_id: r.sub_recipe_id || null,
          qty: toNum(r.qty, 0),
          unit: r.unit || 'g',
        }))
        const { error } = await supabase.from('recipe_lines').insert(payload)
        if (error) throw error
        showToast(`Imported recipe lines: ${payload.length} ✅`)
      }

      setImportOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Import failed')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="gc-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="gc-label">RECIPES (UPGRADE D)</div>
            <div className="mt-2 text-2xl font-extrabold">Library</div>
            <div className="mt-2 text-sm text-neutral-600">Sub-recipe costing + Unit conversion + CSV import.</div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>

            <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setImportOpen(true)}>
              Import CSV
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="gc-label">SEARCH</div>
          <input className="gc-input mt-2 w-full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipe name or category…" />
        </div>
      </div>

      {loading && <div className="gc-card p-6">Loading…</div>}
      {err && (
        <div className="gc-card p-6">
          <div className="gc-label">ERROR</div>
          <div className="mt-2 text-sm text-red-600">{err}</div>
        </div>
      )}

      {!loading && !err && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => {
            const total = recipeTotalCost.get(r.id) ?? 0
            const portions = Math.max(1, toNum(r.portions, 1))
            const cpp = total / portions
            return (
              <div key={r.id} className="gc-card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold">{r.name}</div>
                    <div className="mt-1 text-sm text-neutral-600">{r.category ?? '—'} · Portions: {portions}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.is_subrecipe && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">Sub-Recipe</span>}
                      {r.is_archived && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">Archived</span>}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="gc-label">TOTAL COST</div>
                    <div className="mt-1 text-xl font-extrabold">{money(total)}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Cost/portion: <span className="font-semibold">{money(cpp)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="gc-btn gc-btn-primary" type="button" onClick={() => openEditor(r.id)}>
                    Open Editor
                  </button>

                  {!r.is_archived ? (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleArchive(r.id, true)}>
                      Archive
                    </button>
                  ) : (
                    <button className="gc-btn gc-btn-ghost" type="button" onClick={() => toggleArchive(r.id, false)}>
                      Restore
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Import modal (simple) */}
      {importOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setImportOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[min(780px,92vw)] -translate-x-1/2 -translate-y-1/2">
            <div className="gc-card p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="gc-label">IMPORT</div>
                  <div className="mt-1 text-xl font-extrabold">Import CSV</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    Use clean CSV (comma separated). No quoted commas.
                  </div>
                </div>
                <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setImportOpen(false)}>
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="gc-label">TYPE</div>
                  <select className="gc-input mt-2 w-full" value={importType} onChange={(e) => setImportType(e.target.value as any)}>
                    <option value="ingredients">Ingredients</option>
                    <option value="recipes">Recipes</option>
                    <option value="lines">Recipe Lines</option>
                  </select>

                  <div className="mt-3 text-xs text-neutral-600">
                    <div className="font-semibold">Expected columns:</div>
                    {importType === 'ingredients' && (
                      <div>name,category,supplier,pack_size,pack_unit,pack_price,net_unit_cost,is_active</div>
                    )}
                    {importType === 'recipes' && (
                      <div>name,category,portions,yield_qty,yield_unit,is_subrecipe,is_archived,description,method</div>
                    )}
                    {importType === 'lines' && (
                      <div>recipe_id,ingredient_id,sub_recipe_id,qty,unit</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="gc-label">CSV FILE</div>
                  <input
                    className="gc-input mt-2 w-full"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={importBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onImportFile(f)
                    }}
                  />
                  <div className="mt-2 text-xs text-neutral-500">
                    When you pick a file, import starts immediately.
                  </div>
                  {importBusy && <div className="mt-2 text-sm">Importing…</div>}
                </div>
              </div>

              <div className="mt-4 text-xs text-neutral-500">
                Tip: For sub-recipe lines, set unit = <b>portion</b> and qty = number of portions used.
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
