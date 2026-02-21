import React from 'react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends React.Component<Props, State> {

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('🔥 GastroChef Render Error:', error)
    console.error(info)
  }

  reload() {
    window.location.reload()
  }

  render() {

    if (this.state.hasError) {

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f6f8fb',
            fontFamily:
              '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto'
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 30,
              borderRadius: 18,
              boxShadow:
                '0 18px 50px rgba(2,6,23,.12)',
              maxWidth: 520,
              textAlign: 'center'
            }}
          >
            <h2
              style={{
                marginBottom: 10
              }}
            >
              GastroChef encountered an error
            </h2>

            <p
              style={{
                color: '#64748b',
                marginBottom: 18
              }}
            >
              Something went wrong during rendering.
            </p>

            <button
              onClick={() => this.reload()}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 10,
                cursor: 'pointer'
              }}
            >
              Reload Application
            </button>

            {this.state.error && (

              <pre
                style={{
                  marginTop: 20,
                  textAlign: 'left',
                  fontSize: 12,
                  color: '#ef4444',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {this.state.error.message}
              </pre>

            )}

          </div>
        </div>
      )
    }

    return this.props.children
  }
}
