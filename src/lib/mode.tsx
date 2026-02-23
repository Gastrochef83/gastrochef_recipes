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

// ✅ Use one consistent key everywhere (AppLayout clear caches, etc.)
const KEY = 'gc-mode'

function normalizeMode(x: any): AppMode | null {
  const v = String(x ?? '').trim().toLowerCase()
  if (v === 'kitchen' || v === 'mgmt') return v
  return null
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('kitchen')

  useEffect(() => {
    try {
      const saved = normalizeMode(localStorage.getItem(KEY))
      if (saved) setModeState(saved)
    } catch {
      // ignore
    }
  }, [])

  const setMode = (m: AppMode) => {
    setModeState(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {
      // ignore
    }
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
