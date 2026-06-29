import './WeeklyUpdateNotice.css';

const UPDATE_DAYS = ['Monday', 'Wednesday', 'Saturday'] as const;

export default function WeeklyUpdateNotice() {
  return (
    <div className="weekly-update-notice" role="note" aria-live="polite">
      <div className="weekly-update-notice__glow" aria-hidden="true" />
      <div className="weekly-update-notice__inner">
        <div className="weekly-update-notice__icon" aria-hidden="true">
          <span>⏱</span>
        </div>
        <div className="weekly-update-notice__content">
          <div className="weekly-update-notice__badges">
            <span className="weekly-update-notice__badge weekly-update-notice__badge--live">Not live data</span>
            <span className="weekly-update-notice__badge weekly-update-notice__badge--schedule">3× weekly sync</span>
          </div>
          <p className="weekly-update-notice__title">
            This dashboard is <strong>not updated in real time</strong>
          </p>
          <p className="weekly-update-notice__body">
            Scores refresh after admin uploads — every{' '}
            {UPDATE_DAYS.map((day, i) => (
              <span key={day}>
                {i > 0 && (i === UPDATE_DAYS.length - 1 ? ' & ' : ', ')}
                <strong className="weekly-update-notice__day">{day}</strong>
              </span>
            ))}
            . Until the next sync, numbers may not reflect your latest work.
          </p>
        </div>
      </div>
    </div>
  );
}
