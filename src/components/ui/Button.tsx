import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger'
type Size = 'small' | 'medium' | 'large'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`gc-btn gc-btn--${variant} gc-btn--${size} ${fullWidth ? 'gc-btn--block' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
