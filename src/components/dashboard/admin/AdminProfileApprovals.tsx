import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchProfileCorrectionsCloud,
  recoverLocalProfileCorrections,
  restoreProfileCorrectionsFromBrowser,
  reviewProfileCorrectionCloud,
  type ProfileCorrectionStatus,
  type StudentProfileCorrection,
} from '../../../services/studentProfileCorrections';

const TEST_EMAILS = new Set(['deploy-check@example.com']);

type ChangeCategory = 'phone' | 'college' | 'course' | 'year';

const CATEGORIES: { key: ChangeCategory; label: string }[] = [
  { key: 'phone', label: 'Phone' },
  { key: 'college', label: 'College' },
  { key: 'course', label: 'Course' },
  { key: 'year', label: 'Year' },
];

function fieldValue(item: StudentProfileCorrection, key: ChangeCategory): string {
  return item.fields[key]?.trim() ?? '';
}

function requestedCategories(item: StudentProfileCorrection): ChangeCategory[] {
  return CATEGORIES.map(c => c.key).filter(key => fieldValue(item, key));
}

function matchesQuery(item: StudentProfileCorrection, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.studentName,
    item.email,
    item.status,
    ...CATEGORIES.map(c => fieldValue(item, c.key)),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

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

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: active ? 'none' : `1px solid ${BRAND.border}`,
    background: active ? BRAND.navy : '#fff',
    color: active ? '#fff' : BRAND.text,
    fontWeight: 650,
    fontSize: 12,
    cursor: 'pointer',
  };
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

