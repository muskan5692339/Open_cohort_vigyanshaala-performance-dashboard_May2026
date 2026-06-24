import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BRAND } from '../../types/adminTypes';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20, maxWidth: 640 }}>
            <div style={{ fontWeight: 800, color: BRAND.navy, fontSize: 18, marginBottom: 8 }}>
              {this.props.title ?? 'Something went wrong'}
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 12 }}>
              The dashboard recovered gracefully. You can reload or continue with local data.
            </div>
            <pre style={{ fontSize: 11, background: BRAND.bg, padding: 12, borderRadius: 8, overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: BRAND.navy, color: '#fff', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
