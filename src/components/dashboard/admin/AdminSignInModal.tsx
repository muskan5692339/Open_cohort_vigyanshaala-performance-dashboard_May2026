import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AdminSignInModal({ open, onClose }: Props) {
  const { signInWithPassword, signInWithMagicLink, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMagicSent(false);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your admin email.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'magic') {
        const { error: err } = await signInWithMagicLink(trimmed);
        if (err) {
          setError(err);
          return;
        }
        setMagicSent(true);
        return;
      }

      if (!password) {
        setError('Enter your password.');
        return;
      }
      const { error: err } = await signInWithPassword(trimmed, password);
      if (err) {
        setError(err);
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-sign-in-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 14,
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          padding: '24px 28px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 id="admin-sign-in-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: BRAND.navy }}>
              Admin sign in
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>
              Sign in to publish the student roster to the cloud for all devices.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: BRAND.textLight, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); setMagicSent(false); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${mode === 'password' ? BRAND.navy : BRAND.border}`,
              background: mode === 'password' ? '#f0f4ff' : '#fff',
              color: mode === 'password' ? BRAND.navy : BRAND.textLight,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Email & password
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError(null); setMagicSent(false); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${mode === 'magic' ? BRAND.navy : BRAND.border}`,
              background: mode === 'magic' ? '#f0f4ff' : '#fff',
              color: mode === 'magic' ? BRAND.navy : BRAND.textLight,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Magic link
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
            Admin email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@organization.org"
            autoComplete="email"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '11px 14px',
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              fontSize: 14,
              marginBottom: 12,
              fontFamily: 'inherit',
            }}
          />

          {mode === 'password' && (
            <>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '11px 14px',
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                  fontSize: 14,
                  marginBottom: 12,
                  fontFamily: 'inherit',
                }}
              />
            </>
          )}

          {error && (
            <div style={{ fontSize: 12, color: BRAND.red, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>
          )}
          {magicSent && (
            <div style={{ fontSize: 12, color: BRAND.green, marginBottom: 12, lineHeight: 1.5 }}>
              Check your email for a sign-in link, then return here and click Apply Mapping again.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || authLoading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              background: BRAND.navy,
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: submitting || authLoading ? 'progress' : 'pointer',
              opacity: submitting || authLoading ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Signing in…' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
