import { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  type,
  disabled,
  variant = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  // Keep a tiny component API, but route all visuals through the design system
  // (no Tailwind color literals here — brand tokens control the look).
  const base = 'gc-btn'
  const styles: Record<string, string> = {
    primary: 'gc-btn-primary',
    ghost: 'gc-btn-ghost',
    danger: 'gc-btn-danger',
  }
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      className={[base, styles[variant]].join(' ')}
    >
      {children}
    </button>
  )
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  step,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <div className="gc-label">{label}</div>
      <input
        type={type}
        step={step}
        placeholder={placeholder}
        className="gc-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="gc-card">{children}</div>
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Money({ value }: { value: number }) {
  const v = Number.isFinite(value) ? value : 0
  return <span>{v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
}
