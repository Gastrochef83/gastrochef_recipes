import { useEffect, useMemo, useRef } from 'react'

export function Toast({
  open,
  message,
  onClose,
}: {
  open: boolean
  message: string
  onClose: () => void
}) {
  const lastMsgRef = useRef<string>('')

  // Avoid re-trigger loops if same message is set again quickly
  useEffect(() => {
    if (!open) return
    lastMsgRef.current = message || ''
  }, [open, message])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onClose, 2600)
    return () => window.clearTimeout(t)
  }, [open, onClose])

  const shown = useMemo(() => {
    const m = (message ?? '').trim()
    return m || 'Done ✅'
  }, [message])

  if (!open) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="gc-toast">
        <div className="text-sm font-semibold">{shown}</div>

        <button
          type="button"
          className="gc-toast-close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
