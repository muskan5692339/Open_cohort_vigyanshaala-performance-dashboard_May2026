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
  const [menuOpen, setMenuOpen] = useState(false);

  const run = async (mode: 'copy' | 'download') => {
    const root = chartRootRef.current;
    if (!root || disabled) return;
    setMenuOpen(false);
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
      window.setTimeout(() => setStatus('idle'), 2800);
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
      ? 'Capturing chart…'
      : status === 'copied'
        ? 'Copied — paste into WhatsApp / email'
        : status === 'shared'
          ? 'Opened share sheet'
          : status === 'downloaded'
            ? 'PNG saved — open and share it'
            : status === 'error'
              ? 'Could not capture — try again'
              : null;

  return (
    <div className="chart-snapshot-actions">
      <div className="chart-snapshot-actions__btns" role="group" aria-label="Snapshot session chart">
        <button
          type="button"
          className="chart-snapshot-btn chart-snapshot-btn--primary"
          onClick={() => void run('download')}
          disabled={disabled || status === 'working'}
          title="Save a picture of the full session-wise chart"
        >
          Snapshot
        </button>
        <button
          type="button"
          className="chart-snapshot-btn"
          onClick={() => void run('copy')}
          disabled={disabled || status === 'working'}
          title="Copy chart image to paste into WhatsApp, email, or Docs"
        >
          Copy image
        </button>
        <button
          type="button"
          className="chart-snapshot-btn chart-snapshot-btn--secondary"
          onClick={() => setMenuOpen(o => !o)}
          disabled={disabled || status === 'working'}
          aria-expanded={menuOpen}
          aria-label="More snapshot options"
          title="More options"
        >
          ▾
        </button>
      </div>
      {menuOpen && (
        <div className="chart-snapshot-menu" role="menu">
          <button type="button" role="menuitem" className="chart-snapshot-menu__item" onClick={() => void run('download')}>
            Download PNG
          </button>
          <button type="button" role="menuitem" className="chart-snapshot-menu__item" onClick={() => void run('copy')}>
            Copy to clipboard
          </button>
        </div>
      )}
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
