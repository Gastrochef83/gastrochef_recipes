import { createContext, useContext, useEffect, useState } from 'react'

type Mode = 'kitchen' | 'mgmt'

type ModeContextType = {
  mode: Mode
  isKitchen: boolean
  isMgmt: boolean
  setMode: (m: Mode) => void

  dark: boolean
  toggleDark: () => void
}

const ModeContext = createContext<ModeContextType | null>(null)

export function ModeProvider({ children }: { children: React.ReactNode }) {

  const [mode, setModeState] = useState<Mode>(() => {
    return (localStorage.getItem('gc_mode') as Mode) || 'mgmt'
  })

  const [dark, setDark] = useState(() => {
    return localStorage.getItem('gc_dark') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('gc_mode', mode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('gc_dark', String(dark))
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  return (
    <ModeContext.Provider
      value={{
        mode,
        isKitchen: mode === 'kitchen',
        isMgmt: mode === 'mgmt',
        setMode: setModeState,
        dark,
        toggleDark: () => setDark((d) => !d),
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside ModeProvider')
  return ctx
}
