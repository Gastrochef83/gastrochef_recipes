import React from 'react'
import { NavLink } from 'react-router-dom'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
  message: string
  stack?: string
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: any) {
    return {
      hasError: true,
      message: err?.message || String(err) || 'Unknown error',
    }
  }

  componentDidCatch(error: any, info: any) {
    // Log for debugging
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, info)
    this.setState({ stack: info?.componentStack })
  }

  reset = () => this.setState({ hasError: false, message: '', stack: undefined })

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">UI CRASHED</div>
        <div className="text-sm text-red-600 font-semibold">{this.state.message}</div>

        <div className="text-xs text-neutral-500">
          افتح Console في المتصفح (F12) وسترى الخطأ كاملًا تحت: <span className="font-mono">UI crashed</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="gc-btn gc-btn-primary" onClick={this.reset} type="button">
            Try Again
          </button>
          <NavLink className="gc-btn gc-btn-ghost" to="/recipes">
            Back to Recipes
          </NavLink>
          <button
            className="gc-btn gc-btn-ghost"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
