// src/components/OnboardingWizard.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKitchen } from '../lib/kitchen'
import { seedDemoData } from '../lib/demoSeed'

type Step = 1 | 2 | 3

const LS_KEY = 'gc_onboarding_done_v1'

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export default function OnboardingWizard() {
  const nav = useNavigate()
  const k = useKitchen()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const kitchenReady = !!k.kitchenId && !k.loading && !k.error

  const done = useMemo(() => {
    if (!canUseLocalStorage()) return false
    return localStorage.getItem(LS_KEY) === '1'
  }, [])

  useEffect(() => {
    if (!kitchenReady) return
    if (done) return
    // First run wizard: open once per browser
    setOpen(true)
  }, [kitchenReady, done])

  const close = () => {
    setOpen(false)
    if (canUseLocalStorage()) {
      try {
        localStorage.setItem(LS_KEY, '1')
      } catch {}
    }
  }

  const go = (path: string) => {
    setOpen(false)
    nav(path)
  }

  const doSeed = async () => {
    if (!k.kitchenId) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await seedDemoData(k.kitchenId)
      if (r.skipped) setMsg('Demo data already exists ✅')
      else setMsg(`Loaded demo data ✅ (${r.createdIngredients} ingredients, ${r.createdRecipes} recipes)`)
      setStep(3)
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load demo data')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={close} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="p-6">
          <div className="gc-label">FIRST RUN — QUICK SETUP</div>
          <div className="mt-2 text-2xl font-extrabold">Make GastroChef feel ready in 2 minutes</div>
          <div className="mt-2 text-sm text-neutral-600">No logic changes. Just setup + demo data + your first recipe.</div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Step 1 — Preferences</div>
                  <div className="mt-1 text-xs text-neutral-600">Set default currency and basic settings.</div>
                </div>
                <button className="gc-btn gc-btn-primary" type="button" onClick={() => go('/settings')} disabled={!kitchenReady}>
                  Open Settings
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Step 2 — Load Demo Data</div>
                  <div className="mt-1 text-xs text-neutral-600">Ingredients + recipes + recipe lines (safe seed).</div>
                </div>
                <button className="gc-btn" type="button" onClick={doSeed} disabled={!kitchenReady || busy}>
                  {busy ? 'Loading…' : 'Load Demo'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">Step 3 — Create your first recipe</div>
                  <div className="mt-1 text-xs text-neutral-600">We’ll create a blank recipe and open the editor.</div>
                </div>
                <button className="gc-btn gc-btn-primary" type="button" onClick={() => go('/recipes?create=1')} disabled={!kitchenReady}>
                  Create Recipe
                </button>
              </div>
            </div>

            {msg ? <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{msg}</div> : null}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button className="gc-btn" type="button" onClick={close}>
              Skip for now
            </button>

            <div className="text-xs text-neutral-500">
              Kitchen: <span className="font-semibold text-neutral-700">{k.kitchenName || '—'}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          <div className="text-xs text-neutral-600">
            Tip: In Recipe Editor, open the <span className="font-semibold">Tour</span> to learn Cook Mode + Print + Cost tracking.
          </div>
        </div>
      </div>
    </div>
  )
}
