import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Mode = 'kitchen' | 'mgmt'

type ModeCtx = {
  mode: Mode
  setMode: (m: Mode) => void
}

const ModeContext = createContext<ModeCtx | null>(null)

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = (localStorage.getItem('gc_mode') || 'mgmt').toLowerCase()
    return saved === 'kitchen' ? 'kitchen' : 'mgmt'
  })

  const setMode = (m: Mode) => setModeState(m)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('gc-mode-mgmt', 'gc-mode-kitchen')
    root.classList.add(mode === 'kitchen' ? 'gc-mode-kitchen' : 'gc-mode-mgmt')
    localStorage.setItem('gc_mode', mode)
  }, [mode])

  const value = useMemo(() => ({ mode, setMode }), [mode])

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used within ModeProvider')
  return ctx
}