function ChangesTable({
  rows,
  category,
  busyId,
  notes,
  onNote,
  onReview,
}: {
  rows: StudentProfileCorrection[];
  category: ChangeCategory | 'all';
  busyId: string | null;
  notes: Record<string, string>;
  onNote: (id: string, value: string) => void;
  onReview: (id: string, status: 'approved' | 'rejected', note?: string) => Promise<void>;
}) {
  const columns = category === 'all' ? CATEGORIES : CATEGORIES.filter(c => c.key === category);

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${BRAND.border}`, borderRadius: 10, background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: category === 'all' ? 980 : 760 }}>
        <thead>
          <tr style={{ background: BRAND.bg, textAlign: 'left' }}>
            {['Student', 'Email', ...columns.map(c => c.label), 'Submitted', 'Note', ''].map(label => (
              <th
                key={label || 'actions'}
                style={{
                  padding: '10px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: BRAND.textLight,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  borderBottom: `1px solid ${BRAND.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(item => {
            const busy = busyId === item.id;
            return (
              <tr key={item.id} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: BRAND.navy, whiteSpace: 'nowrap' }}>
                  {item.studentName}
                </td>
                <td style={{ padding: '10px 12px', color: BRAND.textLight }}>{item.email}</td>
                {columns.map(col => {
                  const value = fieldValue(item, col.key);
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', minWidth: 140, color: value ? BRAND.text : BRAND.textMuted }}>
                      {value || '—'}
                    </td>
                  );
                })}
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: BRAND.textLight }}>
                  {formatWhen(item.submittedAt)}
                </td>
                <td style={{ padding: '8px 12px', minWidth: 160 }}>
                  <input
                    value={notes[item.id] ?? ''}
                    onChange={e => onNote(item.id, e.target.value)}
                    placeholder="Optional"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      borderRadius: 8,
                      border: `1px solid ${BRAND.border}`,
                      padding: '6px 8px',
                      fontSize: 12,
                    }}
                  />
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onReview(item.id, 'approved', notes[item.id]?.trim() || undefined)}
                      style={btnStyle(BRAND.green, busy)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onReview(item.id, 'rejected', notes[item.id]?.trim() || undefined)}
                      style={btnStyle(BRAND.red, busy)}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const [info, setInfo] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ChangeCategory | 'all'>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const localBrowserCount = useMemo(() => recoverLocalProfileCorrections().length, [items]);

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
    if (result.recoveredFromBrowser && result.recoveredFromBrowser > 0) {
      setInfo(`Restored ${result.recoveredFromBrowser} request(s) from this browser into cloud history.`);
    }
    setLoading(false);
  }, [session?.access_token, organization?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRestoreFromBrowser = async () => {
    setRestoring(true);
    setActionError(null);
    setInfo(null);
    const result = await restoreProfileCorrectionsFromBrowser(
      session?.access_token,
      organization?.id,
    );
    setRestoring(false);
    if (result.error && !(result.items?.length)) {
      setActionError(result.error);
      return;
    }
    const real = (result.items ?? []).filter(
      i => !TEST_EMAILS.has(String(i.email || '').toLowerCase()),
    );
    setItems(real);
    if (result.error) setError(result.error);
    setInfo(
      result.recoveredFromBrowser && result.recoveredFromBrowser > 0
        ? `Restored ${result.recoveredFromBrowser} request(s) from this browser into cloud.`
        : 'Checked this browser — no extra history to restore beyond what is already shown.',
    );
  };

  const pending = useMemo(() => items.filter(i => i.status === 'pending'), [items]);
  const approved = useMemo(() => items.filter(i => i.status === 'approved'), [items]);
  const rejected = useMemo(() => items.filter(i => i.status === 'rejected'), [items]);
  const searchedPending = useMemo(
    () => pending.filter(item => matchesQuery(item, query)),
    [pending, query],
  );
  const categoryCounts = useMemo(() => {
    const counts = { phone: 0, college: 0, course: 0, year: 0 };
    for (const item of searchedPending) {
      for (const key of requestedCategories(item)) counts[key] += 1;
    }
    return counts;
  }, [searchedPending]);
  const changeRows = useMemo(() => {
    const rows = category === 'all'
      ? searchedPending
      : searchedPending.filter(item => fieldValue(item, category));
    return rows;
  }, [searchedPending, category]);
  const history = useMemo(() => {
    const rows = items.filter(i => i.status === 'approved' || i.status === 'rejected');
    const byStatus = historyFilter === 'approved'
      ? rows.filter(i => i.status === 'approved')
      : historyFilter === 'rejected'
        ? rows.filter(i => i.status === 'rejected')
        : rows;
    return byStatus.filter(item => matchesQuery(item, query));
  }, [items, historyFilter, query]);

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
          {!session?.access_token && (
            <>
              {' '}
              <strong style={{ color: BRAND.red }}>Sign in (top right) is required before Approve will work.</strong>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <button
            type="button"
            disabled={restoring}
            onClick={() => void onRestoreFromBrowser()}
            title="Re-upload any approvals saved only in this browser after the cloud move"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.navy,
              color: '#fff',
              cursor: restoring ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 650,
              opacity: restoring ? 0.7 : 1,
            }}
          >
            {restoring ? 'Restoring…' : 'Restore from this browser'}
          </button>
        </div>
      </div>

      {localBrowserCount > 0 && approved.length + rejected.length === 0 && (
        <div style={{ padding: 12, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 13, lineHeight: 1.5 }}>
          This browser still has {localBrowserCount} saved request(s). Click <strong>Restore from this browser</strong> to put them back into History.
        </div>
      )}

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
      {info && (
        <div style={{ padding: 12, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13 }}>
          {info}
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
          <Section title="Changes to make" count={changeRows.length}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 220, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>Search</span>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Name, email, phone, college, course, or year"
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: 13,
                    width: '100%',
                    color: BRAND.text,
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <span style={{ fontSize: 12, color: BRAND.textLight }}>
                {changeRows.length} of {pending.length} pending
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setCategory('all')}
                style={chipStyle(category === 'all')}
              >
                All categories ({searchedPending.length})
              </button>
              {CATEGORIES.map(col => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => setCategory(col.key)}
                  style={chipStyle(category === col.key)}
                >
                  {col.label} ({categoryCounts[col.key]})
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: BRAND.textLight, lineHeight: 1.5 }}>
              Each row is one student request. A filled cell is the new value to put in the workbook. A dash means that field was not changed. Approve or reject applies to the whole request.
            </p>
            {pending.length === 0 ? (
              <EmptyState
                title="No pending student requests"
                body="When a student taps “Update my details” and submits, their request appears here for Approve / Reject."
              />
            ) : changeRows.length === 0 ? (
              <EmptyState
                title="No matches"
                body="Try another name, email, or category. Clear the search to see every pending change."
              />
            ) : (
              <ChangesTable
                rows={changeRows}
                category={category}
                busyId={busyId}
                notes={notes}
                onNote={(id, value) => setNotes(prev => ({ ...prev, [id]: value }))}
                onReview={onReview}
              />
            )}
          </Section>

          <Section title="History (approved & rejected)" count={history.length}>
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
                title={query.trim() ? 'No history matches this search' : 'No approval history yet'}
                body={query.trim()
                  ? 'Clear the search above to see every approved and rejected request.'
                  : 'If you approved requests earlier on this computer, click “Restore from this browser”. Approvals done only on a student’s phone before cloud sync cannot be recovered — ask those students to submit again.'}
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
