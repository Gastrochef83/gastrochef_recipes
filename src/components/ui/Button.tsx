import React from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  fullWidth?: boolean
}

export default function Button({
  variant = 'primary',
  fullWidth,
  className = '',
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`gc-btn gc-btn--${variant} ${fullWidth ? 'gc-btn--full' : ''} ${className}`.trim()}
    />
  )
}
