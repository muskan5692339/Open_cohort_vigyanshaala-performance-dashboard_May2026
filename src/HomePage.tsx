import { useEffect, useMemo, useRef, useState } from 'react';
import { useUploadedExcel } from './context/UploadedExcelContext';
import {
  getAllStudentEmails,
  getStudentLookupCount,
  hasStudentEmail,
  normalizeStudentEmail,
  searchStudentEmails,
} from './services/studentEmailLookup';

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
}

export default function HomePage({ onViewDashboard, onAdminView, showAdminNav = true }: HomePageProps) {
  const { payload: excelPayload } = useUploadedExcel();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const datasetEmails = useMemo(() => getAllStudentEmails(excelPayload), [excelPayload]);

  const suggestions = useMemo(
    () => searchStudentEmails(excelPayload, email, 5),
    [excelPayload, email],
  );

  const canViewDashboard = useMemo(() => {
    const trimmed = normalizeStudentEmail(email);
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
    return hasStudentEmail(excelPayload, trimmed);
  }, [email, excelPayload]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[StudentLookup] records available:', getStudentLookupCount(excelPayload));
    }
  }, [excelPayload, datasetEmails.length]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setError('');
    setShowSuggestions(value.trim().length > 0);
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
      setError('No student dataset loaded. Ask your admin to upload the cohort workbook first.');
      return;
    }

    if (!hasStudentEmail(excelPayload, trimmed)) {
      setError('No student found with this email ID.');
      return;
    }

    onViewDashboard(trimmed);
  };

  return (
    <div style={{ minHeight: '100vh', background: BRAND.white, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <header style={{ padding: '16px 40px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: BRAND.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/favicon.svg" alt="VigyanShaala logo" width="36" height="36" style={{ display: 'block' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>VigyanShaala</span>
        </div>
        {showAdminNav && onAdminView && (
          <nav style={{ display: 'flex', gap: 6 }}>
            <button style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: BRAND.purpleLight, color: BRAND.purple, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
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

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-block', padding: '5px 14px', background: BRAND.purpleLight, color: BRAND.purple, borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 28 }}>
            Student Performance Dashboard
          </div>

          <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.12, color: BRAND.text, margin: '0 0 20px', letterSpacing: -1 }}>
            Track your progress.<br />Stay on top of<br />every session.
          </h1>

          <p style={{ fontSize: 16, color: BRAND.textLight, lineHeight: 1.75, margin: '0 0 40px', maxWidth: 440 }}>
            View your attendance, assignment status, and quiz scores — updated weekly from your cohort&apos;s master workbook.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
              Registered email
            </label>
            <p style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.6, margin: '0 0 12px', maxWidth: 440 }}>
              Enter your She for STEM registered email ID to view your performance dashboard.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div ref={inputWrapRef} style={{ flex: 1, position: 'relative' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  onFocus={() => { if (email.trim()) setShowSuggestions(true); }}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  placeholder="you@example.com"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && suggestions.length > 0}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 20px',
                    borderRadius: 50,
                    border: `1.5px solid ${error ? '#ef4444' : BRAND.border}`,
                    fontSize: 15,
                    outline: 'none',
                    background: '#f9fafb',
                    color: BRAND.text,
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                  }}
                  onFocusCapture={e => { e.currentTarget.style.borderColor = BRAND.purple; }}
                  onBlurCapture={e => { e.currentTarget.style.borderColor = error ? '#ef4444' : BRAND.border; }}
                />

                {showSuggestions && suggestions.length > 0 && (
                  <ul
                    role="listbox"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      margin: 0,
                      padding: '6px 0',
                      listStyle: 'none',
                      background: BRAND.white,
                      border: `1px solid ${BRAND.border}`,
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                      zIndex: 20,
                      maxHeight: 220,
                      overflowY: 'auto',
                    }}
                  >
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
                            padding: '10px 18px',
                            border: 'none',
                            background: 'transparent',
                            color: BRAND.text,
                            fontSize: 14,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = BRAND.purpleLight; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
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
                disabled={!canViewDashboard}
                style={{
                  padding: '13px 28px',
                  borderRadius: 50,
                  border: 'none',
                  background: canViewDashboard ? BRAND.navy : '#9ca3af',
                  color: BRAND.white,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: canViewDashboard ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => {
                  if (canViewDashboard) (e.target as HTMLButtonElement).style.background = BRAND.navyLight;
                }}
                onMouseLeave={e => {
                  if (canViewDashboard) (e.target as HTMLButtonElement).style.background = BRAND.navy;
                }}
              >
                View Dashboard
              </button>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '4px 0 0' }}>{error}</p>}
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
      </main>
    </div>
  );
}
