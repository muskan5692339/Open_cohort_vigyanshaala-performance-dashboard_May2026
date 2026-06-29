import { useState } from 'react';
import './AnimeHelpAssistant.css';

const TICKET_URL = 'https://wkf.ms/4oa7MqM';

type Step = 'idle' | 'menu' | 'tip' | 'resolved' | 'ticket';

interface HelpOption {
  id: string;
  label: string;
  tip: string;
}

const OPTIONS: HelpOption[] = [
  {
    id: 'attendance',
    label: 'Attendance looks wrong',
    tip: 'Attendance is calculated from class-wise session hours (max 1 hr per session). Refresh the page to load the latest roster. If it still looks off, ask your program coordinator to re-publish the Excel file.',
  },
  {
    id: 'quiz',
    label: 'Quiz score is missing',
    tip: 'Quiz scores appear after your facilitator updates the master sheet and publishes it. Check back after the next sync, or confirm your quiz was submitted on time.',
  },
  {
    id: 'assignment',
    label: 'Assignment not updated',
    tip: 'Assignments show as complete only when marked Accepted/Submitted in the cohort sheet. Finish pending items and wait for the admin upload to refresh.',
  },
  {
    id: 'other',
    label: 'Something else',
    tip: 'Describe your issue to your program team. If the dashboard still shows incorrect data after a refresh, raise a support ticket and include your registered email.',
  },
];

export default function AnimeHelpAssistant() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [activeTip, setActiveTip] = useState('');

  const reset = () => {
    setStep('menu');
    setActiveTip('');
  };

  const openPanel = () => {
    setOpen(true);
    reset();
  };

  const closePanel = () => {
    setOpen(false);
    setStep('idle');
    setActiveTip('');
  };

  const pickOption = (option: HelpOption) => {
    setActiveTip(option.tip);
    setStep('tip');
  };

  return (
    <>
      <button
        type="button"
        className="help-assistant__fab"
        onClick={openPanel}
        aria-label="Open help assistant"
        aria-expanded={open}
      >
        <div className="help-assistant__fab-mascot" aria-hidden="true">
          <div className="help-assistant__fab-hair" />
          <div className="help-assistant__fab-face">
            <span className="help-assistant__fab-eye help-assistant__fab-eye--l" />
            <span className="help-assistant__fab-eye help-assistant__fab-eye--r" />
          </div>
          <div className="help-assistant__fab-body" />
          <span className="help-assistant__fab-headset" />
        </div>
        <span className="help-assistant__fab-label">Need help?</span>
      </button>

      {open && (
        <div className="help-assistant__backdrop" onClick={closePanel} aria-hidden="true" />
      )}

      <div className={`help-assistant__panel ${open ? 'help-assistant__panel--open' : ''}`} role="dialog" aria-label="Help assistant">
        <div className="help-assistant__panel-head">
          <div className="help-assistant__panel-title">VigyanShaala Guide</div>
          <button type="button" className="help-assistant__close" onClick={closePanel} aria-label="Close">×</button>
        </div>

        <div className="help-assistant__panel-body">
          {step === 'menu' && (
            <>
              <p className="help-assistant__greeting">Hi! How can I help you today?</p>
              <div className="help-assistant__options">
                {OPTIONS.map(opt => (
                  <button key={opt.id} type="button" className="help-assistant__option" onClick={() => pickOption(opt)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'tip' && (
            <>
              <p className="help-assistant__tip">{activeTip}</p>
              <p className="help-assistant__question">Did this solve your problem?</p>
              <div className="help-assistant__actions">
                <button type="button" className="help-assistant__btn help-assistant__btn--ok" onClick={() => setStep('resolved')}>
                  Yes, thanks!
                </button>
                <button type="button" className="help-assistant__btn help-assistant__btn--no" onClick={() => setStep('ticket')}>
                  No, I need more help
                </button>
              </div>
            </>
          )}

          {step === 'resolved' && (
            <>
              <p className="help-assistant__tip">Glad I could help! Keep up the great work in your cohort.</p>
              <button type="button" className="help-assistant__btn help-assistant__btn--ok" onClick={closePanel}>
                Close
              </button>
            </>
          )}

          {step === 'ticket' && (
            <>
              <p className="help-assistant__tip">
                No worries — our team can look into this. Please raise a ticket with your registered email and a short description.
              </p>
              <a
                href={TICKET_URL}
                target="_blank"
                rel="noreferrer"
                className="help-assistant__ticket-link"
              >
                Open support ticket
              </a>
              <button type="button" className="help-assistant__btn help-assistant__btn--ghost" onClick={reset}>
                Back to menu
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
