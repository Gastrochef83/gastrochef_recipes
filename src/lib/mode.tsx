// src/lib/mode.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type AppMode = 'kitchen' | 'mgmt'

type ModeCtx = {
  mode: AppMode
  setMode: (m: AppMode) => void
  toggleMode: () => void
  isKitchen: boolean
  isMgmt: boolean
}

const ModeContext = createContext<ModeCtx | null>(null)

const KEY = 'gc_mode_v1'

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('kitchen')

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(KEY) || '').toLowerCase()
      if (saved === 'kitchen' || saved === 'mgmt') setModeState(saved)
    } catch {}
  }, [])

  const setMode = (m: AppMode) => {
    setModeState(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {}
  }

  const toggleMode = () => setMode(mode === 'kitchen' ? 'mgmt' : 'kitchen')

  const value = useMemo<ModeCtx>(() => {
    return {
      mode,
      setMode,
      toggleMode,
      isKitchen: mode === 'kitchen',
      isMgmt: mode === 'mgmt',
    }
  }, [mode])

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>')
  return ctx
}
