import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type AppMode = 'kitchen' | 'mgmt'

type ModeCtx = {
  mode: AppMode
  setMode: (m: AppMode) => void
  toggle: () => void
  isKitchen: boolean
  isMgmt: boolean
}

const ModeContext = createContext<ModeCtx | null>(null)

const STORAGE_KEY = 'gc_mode'

function readStoredMode(): AppMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'mgmt' || v === 'kitchen' ? v : 'kitchen'
  } catch {
    return 'kitchen'
  }
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('kitchen')

  useEffect(() => {
    setModeState(readStoredMode())
  }, [])

  const setMode = (m: AppMode) => {
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {}
  }

  const toggle = () => setMode(mode === 'kitchen' ? 'mgmt' : 'kitchen')

  // Optional: put a data attribute on <html> for mode-based styling later
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-gc-mode', mode)
    } catch {}
  }, [mode])

  const value = useMemo<ModeCtx>(
    () => ({
      mode,
      setMode,
      toggle,
      isKitchen: mode === 'kitchen',
      isMgmt: mode === 'mgmt',
    }),
    [mode]
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used within ModeProvider')
  return ctx
}

export function ModePill() {
  const { mode, setMode } = useMode()

  return (
    <div className="gc-mode-pill">
      <div className="text-xs font-extrabold text-neutral-500">Mode</div>

      <div className="gc-mode-switch">
        <button
          type="button"
          className={mode === 'kitchen' ? 'gc-mode-btn gc-mode-btn-active' : 'gc-mode-btn'}
          onClick={() => setMode('kitchen')}
        >
          Kitchen
        </button>

        <button
          type="button"
          className={mode === 'mgmt' ? 'gc-mode-btn gc-mode-btn-active' : 'gc-mode-btn'}
          onClick={() => setMode('mgmt')}
        >
          Mgmt
        </button>
      </div>
    </div>
  )
}
