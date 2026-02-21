import React from 'react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  error?: Error
  info?: React.ErrorInfo
}

/**
 * ✅ FINAL GOD — ErrorBoundary PRO
 * - Prevents blank screen by catching render-time crashes
 * - Shows useful diagnostics (message + component stack)
 * - Offers "Reload" + "Copy error"
 * - No business-logic changes
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log for Vercel + browser console
    console.error('🔥 GastroChef Render Error:', error)
    console.error(info)
    this.setState({ info })
  }

  reload() {
    window.location.reload()
  }

  async copy() {
    const msg = this.buildCopyText()
    try {
      await navigator.clipboard.writeText(msg)
      alert('Copied error details ✅')
    } catch {
      // fallback
      try {
        const ta = document.createElement('textarea')
        ta.value = msg
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        alert('Copied error details ✅')
      } catch {
        alert('Copy failed. Please copy manually from the box.')
      }
    }
  }

  buildCopyText() {
    const e = this.state.error
    const info = this.state.info
    const parts = [
      'GastroChef ErrorBoundary Report',
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      '',
      'ERROR:',
      e ? `${e.name}: ${e.message}` : '(none)',
      '',
      'STACK:',
      e?.stack || '(no stack)',
      '',
      'COMPONENT STACK:',
      info?.componentStack || '(no component stack)',
    ]
    return parts.join('\n')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const e = this.state.error
    const comp = this.state.info?.componentStack

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18,
          background: 'linear-gradient(180deg, #f6f8fb 0%, #eef3f6 100%)',
          fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid rgba(15, 23, 42, .10)',
            padding: 22,
            borderRadius: 22,
            boxShadow: '0 18px 50px rgba(2,6,23,.12)',
            width: 'min(860px, 94vw)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: '.08em' }}>GASTROCHEF</div>
              <h2 style={{ margin: '6px 0 0', fontSize: 22 }}>Something went wrong</h2>
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                The app crashed during rendering. Use the buttons below to reload or copy error details.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => this.reload()}
                style={{
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Reload
              </button>

              <button
                onClick={() => this.copy()}
                style={{
                  background: '#0f766e',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Copy error
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>Message</div>
            <div
              style={{
                marginTop: 6,
                borderRadius: 14,
                background: '#fef2f2',
                border: '1px solid rgba(239,68,68,.20)',
                color: '#991b1b',
                padding: 12,
                fontSize: 13,
              }}
            >
              {e ? `${e.name}: ${e.message}` : 'Unknown error'}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>Stack</div>
              <pre
                style={{
                  marginTop: 6,
                  borderRadius: 14,
                  background: '#0b1220',
                  color: '#e5e7eb',
                  padding: 12,
                  fontSize: 12,
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {e?.stack || '(no stack)'}
              </pre>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>Component stack</div>
              <pre
                style={{
                  marginTop: 6,
                  borderRadius: 14,
                  background: '#0b1220',
                  color: '#e5e7eb',
                  padding: 12,
                  fontSize: 12,
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {comp || '(no component stack)'}
              </pre>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12.5, color: '#94a3b8' }}>
            If this keeps happening, copy the error and send it to support (or me) and we’ll pinpoint the exact file.
          </div>
        </div>
      </div>
    )
  }
}
