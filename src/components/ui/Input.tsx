import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefix?: string
  suffix?: string
}

export default function Input({ prefix, suffix, className = '', ...rest }: InputProps) {
  return (
    <div className={`gc-input ${className}`}>
      {prefix ? <span className="gc-input__affix">{prefix}</span> : null}
      <input className="gc-input__field" {...rest} />
      {suffix ? <span className="gc-input__affix">{suffix}</span> : null}

      <style>{`
        .gc-input{
          display:flex;
          align-items:center;
          gap: .5rem;
          padding: .75rem .9rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          box-shadow: var(--shadow-sm);
        }
        .gc-input__field{
          border:none;
          outline:none;
          width:100%;
          background:transparent;
          color: var(--text-primary);
          font-size: .95rem;
        }
        .gc-input__affix{
          color: var(--text-tertiary);
          font-size: .9rem;
          white-space: nowrap;
        }
        .gc-input:focus-within{
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent);
        }
      `}</style>
    </div>
  )
}
