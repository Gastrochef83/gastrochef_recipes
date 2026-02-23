import React from 'react'

type State = { hasError: boolean; error?: unknown }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown) {
    console.error('App error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gc-error">
          <h1>Something went wrong</h1>
          <p>Please refresh the page.</p>
        </div>
      )
    }

    return this.props.children
  }
}
