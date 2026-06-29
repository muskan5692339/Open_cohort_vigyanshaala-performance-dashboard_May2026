import { useEffect, useState } from 'react';
import './AnimeMetricAlert.css';

export type MetricAlertVariant = 'assignment' | 'quiz' | 'session';

interface Props {
  variant: MetricAlertVariant;
  show: boolean;
  label: string;
  message: string;
}

export default function AnimeMetricAlert({ variant, show, label, message }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 280);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`metric-alert metric-alert--${variant} ${visible ? 'metric-alert--visible' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className={`metric-alert__mascot metric-alert__mascot--${variant}`} aria-hidden="true">
        <div className="metric-alert__shadow" />
        <div className="metric-alert__figure">
          {variant === 'assignment' && <span className="metric-alert__prop metric-alert__prop--book" />}
          {variant === 'quiz' && <span className="metric-alert__prop metric-alert__prop--glasses" />}
          {variant === 'session' && <span className="metric-alert__prop metric-alert__prop--clock" />}
          <div className="metric-alert__hair" />
          <div className="metric-alert__face">
            <span className="metric-alert__eye metric-alert__eye--l" />
            <span className="metric-alert__eye metric-alert__eye--r" />
            <span className="metric-alert__mouth" />
          </div>
          <div className="metric-alert__torso" />
        </div>
      </div>
      <div className="metric-alert__bubble">
        <span className="metric-alert__tag">{label}</span>
        <p className="metric-alert__text">{message}</p>
      </div>
    </div>
  );
}
