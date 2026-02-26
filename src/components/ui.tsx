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
  const base =
    'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition border'
  const styles: Record<string, string> = {
    primary: 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 disabled:opacity-60',
    ghost: 'bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50 disabled:opacity-60',
    danger: 'bg-red-600 text-white border-red-600 hover:bg-red-500 disabled:opacity-60',
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
      <label className="text-xs font-semibold text-neutral-600">{label}</label>
      <input
        type={type}
        step={step}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border bg-white p-5">{children}</div>
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
