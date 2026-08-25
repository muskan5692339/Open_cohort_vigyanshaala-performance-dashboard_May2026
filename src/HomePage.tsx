import { useEffect, useMemo, useRef, useState } from 'react';
import { useUploadedExcel } from './context/UploadedExcelContext';
import {
  getAllStudentEmails,
  getStudentLookupCount,
  hasStudentEmail,
  normalizeStudentEmail,
  searchStudentEmails,
} from './services/studentEmailLookup';
import './styles/HomePage.css';
import RosterSyncStatus from './components/student/RosterSyncStatus';
import { adminDataUpdatedAt, formatAdminUpdateTime } from './utils/formatAdminUpdateTime';

const BRAND = {
  purple: '#863bff',
  purpleDark: '#6b2fd4',
  purpleLight: '#f0e8ff',
  navy: '#1e2d45',
  navyLight: '#2d3f5a',
  white: '#ffffff',
  bg: '#f8f9fa',
  text: '#111827',
  textLight: '#6b7280',
  border: '#e5e7eb',
};

interface HomePageProps {
  onViewDashboard: (email: string) => void;
  onAdminView?: () => void;
  showAdminNav?: boolean;
  /** Student-only route: simpler layout, hide promo cards. */
  studentOnly?: boolean;
}

export default function HomePage({
  onViewDashboard,
  onAdminView,
  showAdminNav = true,
  studentOnly = false,
}: HomePageProps) {
  const {
    payload: excelPayload,
    meta,
    datasetLoading,
    datasetError,
    rosterRefreshing,
    rosterIsStale,
    rosterIncomplete,
    refreshRoster,
  } = useUploadedExcel();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const datasetEmails = useMemo(() => getAllStudentEmails(excelPayload), [excelPayload]);
  const lookupCount = datasetEmails.length;

  const suggestions = useMemo(
    () => searchStudentEmails(excelPayload, email, 5),
    [excelPayload, email],
  );

  const canViewDashboard = useMemo(() => {
    const trimmed = normalizeStudentEmail(email);
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
    return hasStudentEmail(excelPayload, trimmed);
  }, [email, excelPayload]);

  const canSubmitEmail = useMemo(() => {
    const trimmed = normalizeStudentEmail(email);
    return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }, [email]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[StudentLookup] records available:', lookupCount);
    }
  }, [excelPayload, lookupCount]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setError('');
    setShowSuggestions(value.trim().length >= 1);
  };

  const selectSuggestion = (suggestion: string) => {
    setEmail(suggestion);
    setError('');
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = normalizeStudentEmail(email);
    if (!trimmed) {
      setError('Please enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    if (getStudentLookupCount(excelPayload) === 0) {
      setError(
        datasetLoading
          ? 'Loading student roster…'
          : 'No student dataset loaded. Ask your admin to upload the cohort workbook first.',
      );
      return;
    }

    if (!hasStudentEmail(excelPayload, trimmed)) {
      setError('No student found with this email ID.');
      return;
    }

    onViewDashboard(trimmed);
  };

  const submitBg = canViewDashboard
    ? BRAND.navy
    : canSubmitEmail
      ? BRAND.purple
      : '#9ca3af';

  const adminUpdatedAt = adminDataUpdatedAt(meta);

  return (
    <div className="student-home">
      <header className="student-home__header">
        <div className="student-home__brand">
          <img src="/favicon.svg" alt="VigyanShaala logo" width="28" height="28" />
          <span>VigyanShaala</span>
        </div>
        {showAdminNav && onAdminView && (
          <nav className="student-home__nav">
            <button type="button" className="student-home__nav-btn student-home__nav-btn--active">
              Student
            </button>
            <button type="button" onClick={onAdminView} className="student-home__nav-btn">
              Admin
            </button>
          </nav>
        )}
      </header>

      <main className={`student-home__main${studentOnly ? ' student-home__main--single' : ''}`}>
        <div className="student-home__login">
          <div className="student-home__badge">Student dashboard</div>

          <h1 className="student-home__title">
            Enter your email to view progress
          </h1>

          <p className="student-home__lead">
            Attendance, assignments &amp; quizzes from your cohort workbook.
          </p>

          {studentOnly && (
            <div className="student-home__sync">
              <RosterSyncStatus
                publishedAt={adminUpdatedAt}
                fetchedAt={meta?.fetchedAt ?? null}
                loading={datasetLoading}
                refreshing={rosterRefreshing}
                isStale={rosterIsStale}
                incomplete={rosterIncomplete}
                studentCount={lookupCount}
                onRefresh={() => { void refreshRoster(); }}
                adminTimeOnly
                compact
              />
            </div>
          )}

          <form className="student-home__form" onSubmit={handleSubmit}>
            <label htmlFor="student-email" className="student-home__label">
              Registered email
            </label>

            <div className="student-home__email-row">
              <div ref={inputWrapRef} className="student-home__input-wrap">
                <input
                  id="student-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="go"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  onFocus={() => { if (email.trim()) setShowSuggestions(true); }}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  placeholder="you@example.com"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && suggestions.length > 0}
                  className={`student-home__email-input${error ? ' student-home__email-input--error' : ''}`}
                />

                {showSuggestions && email.trim().length > 0 && suggestions.length > 0 && (
                  <ul className="student-home__suggestions" role="listbox">
                    {suggestions.map(suggestion => (
                      <li key={suggestion} role="option">
                        <button
                          type="button"
                          className="student-home__suggestion-btn"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmitEmail || datasetLoading}
                className="student-home__submit-btn"
                style={{
                  background: submitBg,
                  cursor: canSubmitEmail && !datasetLoading ? 'pointer' : 'not-allowed',
                }}
              >
                View Dashboard
              </button>
            </div>

            <p className="student-home__hint">
              Use your She for STEM registered email.
              {datasetLoading && <span className="student-home__hint--loading"> Loading roster…</span>}
              {!datasetLoading && lookupCount > 0 && (
                <span className="student-home__hint--ok">
                  {' '}{lookupCount} emails ready
                  {adminUpdatedAt ? ` · ${formatAdminUpdateTime(adminUpdatedAt)}` : ''}.
                </span>
              )}
              {!datasetLoading && lookupCount === 0 && (
                <span className="student-home__hint--warn">
                  {' '}{datasetError ?? 'Roster not loaded yet.'}
                </span>
              )}
            </p>

            {showSuggestions && email.trim().length > 0 && suggestions.length === 0 && lookupCount > 0 && (
              <p className="student-home__no-match" role="status">
                No matching email in the cohort roster.
              </p>
            )}

            {error && <p className="student-home__error" role="alert">{error}</p>}
          </form>
        </div>

        {!studentOnly && (
          <div className="student-home__promo">
            <div className="student-home__promo-card">
              <div className="student-home__promo-kicker">Live cohort</div>
              <div className="student-home__promo-title">Your scores in one place</div>
              <p className="student-home__promo-body">
                Check attendance, assignment status, and quiz scores after each admin sync.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
