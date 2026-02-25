import { useEffect, useMemo, useRef } from 'react'

type Props = {
  /** Optional legacy prop: if provided and false, Toast won't render */
  open?: boolean
  message: string
  onClose: () => void
  durationMs?: number
}

/**
 * ✅ Toast PRO (COMPAT)
 * - Backward compatible with old usage: <Toast open={...} message={...} />
 * - If message is empty/whitespace, don't render (prevents "black box")
 * - Auto dismiss (default 2600ms) + Escape to close
 * - No business-logic change
 */
export function Toast({ open, message, onClose, durationMs = 2600 }: Props) {
  const text = useMemo(() => (message ?? '').toString(), [message])
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  const visible = (open ?? true) && text.trim().length > 0

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => onCloseRef.current?.(), Math.max(800, durationMs))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [durationMs, visible, text])

  if (!visible) return null

  return (
    <div
      className="gc-toast"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 2000,
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          background: '#111827',
          color: '#fff',
          borderRadius: 14,
          padding: '12px 14px',
          boxShadow: '0 18px 50px rgba(2,6,23,.20)',
          maxWidth: 520,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{text}</div>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'rgba(255,255,255,.12)',
            color: '#fff',
            borderRadius: 10,
            padding: '6px 10px',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 12,
          }}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  )
}
