import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { loadCookSession, saveCookSession, clearCookSession } from '../lib/cookSession'

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  photo_url: string | null
  description: string | null
  method_steps: string[] | null
  method_step_photos?: string[] | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  currency?: string | null
  selling_price?: number | null
}

type LineType = 'ingredient' | 'subrecipe' | 'group'
type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  note: string | null
  sort_order: number
  line_type: LineType
  group_title: string | null
}

type Ingredient = {
  id: string
  name: string | null
  pack_unit: string | null
}


const draftKey = (rid: string) => `gc_recipe_lines_draft__${rid}`

function readDraftLinesAny(rid: string): any[] {
  try {
    const raw = localStorage.getItem(draftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mergeCookLines(db: Line[], draftAny: any[]): Line[] {
  const byId = new Set((db || []).map((l) => l.id))
  const mapped: Line[] = (draftAny || [])
    .filter((l) => l && l.id && !byId.has(l.id))
    .map((l) => ({
      id: String(l.id),
      recipe_id: String(l.recipe_id || ''),
      ingredient_id: l.ingredient_id ?? null,
      sub_recipe_id: l.sub_recipe_id ?? null,
      qty: toNum(l.qty, 0),
      unit: String(l.unit || 'g'),
      note: (l.notes ?? l.note ?? null) as any,
      sort_order: toNum(l.position ?? l.sort_order, 0),
      line_type: (l.line_type || 'ingredient') as any,
      group_title: (l.group_title ?? null) as any,
    }))
  const merged = [...(db || []), ...mapped]
  merged.sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0))
  return merged
}


function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function normalizeSteps(steps: string[] | null | undefined) {
  return (steps ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
}

function alignPhotos(cleanSteps: string[], photos: string[] | null | undefined) {
  const p = (photos ?? []).map((x) => (x ?? '').trim())
  return cleanSteps.map((_, i) => p[i] ?? '')
}

function fmtQty(q: number) {
  const v = Number.isFinite(q) ? q : 0
  if (Math.abs(v) >= 100) return String(Math.round(v))
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10)
  return String(Math.round(v * 100) / 100)
}

type PrepItem = {
  label: string
  qty: number
  unit: string
  note: string
}

export default function RecipeCookMode() {
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const { isKitchen, isMgmt } = useMode()

  const [loading, setLoading] = useState(true)
  const [recipe, setRecipe] = useState<Recipe | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const [servings, setServings] = useState(1)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [timers, setTimers] = useState<Record<number, number>>({})
  const [prepOpen, setPrepOpen] = useState(false)

  const tickRef = useRef<number | null>(null)

  const load = async (recipeId: string) => {
    setLoading(true)
    try {
      const selectWithPhotos =
        'id,kitchen_id,name,category,portions,photo_url,description,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,currency,selling_price'
      const selectNoPhotos =
        'id,kitchen_id,name,category,portions,photo_url,description,method_steps,calories,protein_g,carbs_g,fat_g,currency,selling_price'

      let r: any = null
      let rErr: any = null

      const res = await supabase.from('recipes').select(selectWithPhotos).eq('id', recipeId).single()
      r = res.data
      rErr = res.error

      if (rErr && String(rErr.message || '').toLowerCase().includes('method_step_photos')) {
        const res2 = await supabase.from('recipes').select(selectNoPhotos).eq('id', recipeId).single()
        r = res2.data
        rErr = res2.error
      }
      if (rErr) throw rErr

      const rr = r as Recipe
      setRecipe(rr)

      // load lines
      const { data: l, error: lErr } = await supabase
        .from('recipe_lines')
        .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
        .eq('recipe_id', recipeId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      if (lErr) throw lErr
      const draft = readDraftLinesAny(recipeId)
      const merged = draft?.length ? mergeCookLines((l ?? []) as Line[], draft) : ((l ?? []) as Line[])
      setLines(merged as Line[])

      // load ingredients (for labels)
      const { data: i, error: iErr } = await supabase.from('ingredients').select('id,name,pack_unit').order('name', { ascending: true })
      if (iErr) throw iErr
      setIngs((i ?? []) as Ingredient[])

      // restore session
      const sess = loadCookSession(recipeId)
      const base = Math.max(1, toNum(rr.portions, 1))
      setServings(sess?.servings && sess.servings > 0 ? sess.servings : base)
      setChecked(sess?.checkedSteps ?? {})
      setTimers(sess?.timers ?? {})
    } catch (e: any) {
      showToast(e?.message ?? 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) {
      setLoading(false)
      showToast('Missing recipe id (?id=...)')
      return
    }
    load(id).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const basePortions = Math.max(1, toNum(recipe?.portions, 1))
  const scale = servings / basePortions

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ings) m.set(i.id, i)
    return m
  }, [ings])

  const cleanSteps = useMemo(() => normalizeSteps(recipe?.method_steps), [recipe?.method_steps])
  const stepPhotos = useMemo(() => alignPhotos(cleanSteps, recipe?.method_step_photos), [cleanSteps, recipe?.method_step_photos])

  // persist session (servings/checked/timers)
  useEffect(() => {
    if (!id) return
    saveCookSession(id, { servings, checkedSteps: checked, timers })
  }, [id, servings, checked, timers])

  // timer tick
  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      setTimers((prev) => {
        let changed = false
        const next: Record<number, number> = { ...prev }
        for (const k of Object.keys(next)) {
          const idx = Number(k)
          const v = toNum(next[idx], 0)
          if (v > 0) {
            next[idx] = v - 1
            changed = true
          }
          if (next[idx] <= 0) next[idx] = 0
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const toggleStep = (idx: number) => setChecked((p) => ({ ...p, [idx]: !p[idx] }))

  const setTimerPreset = (idx: number, minutes: number) => {
    setTimers((p) => ({ ...p, [idx]: Math.max(0, Math.floor(minutes * 60)) }))
  }

  const print = () => window.print()

  const resetSession = () => {
    if (!id) return
    clearCookSession(id)
    setChecked({})
    setTimers({})
    setPrepOpen(false)
    // keep servings as-is
    showToast('Cook session cleared ✅')
  }

  const prepList = useMemo(() => {
    // Only ingredient lines (no subrecipe expansion here to keep it fast + no logic change)
    const items: PrepItem[] = []
    for (const l of lines) {
      if (l.line_type !== 'ingredient') continue
      if (!l.ingredient_id) continue
      const ing = ingById.get(l.ingredient_id)
      const label = ing?.name ?? 'Ingredient'
      const qtyScaled = Math.max(0, toNum(l.qty, 0) * scale)
      items.push({
        label,
        qty: qtyScaled,
        unit: safeUnit(l.unit),
        note: (l.note ?? '').trim(),
      })
    }

    // group by label+unit+note
    const m = new Map<string, PrepItem>()
    for (const it of items) {
      const key = `${it.label}__${it.unit}__${it.note}`
      const cur = m.get(key)
      if (!cur) m.set(key, { ...it })
      else m.set(key, { ...cur, qty: cur.qty + it.qty })
    }

    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [lines, ingById, scale])

  if (loading) return <div className="gc-card p-6">Loading cook mode…</div>

  if (!recipe) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">NOT FOUND</div>
        <div className="text-sm text-neutral-600">Recipe not found.</div>
        <NavLink className="gc-btn gc-btn-primary" to="/recipes">
          Back to Recipes
        </NavLink>
      </div>
    )
  }

  return (
    <div className="gc-cook-wrap space-y-6">
      <div className="gc-card p-6 gc-print-surface">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
              {recipe.photo_url ? (
                <img src={recipe.photo_url} alt={recipe.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">No Photo</div>
              )}
            </div>

            <div className="min-w-[min(640px,92vw)]">
              <div className="gc-label">COOK MODE — PRO</div>
              <div className="mt-2 text-2xl font-extrabold">{recipe.name}</div>

              <div className="mt-2 text-sm text-neutral-600">
                {recipe.description?.trim() ? recipe.description : 'Add a premium description in the editor…'}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="gc-kpi">
                  <div className="gc-kpi-label">Base Portions</div>
                  <div className="gc-kpi-value">{basePortions}</div>
                </div>
                <div className="gc-kpi">
                  <div className="gc-kpi-label">Servings Now</div>
                  <div className="gc-kpi-value">{servings}</div>
                </div>
                <div className="gc-kpi">
                  <div className="gc-kpi-label">Scale</div>
                  <div className="gc-kpi-value">x {Math.round(scale * 100) / 100}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="gc-label">SERVINGS</div>
                <div className="mt-2 flex items-center gap-3">
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setServings((v) => Math.max(1, v - 1))}>
                    −
                  </button>
                  <input
                    className="gc-input w-[120px] text-center"
                    type="number"
                    min={1}
                    step="1"
                    value={servings}
                    onChange={(e) => setServings(Math.max(1, toNum(e.target.value, 1)))}
                  />
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setServings((v) => v + 1)}>
                    +
                  </button>
                  <input
                    className="gc-range"
                    type="range"
                    min={1}
                    max={Math.max(10, basePortions * 6)}
                    value={servings}
                    onChange={(e) => setServings(Math.max(1, toNum(e.target.value, 1)))}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(recipe.calories != null || recipe.protein_g != null || recipe.carbs_g != null || recipe.fat_g != null) && (
                  <>
                    {recipe.calories != null ? <span className="gc-chip">{recipe.calories} kcal</span> : null}
                    {recipe.protein_g != null ? <span className="gc-chip">P {toNum(recipe.protein_g, 0)}g</span> : null}
                    {recipe.carbs_g != null ? <span className="gc-chip">C {toNum(recipe.carbs_g, 0)}g</span> : null}
                    {recipe.fat_g != null ? <span className="gc-chip">F {toNum(recipe.fat_g, 0)}g</span> : null}
                  </>
                )}

                {isMgmt && recipe.selling_price != null ? (
                  <span className="gc-chip gc-chip-dark">
                    Price {toNum(recipe.selling_price, 0)} {(recipe.currency ?? 'USD').toUpperCase()}
                  </span>
                ) : null}

                {isKitchen ? <span className="gc-chip">Kitchen view</span> : <span className="gc-chip">Mgmt view</span>}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <NavLink className="gc-btn gc-btn-primary" to={`/recipe?id=${recipe.id}`}>
                  Back to Editor
                </NavLink>
                <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setPrepOpen((v) => !v)}>
                  Prep List
                </button>
                <button className="gc-btn gc-btn-ghost" type="button" onClick={print}>
                  Print A4
                </button>
                <button className="gc-btn gc-btn-ghost" type="button" onClick={resetSession}>
                  Reset
                </button>
                <NavLink className="gc-btn gc-btn-ghost" to="/recipes">
                  Recipes
                </NavLink>
              </div>
            </div>
          </div>
        </div>



            {/* ===== INGREDIENTS (SCALED) — ALWAYS VISIBLE ===== */}
            {prepList.length > 0 && (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="gc-label">INGREDIENTS (SCALED)</div>
                    <div className="text-xs text-neutral-500">Updates automatically when you change servings.</div>
                  </div>
                  <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setPrepOpen(true)}>
                    Open Full Prep List
                  </button>
                </div>

                <div className="mt-3 grid gap-2">
                  {prepList.slice(0, 10).map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-neutral-900">{it.label}</div>
                        {it.note ? <div className="truncate text-xs text-neutral-500">{it.note}</div> : null}
                      </div>
                      <div className="shrink-0 font-bold tabular-nums text-neutral-900">
                        {fmtQty(it.qty)} {it.unit}
                      </div>
                    </div>
                  ))}
                </div>

                {prepList.length > 10 ? (
                  <div className="mt-2 text-xs text-neutral-500">Showing 10 of {prepList.length} items.</div>
                ) : null}
              </div>
            )}

        {prepOpen && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="gc-label">PREP LIST (SCALED)</div>
                <div className="text-xs text-neutral-500">Ingredient-only list · scaled by servings.</div>
              </div>
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setPrepOpen(false)}>
                Close
              </button>
            </div>

            {prepList.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-600">No ingredient lines yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {prepList.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate">{it.label}</div>
                      {it.note ? <div className="text-xs text-neutral-500 truncate">{it.note}</div> : null}
                    </div>
                    <div className="text-sm font-extrabold">
                      {fmtQty(it.qty)} {it.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="gc-card p-6 gc-print-surface">
        <div className="gc-label">STEPS</div>

        {cleanSteps.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-600">No steps yet. Add steps in the editor.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {cleanSteps.map((s, idx) => {
              const photo = (stepPhotos[idx] ?? '').trim()
              const done = checked[idx] === true
              const t = toNum(timers[idx], 0)

              const mm = Math.floor(t / 60)
              const ss = t % 60
              const timerLabel = t > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '—'

              return (
                <div key={idx} className={`gc-step ${done ? 'gc-step-done' : ''}`}>
                  <button type="button" className="gc-step-check" onClick={() => toggleStep(idx)} aria-label={`Toggle step ${idx + 1}`}>
                    <span className="gc-step-dot" />
                  </button>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="gc-step-title">Step {idx + 1}</div>

                      <div className="flex flex-wrap items-center gap-2">
                        {done ? <span className="gc-chip gc-chip-dark">Done</span> : <span className="gc-chip">Todo</span>}

                        <span className="gc-chip">Timer {timerLabel}</span>

                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setTimerPreset(idx, 1)}>
                          +1m
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setTimerPreset(idx, 5)}>
                          +5m
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setTimerPreset(idx, 10)}>
                          +10m
                        </button>
                        <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setTimers((p) => ({ ...p, [idx]: 0 }))}>
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-neutral-800 leading-relaxed">{s}</div>

                    {photo ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                        <img src={photo} alt={`Step ${idx + 1}`} className="w-full max-h-[320px] object-cover" />
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}
