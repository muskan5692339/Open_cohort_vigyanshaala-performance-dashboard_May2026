import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchStudentPortalStats,
  formatDurationMs,
  type StudentPortalStats,
} from '../../../services/studentEngagementMetrics';

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function AdminStudentPortalAnalytics() {
  const { session, cloudEnabled, organization } = useAuth();
  const [days, setDays] = useState(0);
  const [stats, setStats] = useState<StudentPortalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodLabel =
    days === 0 ? 'all time (since tracking started)' : `last ${days} days`;

  const formatTrackingDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      if (!cloudEnabled || !session?.access_token) {
        if (!cancelled) {
          setStats(null);
          setError('Sign in with cloud admin access to view student portal analytics.');
          setLoading(false);
        }
        return;
      }
      const { stats: data, error: fetchError } = await fetchStudentPortalStats(
        session.access_token,
        days,
        organization?.id,
      );
      if (cancelled) return;
      if (!data) {
        setStats(null);
        setError(fetchError ?? 'Could not load portal analytics.');
      } else {
        setStats(data);
        setError(
          data.telemetryReady === false
            ? 'Telemetry table not set up yet — run Supabase migration 006_sprint8_cloud.sql. Showing zeros until then.'
            : null,
        );
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session?.access_token, cloudEnabled, days, organization?.id]);

  const topStudents = (stats?.studentBreakdown ?? []).slice(0, 12).map(s => ({
    email: s.email === 'anonymous' ? 'Not signed in' : s.email,
    minutes: Math.round(s.activeMs / 60_000 * 10) / 10,
    clicks: s.clicks,
  }));

  const formatStudentLabel = (email: string) =>
    email === 'anonymous' ? 'Not signed in (landing page)' : email;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Student portal usage</strong> — clicks and time on{' '}
        <code style={{ fontSize: 12 }}>/student-view</code>
        <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 6 }}>
          Cumulative click and time history for <code style={{ fontSize: 11 }}>/student-view</code>.
          Choose <strong>All time</strong> for total counts since tracking began.
          Pre-tracking traffic is not included. Site-wide page views are also in Vercel → Analytics.
        </div>
        {stats?.firstEventAt && (
          <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 6 }}>
            Tracking since {formatTrackingDate(stats.firstEventAt)}
            {stats.lastEventAt ? ` · Last activity ${formatTrackingDate(stats.lastEventAt)}` : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Period
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value={0}>All time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {loading && (
        <div style={{ padding: 24, color: BRAND.textLight, fontSize: 13 }}>Loading portal analytics…</div>
      )}

      {!loading && error && (
        <div style={{ padding: 16, background: BRAND.yellowLight, border: `1px solid ${BRAND.yellow}`, borderRadius: 10, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && stats && stats.totalViews === 0 && stats.totalClicks === 0 && (
        <div style={{ padding: 16, background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, fontSize: 13 }}>
          No student portal activity recorded yet for this period. Share{' '}
          <code style={{ fontSize: 12 }}>/student-view</code> with students — visits and clicks will appear here after they use the dashboard.
        </div>
      )}

      {!loading && stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <StatCard label="Page visits" value={String(stats.totalViews)} hint="Opens of student dashboard" />
            <StatCard
              label="Total clicks"
              value={String(stats.totalClicks)}
              hint={days === 0 ? 'All recorded clicks since tracking started' : `Clicks in the ${periodLabel}`}
            />
            <StatCard label="Total time" value={formatDurationMs(stats.totalActiveMs)} hint="Active time (tab visible)" />
            <StatCard label="Unique students" value={String(stats.uniqueStudents)} hint="Students who entered email" />
            <StatCard label="Avg time / student" value={formatDurationMs(stats.avgTimePerStudentMs)} hint="Total time ÷ unique students" />
            <StatCard label="Avg time / visit" value={formatDurationMs(stats.avgTimePerSessionMs)} hint="Per browser session" />
          </div>

          {topStudents.length > 0 && (
            <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Time on page by student</div>
              <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
                Top students by active minutes ({periodLabel})
              </div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topStudents} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                    <XAxis dataKey="email" fontSize={10} stroke={BRAND.textLight} angle={-25} textAnchor="end" height={50} />
                    <YAxis fontSize={11} stroke={BRAND.textLight} unit=" min" />
                    <Tooltip
                      formatter={(value, name) => [
                        name === 'minutes' ? `${value} min` : value,
                        name === 'minutes' ? 'Active time' : 'Clicks',
                      ]}
                    />
                    <Bar dataKey="minutes" name="minutes" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Student breakdown</div>
            <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    {['Email', 'Visits', 'Clicks', 'Total time', 'Avg / visit'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${BRAND.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.studentBreakdown.map(s => (
                    <tr key={s.email} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{formatStudentLabel(s.email)}</td>
                      <td style={{ padding: '8px 10px' }}>{s.views}</td>
                      <td style={{ padding: '8px 10px' }}>{s.clicks}</td>
                      <td style={{ padding: '8px 10px' }}>{formatDurationMs(s.activeMs)}</td>
                      <td style={{ padding: '8px 10px' }}>{formatDurationMs(s.avgSessionMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
