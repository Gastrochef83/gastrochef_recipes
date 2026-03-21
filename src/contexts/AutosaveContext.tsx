import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type AutosaveState = {
  status: AutosaveStatus
  message?: string | null
  lastSavedAt?: number | null
  setSaving: () => void
  setSaved: () => void
  setError: (msg?: string | null) => void
  setIdle: () => void
}

const AutosaveContext = createContext<AutosaveState | null>(null)

export function AutosaveProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const savedTimer = useRef<number | null>(null)

  const clearTimer = () => {
    if (savedTimer.current != null) {
      window.clearTimeout(savedTimer.current)
      savedTimer.current = null
    }
  }

  const setIdle = useCallback(() => {
    clearTimer()
    setStatus('idle')
    setMessage(null)
  }, [])

  const setSaving = useCallback(() => {
    clearTimer()
    setStatus('saving')
    setMessage(null)
  }, [])

  const setSaved = useCallback(() => {
    clearTimer()
    setStatus('saved')
    setMessage(null)
    setLastSavedAt(Date.now())
    // Return to idle after a short moment (premium calm UX)
    savedTimer.current = window.setTimeout(() => {
      setStatus('idle')
      setMessage(null)
    }, 1400) as unknown as number
  }, [])

  const setError = useCallback((msg?: string | null) => {
    clearTimer()
    setStatus('error')
    setMessage(msg || 'Save failed. Retrying…')
  }, [])

  const value = useMemo(
    () => ({ status, message, lastSavedAt, setSaving, setSaved, setError, setIdle }),
    [status, message, lastSavedAt, setSaving, setSaved, setError, setIdle]
  )

  return <AutosaveContext.Provider value={value}>{children}</AutosaveContext.Provider>
}

export function useAutosave() {
  const ctx = useContext(AutosaveContext)
  if (!ctx) throw new Error('useAutosave must be used within AutosaveProvider')
  return ctx
}
