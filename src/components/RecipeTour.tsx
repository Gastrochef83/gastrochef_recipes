// src/components/RecipeTour.tsx
import { useMemo } from 'react'

const LS_KEY = 'gc_recipe_tour_done_v1'

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function hasSeenRecipeTour() {
  if (!canUseLocalStorage()) return false
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

export function markRecipeTourDone() {
  if (!canUseLocalStorage()) return
  try {
    localStorage.setItem(LS_KEY, '1')
  } catch {}
}

export default function RecipeTour(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props

  const steps = useMemo(
    () => [
      {
        title: '1) Lines (Ingredients / Sub-recipes)',
        body: 'Add ingredients, group them, and keep notes. Your costing updates live as you edit.'
      },
      {
        title: '2) Yield & Net vs Gross',
        body: 'Use Yield % to auto-calculate Gross Qty. You can override Gross if needed — the app keeps your math consistent.'
      },
      {
        title: '3) Cook Mode',
        body: 'Switch to Cook Mode for a clean, kitchen-friendly view. Perfect for service execution.'
      },
      {
        title: '4) Print Card',
        body: 'Use Print Preview to generate a clean card. If you need auto-print, use the Print button.'
      },
      {
        title: '5) Cost Timeline',
        body: 'Save cost snapshots over time to track ingredient price changes and menu decisions.'
      }
    ],
    []
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="p-6">
          <div className="gc-label">GUIDED TOUR</div>
          <div className="mt-2 text-2xl font-extrabold">Recipe Editor — Quick Tour</div>
          <div className="mt-2 text-sm text-neutral-600">This is a UX guide only. No data changes are made.</div>

          <div className="mt-5 grid gap-3">
            {steps.map((s) => (
              <div key={s.title} className="rounded-xl border border-neutral-200 p-4">
                <div className="text-sm font-extrabold">{s.title}</div>
                <div className="mt-1 text-sm text-neutral-600">{s.body}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button className="gc-btn" type="button" onClick={onClose}>
              Close
            </button>
            <button
              className="gc-btn gc-btn-primary"
              type="button"
              onClick={() => {
                markRecipeTourDone()
                onClose()
              }}
            >
              Don’t show again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
