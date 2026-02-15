import { useEffect, useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'

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

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSteps(steps: string[] | null | undefined) {
  return (steps ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
}

function alignPhotos(cleanSteps: string[], photos: string[] | null | undefined) {
  const p = (photos ?? []).map((x) => (x ?? '').trim())
  return cleanSteps.map((_, i) => p[i] ?? '')
}

export default function RecipeCookMode() {
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const { isKitchen, isMgmt } = useMode()

  const [loading, setLoading] = useState(true)
  const [recipe, setRecipe] = useState<Recipe | null>(null)

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const [servings, setServings] = useState(1)
  const [checked, setChecked] = useState<Record<number, boolean>>({})

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
      setServings(Math.max(1, toNum(rr.portions, 1)))

      // Reset checks when recipe changes
      setChecked({})
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

  const cleanSteps = useMemo(() => normalizeSteps(recipe?.method_steps), [recipe?.method_steps])
  const stepPhotos = useMemo(() => alignPhotos(cleanSteps, recipe?.method_step_photos), [cleanSteps, recipe?.method_step_photos])

  const toggleStep = (idx: number) => setChecked((p) => ({ ...p, [idx]: !p[idx] }))

  const print = () => {
    // print only main area; CSS @media print handles hiding sidebar
    window.print()
  }

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

              {/* Slider */}
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

              {/* Nutrition / Pricing visibility based on mode */}
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
                <button className="gc-btn gc-btn-ghost" type="button" onClick={print}>
                  Print A4
                </button>
                <NavLink className="gc-btn gc-btn-ghost" to="/recipes">
                  Recipes
                </NavLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="gc-card p-6 gc-print-surface">
        <div className="gc-label">STEPS</div>

        {cleanSteps.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-600">No steps yet. Add steps in the editor.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {cleanSteps.map((s, idx) => {
              const photo = (stepPhotos[idx] ?? '').trim()
              const done = checked[idx] === true

              return (
                <div key={idx} className={`gc-step ${done ? 'gc-step-done' : ''}`}>
                  <button type="button" className="gc-step-check" onClick={() => toggleStep(idx)} aria-label={`Toggle step ${idx + 1}`}>
                    <span className="gc-step-dot" />
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="gc-step-title">Step {idx + 1}</div>
                      <div className="gc-step-badges">
                        {done ? <span className="gc-chip gc-chip-dark">Done</span> : <span className="gc-chip">Todo</span>}
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
