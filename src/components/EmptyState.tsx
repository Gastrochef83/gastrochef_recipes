
import React from 'react'

export default function EmptyState({
  title,
  subtitle,
  children,
  icon
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="gc-empty">
      <div className="gc-empty__card">
        <div className="gc-empty__icon">{icon ?? <span aria-hidden>🍽️</span>}</div>
        <div className="gc-empty__title">{title}</div>
        {subtitle ? <div className="gc-empty__sub">{subtitle}</div> : null}
        {children ? <div className="gc-empty__actions">{children}</div> : null}
      </div>
    </div>
  )
}
