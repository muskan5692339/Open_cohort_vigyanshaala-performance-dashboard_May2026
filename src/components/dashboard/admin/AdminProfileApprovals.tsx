import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchProfileCorrectionsCloud,
  reviewProfileCorrectionCloud,
  type ProfileCorrectionStatus,
  type StudentProfileCorrection,
} from '../../../services/studentProfileCorrections';

const TEST_EMAILS = new Set(['deploy-check@example.com']);

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: ProfileCorrectionStatus): string {
  if (status === 'pending') return '#EF9F27';
  if (status === 'approved') return BRAND.green;
  return BRAND.red;
}

function CorrectionCard({
  item,
  busy,
  onReview,
}: {
  item: StudentProfileCorrection;
  busy: boolean;
  onReview: (id: string, status: 'approved' | 'rejected', note?: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const canAct = item.status === 'pending';

  return (
    <article style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 14, background: BRAND.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{item.studentName}</div>
          <div style={{ fontSize: 12, color: BRAND.textLight }}>{item.email}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#fff',
              background: statusColor(item.status),
            }}
          >
            {item.status}
          </span>
          <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>
            Submitted {formatWhen(item.submittedAt)}
          </div>
          {item.reviewedAt && (
            <div style={{ fontSize: 11, color: BRAND.textMuted }}>
              Reviewed {formatWhen(item.reviewedAt)}
            </div>
          )}
        </div>
      </div>
      <dl style={{ margin: '12px 0', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', fontSize: 13 }}>
        {item.fields.phone && (<><dt style={{ color: BRAND.textLight }}>Phone</dt><dd style={{ margin: 0 }}>{item.fields.phone}</dd></>)}
        {item.fields.college && (<><dt style={{ color: BRAND.textLight }}>College</dt><dd style={{ margin: 0 }}>{item.fields.college}</dd></>)}
        {item.fields.course && (<><dt style={{ color: BRAND.textLight }}>Course</dt><dd style={{ margin: 0 }}>{item.fields.course}</dd></>)}
        {item.fields.year && (<><dt style={{ color: BRAND.textLight }}>Year</dt><dd style={{ margin: 0 }}>{item.fields.year}</dd></>)}
      </dl>
      {item.adminNote && !canAct && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: BRAND.textLight }}>
          Note: {item.adminNote}
        </p>
      )}
      {canAct && (
        <>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note (saved with approval/rejection)"
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${BRAND.border}`, padding: 8, fontSize: 12, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview(item.id, 'approved', note.trim() || undefined)}
              style={btnStyle(BRAND.green, busy)}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview(item.id, 'rejected', note.trim() || undefined)}
              style={btnStyle(BRAND.red, busy)}
            >
              Reject
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function btnStyle(bg: string, disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    background: bg,
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: 16, border: `1px dashed ${BRAND.border}`, borderRadius: 10, background: '#fafafa' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: BRAND.navy }}>{title}</h3>
        <span style={{ fontSize: 13, color: BRAND.textLight }}>({count})</span>
      </div>
      {children}
    </section>
  );
}

export default function AdminProfileApprovals() {
  const { session, organization } = useAuth();
  const [items, setItems] = useState<StudentProfileCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchProfileCorrectionsCloud(
      session?.access_token,
      organization?.id,
      'all',
    );
    const real = (result.items ?? []).filter(
      i => !TEST_EMAILS.has(String(i.email || '').toLowerCase()),
    );
    setItems(real);
    setError(result.error);
    setLoading(false);
  }, [session?.access_token, organization?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(() => items.filter(i => i.status === 'pending'), [items]);
  const approved = useMemo(() => items.filter(i => i.status === 'approved'), [items]);
  const rejected = useMemo(() => items.filter(i => i.status === 'rejected'), [items]);
  const history = useMemo(() => {
    const rows = items.filter(i => i.status === 'approved' || i.status === 'rejected');
    if (historyFilter === 'approved') return rows.filter(i => i.status === 'approved');
    if (historyFilter === 'rejected') return rows.filter(i => i.status === 'rejected');
    return rows;
  }, [items, historyFilter]);

  const onReview = async (id: string, status: 'approved' | 'rejected', note?: string) => {
    setBusyId(id);
    setActionError(null);
    const result = await reviewProfileCorrectionCloud(
      session?.access_token,
      id,
      status,
      note,
      organization?.id,
    );
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await load();
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>
          Students request profile corrections from their dashboard. Approve pending items below — reviewed ones stay in History.
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          Refresh
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: '#fff8eb' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase' }}>Pending now</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>{pending.length}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: BRAND.greenLight }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase' }}>Approved</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>{approved.length}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: '#fef2f2' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase' }}>Rejected</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>{rejected.length}</div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13 }}>
          {error}
        </div>
      )}
      {actionError && (
        <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: BRAND.textLight }}>Loading student updates…</div>
      ) : (
        <>
          <Section title="Pending requests" count={pending.length}>
            {pending.length === 0 ? (
              <EmptyState
                title="No pending student requests"
                body="When a student taps “Update my details” and submits, their request appears here for Approve / Reject."
              />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {pending.map(item => (
                  <CorrectionCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onReview={onReview}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="History (approved & rejected)" count={approved.length + rejected.length}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {([
                ['all', `All (${approved.length + rejected.length})`],
                ['approved', `Approved (${approved.length})`],
                ['rejected', `Rejected (${rejected.length})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHistoryFilter(key)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: historyFilter === key ? 'none' : `1px solid ${BRAND.border}`,
                    background: historyFilter === key ? BRAND.navy : '#fff',
                    color: historyFilter === key ? '#fff' : BRAND.text,
                    fontWeight: 650,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {history.length === 0 ? (
              <EmptyState
                title="No approval history yet"
                body="After you Approve or Reject a pending request, it stays listed here. Requests made before cloud sync (13 Sept 2026 evening) were only on student phones and cannot be recovered — ask those students to submit again."
              />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {history.map(item => (
                  <CorrectionCard
                    key={item.id}
                    item={item}
                    busy={false}
                    onReview={async () => {}}
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
