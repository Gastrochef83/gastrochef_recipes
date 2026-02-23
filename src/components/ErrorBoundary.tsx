import React from 'react'

type Props = { children: React.ReactNode }

type State = { hasError: boolean; error?: Error }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 720, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)' }}>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)' }}>Something went wrong</h1>
            <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>Refresh the page. If it keeps happening, check the console for details.</p>
            {this.state.error ? (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--surface-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {this.state.error.message}
              </pre>
            ) : null}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
