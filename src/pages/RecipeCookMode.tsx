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

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSteps(steps: string[] | null | undefined) {
  return (steps ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
}

export default function RecipeCookMode() {

  const [sp] = useSearchParams()
  const id = sp.get('id')

  const { isKitchen } = useMode()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)

  const [servings, setServings] = useState(1)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [timers, setTimers] = useState<Record<number, number>>({})

  const tickRef = useRef<number | null>(null)

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const load = async (rid: string) => {

    setLoading(true)

    try {

      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', rid)
        .single()

      if (error) throw error

      const r = data as Recipe

      setRecipe(r)

      const sess = loadCookSession(rid)

      const base = Math.max(1, toNum(r.portions, 1))

      setServings(sess?.servings || base)
      setChecked(sess?.checkedSteps ?? {})
      setTimers(sess?.timers ?? {})

    } catch (e: any) {

      showToast(e?.message ?? 'Load failed')

    } finally {

      setLoading(false)

    }

  }

  useEffect(() => {

    if (!id) return

    load(id)

  }, [id])

  useEffect(() => {

    if (!id) return

    saveCookSession(id, {
      servings,
      checkedSteps: checked,
      timers
    })

  }, [servings, checked, timers])

  useEffect(() => {

    if (tickRef.current) window.clearInterval(tickRef.current)

    tickRef.current = window.setInterval(() => {

      setTimers((prev) => {

        const next: any = { ...prev }

        for (const k of Object.keys(next)) {

          if (next[k] > 0) next[k] = next[k] - 1

        }

        return next

      })

    }, 1000)

    return () => {

      if (tickRef.current) window.clearInterval(tickRef.current)

    }

  }, [])

  const steps = useMemo(
    () => normalizeSteps(recipe?.method_steps),
    [recipe?.method_steps]
  )

  const toggleStep = (idx: number) => {

    setChecked((p) => ({
      ...p,
      [idx]: !p[idx]
    }))

  }

  const setTimer = (idx: number, minutes: number) => {

    setTimers((p) => ({
      ...p,
      [idx]: minutes * 60
    }))

  }

  const resetSession = () => {

    if (!id) return

    clearCookSession(id)

    setChecked({})
    setTimers({})

    showToast('Session reset')

  }

  if (loading) {

    return <div className="gc-card p-6">Loading cook mode…</div>

  }

  if (!recipe) {

    return (
      <div className="gc-card p-6">
        Recipe not found
      </div>
    )

  }

  return (

    <div className="space-y-6">

      <div className="gc-card p-6">

        <div className="flex gap-6">

          <div className="h-28 w-28 overflow-hidden rounded-2xl border">

            {recipe.photo_url ? (
              <img
                src={recipe.photo_url}
                className="h-full w-full object-cover"
              />
            ) : null}

          </div>

          <div className="flex-1">

            <div className="text-sm text-neutral-500">
              COOK MODE
            </div>

            <div className="text-3xl font-bold">
              {recipe.name}
            </div>

            <div className="mt-2 text-neutral-600">
              {recipe.description}
            </div>

            <div className="mt-4 flex gap-3">

              <button
                className="gc-btn gc-btn-ghost"
                onClick={() => setServings((v) => Math.max(1, v - 1))}
              >
                -
              </button>

              <div className="text-xl font-bold">
                {servings}
              </div>

              <button
                className="gc-btn gc-btn-ghost"
                onClick={() => setServings((v) => v + 1)}
              >
                +
              </button>

              <button
                className="gc-btn gc-btn-ghost"
                onClick={resetSession}
              >
                Reset
              </button>

            </div>

          </div>

        </div>

      </div>

      <div className="gc-card p-6">

        <div className="gc-label">
          STEPS
        </div>

        <div className="space-y-4 mt-4">

          {steps.map((s, idx) => {

            const done = checked[idx]

            const t = timers[idx] || 0

            const mm = Math.floor(t / 60)
            const ss = t % 60

            return (

              <div
                key={idx}
                className={`p-4 rounded-2xl border ${done ? 'bg-green-50' : 'bg-white'}`}
              >

                <div className="flex justify-between items-center">

                  <div className="font-bold">
                    Step {idx + 1}
                  </div>

                  <div className="flex gap-2">

                    <button
                      className="gc-btn gc-btn-ghost"
                      onClick={() => setTimer(idx, 1)}
                    >
                      +1m
                    </button>

                    <button
                      className="gc-btn gc-btn-ghost"
                      onClick={() => setTimer(idx, 5)}
                    >
                      +5m
                    </button>

                    <button
                      className="gc-btn gc-btn-ghost"
                      onClick={() => toggleStep(idx)}
                    >
                      {done ? 'Undo' : 'Done'}
                    </button>

                  </div>

                </div>

                <div className="mt-2">
                  {s}
                </div>

                <div className="mt-2 text-sm text-neutral-500">
                  Timer: {mm}:{String(ss).padStart(2, '0')}
                </div>

              </div>

            )

          })}

        </div>

      </div>

      <Toast
        open={toastOpen}
        message={toastMsg}
        onClose={() => setToastOpen(false)}
      />

    </div>

  )

}
