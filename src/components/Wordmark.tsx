import React from 'react'

type WordmarkSize = 'sm' | 'md' | 'lg'

export function Wordmark({
  size = 'md',
  className = '',
  ariaLabel = 'GastroChef',
}: {
  size?: WordmarkSize
  className?: string
  ariaLabel?: string
}) {
  return (
    <span className={`gc-wordmark gc-wordmark--${size} ${className}`.trim()} aria-label={ariaLabel}>
      <span className="gc-wordmark-main">Gastro</span>
      <span className="gc-wordmark-accent">Chef</span>
    </span>
  )
}

export default Wordmark
