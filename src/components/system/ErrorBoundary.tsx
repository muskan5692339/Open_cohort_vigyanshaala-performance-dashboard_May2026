import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BRAND } from '../../types/adminTypes';
import { isChunkLoadError } from '../../utils/lazyWithRetry';
import { clearDashboardStorage, isStorageQuotaError } from '../../services/storageRecovery';

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
      const chunkError = isChunkLoadError(this.state.error);
      const storageError = isStorageQuotaError(this.state.error.message);
      return (
        <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20, maxWidth: 640 }}>
            <div style={{ fontWeight: 800, color: BRAND.navy, fontSize: 18, marginBottom: 8 }}>
              {this.props.title ?? 'Something went wrong'}
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 12 }}>
              {chunkError
                ? 'A new version of the app was deployed. Reload the page to fetch the latest files.'
                : storageError
                  ? 'Browser storage is full. Clear saved dashboard data below, or open the site in a private/incognito window.'
                  : 'The dashboard recovered gracefully. You can reload or continue with local data.'}
            </div>
            <pre style={{ fontSize: 11, background: BRAND.bg, padding: 12, borderRadius: 8, overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  if (chunkError) {
                    window.location.reload();
                    return;
                  }
                  this.setState({ error: null });
                }}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: BRAND.navy, color: '#fff', cursor: 'pointer' }}
              >
                {chunkError ? 'Reload page' : 'Try again'}
              </button>
              {storageError && (
                <button
                  type="button"
                  onClick={() => {
                    clearDashboardStorage();
                    window.location.reload();
                  }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${BRAND.border}`, background: '#fff', color: BRAND.navy, cursor: 'pointer', fontWeight: 600 }}
                >
                  Clear saved data & reload
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
