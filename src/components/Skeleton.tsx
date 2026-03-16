import React from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={[
        'animate-pulse rounded-xl bg-neutral-200/70',
        'dark:bg-white/10',
        className,
      ].join(' ')}
      aria-hidden="true"
    />
  )
}

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <Skeleton className={['h-4 rounded-md', className].join(' ')} />
}

export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={['space-y-2', className].join(' ')}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} className={i === lines - 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  )
}
