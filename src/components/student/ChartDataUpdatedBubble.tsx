import { useEffect, useState } from 'react';
import { formatAdminUpdateTime } from '../../utils/formatAdminUpdateTime';
import './ChartDataUpdatedBubble.css';

interface Props {
  updatedAt: string | null;
  chartKey: string;
  delayMs?: number;
}

export default function ChartDataUpdatedBubble({ updatedAt, chartKey, delayMs = 500 }: Props) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!updatedAt || dismissed) return;
    const showTimer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(showTimer);
  }, [updatedAt, dismissed, delayMs, chartKey]);

  if (!updatedAt || dismissed) return null;

  return (
    <div
      className={`chart-updated-bubble ${visible ? 'chart-updated-bubble--visible' : ''}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="chart-updated-bubble__close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
      <span className="chart-updated-bubble__tag">Data snapshot</span>
      <p className="chart-updated-bubble__title">Updated by admin</p>
      <p className="chart-updated-bubble__time">{formatAdminUpdateTime(updatedAt)}</p>
      <p className="chart-updated-bubble__hint">Same time shown on the login page — not live.</p>
    </div>
  );
}
