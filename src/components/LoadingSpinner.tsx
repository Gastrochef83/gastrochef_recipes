import React from 'react'

export default function LoadingSpinner() {
  return (
    <div className="gc-loading" role="status" aria-live="polite">
      <div className="gc-loading__spinner" />
      <div className="gc-loading__text">Loading…</div>

      <style>{`
        .gc-loading{
          min-height: 50vh;
          display:flex;
          flex-direction: column;
          align-items:center;
          justify-content:center;
          gap: .75rem;
          color: var(--text-secondary);
        }
        .gc-loading__spinner{
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 3px solid var(--border);
          border-top-color: var(--primary);
          animation: spin .8s linear infinite;
        }
        .gc-loading__text{ font-weight: 600; }
        @keyframes spin{ to{ transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
