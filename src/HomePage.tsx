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

  return (
    <div className="student-home">
      <header className="student-home__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/favicon.svg" alt="VigyanShaala logo" width="36" height="36" style={{ display: 'block' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>VigyanShaala</span>
        </div>
        {showAdminNav && onAdminView && (
          <nav style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: BRAND.purpleLight, color: BRAND.purple, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              Student
            </button>
            <button
              type="button"
              onClick={onAdminView}
              style={{ padding: '8px 22px', borderRadius: 8, border: `1px solid ${BRAND.border}`, background: 'transparent', color: BRAND.textLight, cursor: 'pointer', fontSize: 14 }}
            >
              Admin
            </button>
          </nav>
        )}
      </header>

      <main className={`student-home__main${studentOnly ? ' student-home__main--single' : ''}`}>
        <div>
          <div style={{ display: 'inline-block', padding: '5px 14px', background: BRAND.purpleLight, color: BRAND.purple, borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 28 }}>
            Student Performance Dashboard
          </div>

          <h1 className="student-home__title">
            Track your progress.<br />Stay on top of<br />every session.
          </h1>

          <p style={{ fontSize: 16, color: BRAND.textLight, lineHeight: 1.75, margin: '0 0 32px', maxWidth: 440 }}>
            View your attendance, assignment status, and quiz scores — updated weekly from your cohort&apos;s master workbook.
          </p>

          {studentOnly && (
            <RosterSyncStatus
              publishedAt={meta?.publishedAt ?? meta?.loadedAt ?? null}
              fetchedAt={meta?.fetchedAt ?? null}
              loading={datasetLoading}
              refreshing={rosterRefreshing}
              isStale={rosterIsStale}
              incomplete={rosterIncomplete}
              studentCount={lookupCount}
              onRefresh={() => { void refreshRoster(); }}
            />
          )}

          <form onSubmit={handleSubmit}>
            <label htmlFor="student-email" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
              Registered email
            </label>
            <p style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.6, margin: '0 0 12px' }}>
              Enter your She for STEM registered email ID to view your performance dashboard.
              {datasetLoading && (
                <span style={{ display: 'block', marginTop: 6, color: BRAND.purple }}>Loading cohort roster…</span>
              )}
              {!datasetLoading && lookupCount > 0 && (
                <span style={{ display: 'block', marginTop: 6, color: '#15803d' }}>
                  {lookupCount} registered email{lookupCount === 1 ? '' : 's'} ready
                  {meta?.loadedAt ? ` (updated ${new Date(meta.loadedAt).toLocaleDateString()})` : ''}.
                </span>
              )}
              {!datasetLoading && lookupCount === 0 && (
                <span style={{ display: 'block', marginTop: 6, color: '#b45309' }}>
                  {datasetError ?? 'No cohort roster loaded on this device yet.'}
                </span>
              )}
            </p>

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
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => selectSuggestion(suggestion)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '12px 16px',
                            border: 'none',
                            background: 'transparent',
                            color: BRAND.text,
                            fontSize: 15,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
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

            {showSuggestions && email.trim().length > 0 && suggestions.length === 0 && lookupCount > 0 && (
              <p className="student-home__no-match" role="status">
                No matching email in the cohort roster.
              </p>
            )}

            {error && <p className="student-home__error" role="alert">{error}</p>}
          </form>
        </div>

        {!studentOnly && (
          <div className="student-home__promo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: BRAND.navy, borderRadius: 20, padding: '32px 28px', color: BRAND.white }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                  📚
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, opacity: 0.55, textTransform: 'uppercase', marginBottom: 6 }}>
                    Live Cohort Metrics
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
                    Real-time program insights
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.75, margin: 0 }}>
                Built for the operations team: identify at-risk students, monitor cohort completion, and review every session at a glance.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: BRAND.white, borderRadius: 16, padding: '22px 20px', border: `1px solid ${BRAND.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 30, marginBottom: 14 }}>📊</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>Visual progress</div>
                <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>Pie + trend charts for attendance.</div>
              </div>
              <div style={{ background: BRAND.white, borderRadius: 16, padding: '22px 20px', border: `1px solid ${BRAND.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 30, marginBottom: 14 }}>☁️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>OneDrive sync</div>
                <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>Reads weekly Excel updates automatically.</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
