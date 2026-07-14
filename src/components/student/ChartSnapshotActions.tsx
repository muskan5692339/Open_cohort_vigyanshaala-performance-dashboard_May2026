import { useState, type RefObject } from 'react';
import {
  captureChartPngBlob,
  copyImageBlob,
  downloadBlob,
  type ChartCaptureMeta,
} from '../../utils/captureChartImage';
import './ChartSnapshotActions.css';

interface Props {
  chartRootRef: RefObject<HTMLElement | null>;
  meta: ChartCaptureMeta;
  disabled?: boolean;
  fileName?: string;
}

type Status = 'idle' | 'working' | 'copied' | 'shared' | 'downloaded' | 'error';

export default function ChartSnapshotActions({
  chartRootRef,
  meta,
  disabled = false,
  fileName = 'session-wise-chart.png',
}: Props) {
  const [status, setStatus] = useState<Status>('idle');

  const run = async (mode: 'copy' | 'download') => {
    const root = chartRootRef.current;
    if (!root || disabled) return;
    setStatus('working');
    try {
      const blob = await captureChartPngBlob(root, meta);
      if (mode === 'download') {
        downloadBlob(blob, fileName);
        setStatus('downloaded');
      } else {
        const result = await copyImageBlob(blob);
        setStatus(result);
      }
      window.setTimeout(() => setStatus('idle'), 2500);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 2800);
    }
  };

  const label =
    status === 'working'
      ? 'Preparing…'
      : status === 'copied'
        ? 'Copied — paste anywhere'
        : status === 'shared'
          ? 'Opened share sheet'
          : status === 'downloaded'
            ? 'Saved to downloads'
            : status === 'error'
              ? 'Could not capture — try again'
              : null;

  return (
    <div className="chart-snapshot-actions">
      <div className="chart-snapshot-actions__btns" role="group" aria-label="Share chart image">
        <button
          type="button"
          className="chart-snapshot-btn"
          onClick={() => void run('copy')}
          disabled={disabled || status === 'working'}
          title="Copy chart image to paste in WhatsApp, email, or Docs"
        >
          Copy image
        </button>
        <button
          type="button"
          className="chart-snapshot-btn chart-snapshot-btn--secondary"
          onClick={() => void run('download')}
          disabled={disabled || status === 'working'}
          title="Download chart as PNG"
        >
          Download
        </button>
      </div>
      {label && (
        <span
          className={`chart-snapshot-status${status === 'error' ? ' chart-snapshot-status--error' : ''}`}
          role="status"
        >
          {label}
        </span>
      )}
    </div>
  );
}
