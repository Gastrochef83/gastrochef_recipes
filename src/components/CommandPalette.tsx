import { useEffect, useMemo, useRef, useState } from 'react'

export type CommandItem = {
  id: string
  label: string
  kbd?: string
  danger?: boolean
  run: () => void | Promise<void>
}

type Props = {
  open: boolean
  onClose: () => void
  items: CommandItem[]
}

function isMacLike() {
  if (typeof navigator === 'undefined') return false
  const p = navigator.platform?.toLowerCase?.() || ''
  return p.includes('mac') || p.includes('iphone') || p.includes('ipad')
}

export default function CommandPalette({ open, onClose, items }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mac = useMemo(() => isMacLike(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.label.toLowerCase().includes(q))
  }, [items, query])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = mac ? e.metaKey : e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (open) onClose()
        else {
          // open is controlled by parent; dispatch a custom event
          window.dispatchEvent(new CustomEvent('gc:open-command-palette'))
        }
      }
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Enter') {
        const first = filtered[0]
        if (first) {
          e.preventDefault()
          void Promise.resolve(first.run()).finally(() => {
            onClose()
          })
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, filtered, mac])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    // focus on open
    const t = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  const modLabel = mac ? '⌘' : 'Ctrl'

  return (
    <div className="gc-cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={onClose}>
      <div className="gc-cmdk-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gc-cmdk-top">
          <input
            ref={inputRef}
            className="gc-cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            aria-label="Search commands"
          />
          <div className="gc-cmdk-kbd" aria-hidden="true">
            {modLabel}+K
          </div>
        </div>

        <div className="gc-cmdk-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <div className="gc-cmdk-empty">No results</div>
          ) : (
            filtered.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                className={`gc-cmdk-item ${it.danger ? 'is-danger' : ''}`}
                role="option"
                aria-selected={idx === 0}
                onClick={() => {
                  void Promise.resolve(it.run()).finally(() => {
                    onClose()
                  })
                }}
              >
                <span className="gc-cmdk-label">{it.label}</span>
                {it.kbd ? <span className="gc-cmdk-item-kbd">{it.kbd}</span> : null}
              </button>
            ))
          )}
        </div>

        <div className="gc-cmdk-footer">
          <span>Enter to run</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
