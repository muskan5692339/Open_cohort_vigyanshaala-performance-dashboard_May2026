import { useCallback, useEffect, useState } from 'react';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchReminderStatus,
  formatIstTime,
  statusLabel,
  type ReminderStatusPayload,
} from '../../../services/reminderStatusMetrics';

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function statusColor(status?: string): string {
  if (status === 'sent') return BRAND.green;
  if (status === 'sending_window') return '#b45309';
  if (status === 'pending') return BRAND.blue;
  return BRAND.textMuted;
}

export default function AdminReminderStatus() {
  const { session, cloudEnabled, organization } = useAuth();
  const [data, setData] = useState<ReminderStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!cloudEnabled || !session?.access_token) {
      setData(null);
      setError('Sign in with cloud admin access to view weekly report status.');
      setLoading(false);
      return;
    }
    const { data: payload, error: fetchError } = await fetchReminderStatus(
      session.access_token,
      organization?.id,
    );
    setData(payload);
    setError(fetchError ?? payload?.note ?? null);
    setLoading(false);
  }, [cloudEnabled, session?.access_token, organization?.id]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Weekly student reports</strong> — automatic email status for eligible students.
        <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 6 }}>
          Schedule: Sunday 9:30 AM IST · Wednesday 3:30 PM IST
          {data?.istNow ? <> · Now: {data.istNow}</> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.navy,
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh status'}
        </button>
        {data?.nextSend && (
          <span style={{ fontSize: 13, color: BRAND.textLight }}>
            Next: <strong style={{ color: BRAND.navy }}>{data.nextSend.label}</strong> — {data.nextSend.when}
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#9a3412' }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ fontSize: 13, color: BRAND.textLight }}>Loading report status…</div>
      ) : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard label="Eligible now" value={data.eligibleNow} hint="Would get email if run now" />
            <StatCard label="Sunday sent" value={data.sundaySentCount} hint={data.sundayWeekKey} />
            <StatCard label="Wednesday sent" value={data.midweekSentCount} hint={data.midweekWeekKey} />
            <StatCard label="Last send" value={formatIstTime(data.lastSentAt)} hint={data.cohortName} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {data.schedule.map(item => (
              <div
                key={item.key}
                style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.navy }}>{item.label}</div>
                <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>{item.when}</div>
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: statusColor(item.status) }}>
                  {statusLabel(item.status)}
                  {typeof item.sentCount === 'number' ? ` · ${item.sentCount} email(s)` : ''}
                </div>
                {item.weekKey && (
                  <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 6 }}>Key: {item.weekKey}</div>
                )}
              </div>
            ))}
          </div>

          {data.weekSummaries.length > 0 && (
            <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Recent weeks</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
                    <th style={{ padding: '8px 6px' }}>Week key</th>
                    <th style={{ padding: '8px 6px' }}>Emails sent</th>
                    <th style={{ padding: '8px 6px' }}>Last sent (IST)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weekSummaries.map(w => (
                    <tr key={w.weekKey} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{w.weekKey}</td>
                      <td style={{ padding: '8px 6px' }}>{w.sent}</td>
                      <td style={{ padding: '8px 6px' }}>{formatIstTime(w.lastSentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              Recent sends {data.recentSends.length ? `(${data.recentSends.length})` : ''}
            </div>
            {data.recentSends.length === 0 ? (
              <div style={{ fontSize: 13, color: BRAND.textLight }}>
                No emails logged yet for this week. After today&apos;s 9:30 AM IST run, rows will appear here.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
                    {['Student', 'Email', 'Reasons', 'Att %', 'Assign %', 'Quiz', 'Sent (IST)', 'Week'].map(h => (
                      <th key={h} style={{ padding: '8px 6px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recentSends.map(row => (
                    <tr key={`${row.email}-${row.weekKey}-${row.sentAt}`} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.name || '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{row.email}</td>
                      <td style={{ padding: '8px 6px' }}>{(row.reasons ?? []).join(', ') || '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{row.attendancePct ?? '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{row.assignmentPct ?? '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{row.avgQuiz ?? '—'}</td>
                      <td style={{ padding: '8px 6px' }}>{formatIstTime(row.sentAt)}</td>
                      <td style={{ padding: '8px 6px' }}>{row.weekKey}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
