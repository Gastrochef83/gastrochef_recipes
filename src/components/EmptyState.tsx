import React from 'react'
import Button from './ui/Button'

type Action = {
  label: string
  onClick: () => void
}

type Props = {
  title: string
  subtitle?: string
  description?: string
  icon?: React.ReactNode
  primaryAction?: Action
  secondaryAction?: Action
  children?: React.ReactNode
  className?: string
}

export default function EmptyState({
  title,
  subtitle,
  description,
  icon,
  primaryAction,
  secondaryAction,
  children,
  className = ''
}: Props) {
  const body = description ?? subtitle

  return (
    <div className={`w-full flex justify-center ${className}`.trim()}>
      <div className="w-full max-w-2xl">
        <div className="gc-card p-8">
          <div className="flex flex-col items-center text-center">
            <div className="gc-badge" aria-hidden>
              <span className="text-lg">{icon ?? '🍽️'}</span>
              <span className="text-sm">No data</span>
            </div>

            <div className="mt-4 text-xl font-extrabold">{title}</div>

            {body ? (
              <div className="mt-2 text-sm text-neutral-600">
                {body}
              </div>
            ) : null}

            {(primaryAction || secondaryAction || children) ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {primaryAction ? (
                  <Button variant="primary" onClick={primaryAction.onClick}>
                    {primaryAction.label}
                  </Button>
                ) : null}

                {secondaryAction ? (
                  <Button variant="secondary" onClick={secondaryAction.onClick}>
                    {secondaryAction.label}
                  </Button>
                ) : null}

                {children ? <div className="flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
              </div>
            ) : null}

            <div className="mt-6 text-xs text-neutral-500">
              Tip: Start small—add a few items first, then refine details later.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
