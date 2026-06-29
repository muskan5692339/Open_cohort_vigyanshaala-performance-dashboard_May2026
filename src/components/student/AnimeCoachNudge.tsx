import { useEffect, useMemo, useState } from 'react';
import './AnimeCoachNudge.css';

export interface NudgeItem {
  id: string;
  label: string;
  message: string;
}

interface Props {
  items: NudgeItem[];
}

export default function AnimeCoachNudge({ items }: Props) {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  const active = items[index];

  useEffect(() => {
    if (!items.length) {
      setVisible(false);
      return;
    }
    setIndex(0);
    const showTimer = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(showTimer);
  }, [items]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex(prev => (prev + 1) % items.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const dots = useMemo(
    () => items.map((item, i) => ({ id: item.id, active: i === index })),
    [items, index],
  );

  if (!items.length || !active) return null;

  return (
    <div className={`anime-nudge ${visible ? 'anime-nudge--visible' : ''}`} role="status" aria-live="polite">
      <div className="anime-nudge__character" aria-hidden="true">
        <div className="anime-nudge__hair" />
        <div className="anime-nudge__face">
          <span className="anime-nudge__eye anime-nudge__eye--left" />
          <span className="anime-nudge__eye anime-nudge__eye--right" />
          <span className="anime-nudge__mouth" />
        </div>
        <div className="anime-nudge__body" />
      </div>
      <div className="anime-nudge__bubble">
        <div className="anime-nudge__tag">{active.label}</div>
        <p className="anime-nudge__message">{active.message}</p>
        {dots.length > 1 && (
          <div className="anime-nudge__dots">
            {dots.map(dot => (
              <span key={dot.id} className={dot.active ? 'is-active' : ''} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
