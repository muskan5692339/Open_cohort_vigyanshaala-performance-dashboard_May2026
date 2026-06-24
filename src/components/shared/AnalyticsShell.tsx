import type { ReactNode } from 'react';
import { BRAND } from '../../types/adminTypes';

interface AnalyticsShellProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

export default function AnalyticsShell({
  loading,
  error,
  empty,
  emptyMessage = 'No data available for this view yet.',
  children,
}: AnalyticsShellProps) {
  if (loading) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: BRAND.textLight,
          fontSize: 14,
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
        }}
      >
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 20,
          background: BRAND.redLight,
          borderRadius: 10,
          color: BRAND.red,
          fontSize: 13,
        }}
      >
        <strong>Could not load analytics:</strong> {error}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: BRAND.textLight,
          fontSize: 14,
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return <>{children}</>;
}
