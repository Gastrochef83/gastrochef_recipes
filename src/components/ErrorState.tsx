import React from 'react'
import Button from './ui/Button'

type Props = {
  title: string
  message?: string
  details?: string
  onRetry?: (() => void) | null
  primaryAction?: {
    label: string
    onClick: () => void
  } | null
  secondaryAction?: {
    label: string
    onClick: () => void
  } | null
  variant?: 'page' | 'banner'
}

export default function ErrorState({
  title,
  message,
  details,
  onRetry,
  primaryAction,
  secondaryAction,
  variant = 'page'
}: Props) {
  const actions = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}

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
    </div>
  )

  if (variant === 'banner') {
    return (
      <div className="gc-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-lg" aria-hidden>
            ⚠️
          </div>

          <div className="min-w-0 flex-1">
            <div className="gc-label">ERROR</div>
            <div className="mt-1 font-semibold">{title}</div>
            {message ? <div className="mt-1 text-sm text-neutral-600">{message}</div> : null}
            {details ? <div className="mt-2 text-xs text-neutral-500">{details}</div> : null}
            {actions}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="gc-card p-8">
      <div className="flex flex-col items-center text-center">
        <div className="text-3xl" aria-hidden>
          ⚠️
        </div>
        <div className="mt-3 text-lg font-extrabold">{title}</div>
        {message ? <div className="mt-2 text-sm text-neutral-600">{message}</div> : null}
        {details ? <div className="mt-3 max-w-2xl text-xs text-neutral-500">{details}</div> : null}
        {actions}
      </div>
    </div>
  )
}
