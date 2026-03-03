import React from 'react'
import ErrorState from './ErrorState'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  error?: Error
  info?: React.ErrorInfo
  copyStatus?: 'idle' | 'success' | 'failed'
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, copyStatus: 'idle' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GastroChef render error:', error)
    console.error(info)
    this.setState({ info })
  }

  private reload = () => {
    window.location.reload()
  }

  private buildCopyText = () => {
    const e = this.state.error
    const info = this.state.info

    const parts = [
      'GastroChef Error Report',
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

  private copy = async () => {
    const msg = this.buildCopyText()

    try {
      await navigator.clipboard.writeText(msg)
      this.setState({ copyStatus: 'success' })
      window.setTimeout(() => this.setState({ copyStatus: 'idle' }), 2200)
      return
    } catch {
      // Fallback for older browsers / restricted clipboard contexts
      try {
        const ta = document.createElement('textarea')
        ta.value = msg
        ta.setAttribute('readonly', 'true')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)

        this.setState({ copyStatus: 'success' })
        window.setTimeout(() => this.setState({ copyStatus: 'idle' }), 2200)
      } catch {
        this.setState({ copyStatus: 'failed' })
        window.setTimeout(() => this.setState({ copyStatus: 'idle' }), 3000)
      }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const e = this.state.error
    const comp = this.state.info?.componentStack
    const copyStatus = this.state.copyStatus ?? 'idle'

    return (
      <div className="gc-page min-h-screen p-5">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <ErrorState
            title="Something went wrong"
            message="The app encountered an unexpected rendering error. You can reload the app or copy the error details for support."
            details={e ? `${e.name}: ${e.message}` : 'Unknown error'}
            primaryAction={{ label: 'Reload', onClick: this.reload }}
            secondaryAction={{ label: 'Copy error details', onClick: this.copy }}
            variant="page"
          />

          {copyStatus !== 'idle' ? (
            <div className="gc-card p-4">
              <div className="gc-label">STATUS</div>
              <div className="mt-1 text-sm text-neutral-700">
                {copyStatus === 'success'
                  ? 'Copied error details to clipboard.'
                  : 'Copy failed. Please copy manually from the boxes below.'}
              </div>
            </div>
          ) : null}

          <div className="gc-card p-6">
            <div className="gc-label">DIAGNOSTICS</div>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-sm font-semibold">Stack</div>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--gc-border)] bg-[rgba(2,6,23,.92)] p-3 text-xs text-[rgba(255,255,255,.88)]">
                  {e?.stack || '(no stack)'}
                </pre>
              </div>

              <div>
                <div className="text-sm font-semibold">Component stack</div>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--gc-border)] bg-[rgba(2,6,23,.92)] p-3 text-xs text-[rgba(255,255,255,.88)]">
                  {comp || '(no component stack)'}
                </pre>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-500">
              If this keeps happening, copy the error details and send them to support so we can pinpoint the root cause.
            </div>
          </div>
        </div>
      </div>
    )
  }
}
