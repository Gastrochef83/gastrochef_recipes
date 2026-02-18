import { createContext, useContext, useState } from 'react'

type Mode = 'kitchen' | 'mgmt'

type ModeContextType = {
  mode: Mode
  isKitchen: boolean
  isMgmt: boolean
  setMode: (m: Mode) => void
  toggleMode: () => void
}

const ModeContext = createContext<ModeContextType | null>(null)

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('mgmt')

  const setMode = (m: Mode) => {
    setModeState(m)
  }

  const toggleMode = () => {
    setModeState((prev) => (prev === 'kitchen' ? 'mgmt' : 'kitchen'))
  }

  return (
    <ModeContext.Provider
      value={{
        mode,
        isKitchen: mode === 'kitchen',
        isMgmt: mode === 'mgmt',
        setMode,
        toggleMode,
      }}
    >
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const ctx = useContext(ModeContext)
  if (!ctx) {
    throw new Error('useMode must be used inside ModeProvider')
  }
  return ctx
}
