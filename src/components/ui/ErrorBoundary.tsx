import React, { Component, ErrorInfo, ReactNode } from 'react'
import { log } from '../../core/utils/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    // Also into the app log, which is what Settings → Developer → System Logs
    // shows and what users are asked to attach to a bug report. A crash that
    // never reaches it is the one entry that report most needed.
    log.error(`UI crash: ${error.message}`, {
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })
    this.setState({ error, errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Something went wrong.</h1>
          <h2 style={{ marginTop: '10px' }}>{this.state.error && this.state.error.toString()}</h2>
          {/* Your vault is untouched — this is a rendering failure, and
              nothing here writes to storage. Say so, because a red screen in
              a tool that holds your accounts reads as data loss. */}
          <p style={{ marginTop: '10px' }}>
            Your vault is unaffected — nothing was deleted or changed. Reloading
            usually clears this.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '14px',
              padding: '8px 16px',
              fontFamily: 'inherit',
              fontWeight: 'bold',
              cursor: 'pointer',
              border: '1px solid #991b1b',
              borderRadius: '6px',
              background: '#991b1b',
              color: '#fee2e2'
            }}
          >
            Reload
          </button>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Component Stack Trace</summary>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Error Stack Trace</summary>
            {this.state.error && this.state.error.stack}
          </details>
        </div>
      )
    }

    return this.props.children
  }
}
