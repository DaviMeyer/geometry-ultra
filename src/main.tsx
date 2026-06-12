import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'

// Ohne ErrorBoundary unmountet React 18 bei JEDEM nicht abgefangenen Fehler
// (auch aus Effects) den kompletten Baum -> dauerhaft weißer Screen. Mit
// Boundary gibt es stattdessen eine Meldung und einen Neu-laden-Button.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Unbehandelter Fehler:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#fff', fontFamily: 'system-ui', padding: 40, textAlign: 'center' }}>
          <h2>💥 Etwas ist schiefgelaufen</h2>
          <p style={{ opacity: 0.7 }}>{this.state.error.message}</p>
          <button
            style={{ padding: '10px 24px', fontSize: 16, cursor: 'pointer', borderRadius: 8, border: 'none', background: '#00f0ff', color: '#000' }}
            onClick={() => window.location.reload()}
          >
            Neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
