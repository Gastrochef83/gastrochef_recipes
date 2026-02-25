import React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
  prefix?: string
  suffix?: string
}

export default function Input({ label, error, prefix, suffix, className = '', ...props }: Props) {
  return (
    <label className={`gc-field ${className}`.trim()}>
      {label ? <span className="gc-field__label">{label}</span> : null}
      <span className="gc-inputwrap">
        {prefix ? <span className="gc-affix">{prefix}</span> : null}
        <input {...props} className="gc-input" />
        {suffix ? <span className="gc-affix">{suffix}</span> : null}
      </span>
      {error ? <span className="gc-field__error">{error}</span> : null}
    </label>
  )
}
