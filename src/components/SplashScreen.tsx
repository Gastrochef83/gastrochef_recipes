import React from 'react'

export default function SplashScreen({
  title = 'GastroChef',
  subtitle = 'Loading…',
  hint = 'Preparing your workspace',
}: {
  title?: string
  subtitle?: string
  hint?: string
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(1200px 700px at 50% -10%, rgba(31, 122, 120, 0.18), transparent 55%),' +
          'radial-gradient(900px 520px at 15% 110%, rgba(107, 127, 59, 0.18), transparent 55%),' +
          'var(--gc-bg, #0b1220)',
        color: 'var(--gc-text, rgba(248,250,252,.92))',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(520px, 92vw)',
          borderRadius: 20,
          border: '1px solid var(--gc-border, rgba(148,163,184,.18))',
          background: 'var(--gc-card, rgba(15,23,42,.72))',
          boxShadow: 'var(--gc-shadow, 0 26px 70px rgba(0,0,0,.55))',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'rgba(255,255,255,.08)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src="/gastrochef-logo.png"
              alt="GastroChef"
              style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{title}</div>
            <div style={{ marginTop: 2, fontSize: 13, color: 'var(--gc-muted, rgba(248,250,252,.70))' }}>
              {subtitle}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--gc-soft, rgba(248,250,252,.60))' }}>{hint}</div>

          <div
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: '2px solid rgba(248,250,252,.22)',
              borderTopColor: 'var(--gc-accent, #6B7F3B)',
              animation: 'gcspin 0.9s linear infinite',
            }}
          />
        </div>

        <style>{`@keyframes gcspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
