import { useState } from 'react';
import { BRAND } from '../../../types/adminTypes';
import {
  listProfileCorrections,
  reviewProfileCorrection,
  type StudentProfileCorrection,
} from '../../../services/studentProfileCorrections';

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

function CorrectionCard({
  item,
  onReviewed,
}: {
  item: StudentProfileCorrection;
  onReviewed: () => void;
}) {
  const [note, setNote] = useState('');

  const act = (status: 'approved' | 'rejected') => {
    reviewProfileCorrection(item.id, status, note.trim() || undefined);
    onReviewed();
  };

  return (
    <article style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 14, background: BRAND.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{item.studentName}</div>
          <div style={{ fontSize: 12, color: BRAND.textLight }}>{item.email}</div>
        </div>
        <div style={{ fontSize: 11, color: BRAND.textMuted }}>Submitted {formatWhen(item.submittedAt)}</div>
      </div>
      <dl style={{ margin: '12px 0', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '6px 12px', fontSize: 13 }}>
        {item.fields.phone && (<><dt style={{ color: BRAND.textLight }}>Phone</dt><dd style={{ margin: 0 }}>{item.fields.phone}</dd></>)}
        {item.fields.college && (<><dt style={{ color: BRAND.textLight }}>College</dt><dd style={{ margin: 0 }}>{item.fields.college}</dd></>)}
        {item.fields.course && (<><dt style={{ color: BRAND.textLight }}>Course</dt><dd style={{ margin: 0 }}>{item.fields.course}</dd></>)}
        {item.fields.year && (<><dt style={{ color: BRAND.textLight }}>Year</dt><dd style={{ margin: 0 }}>{item.fields.year}</dd></>)}
      </dl>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note to student (shown after review)"
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${BRAND.border}`, padding: 8, fontSize: 12, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => act('approved')} style={btnStyle(BRAND.green)}>Approve</button>
        <button type="button" onClick={() => act('rejected')} style={btnStyle(BRAND.red)}>Reject</button>
      </div>
    </article>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    background: bg,
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}

export default function AdminProfileApprovals() {
  const [tick, setTick] = useState(0);
  const pending = listProfileCorrections('pending');
  const recent = listProfileCorrections().filter(c => c.status !== 'pending').slice(0, 8);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5 }}>
        Students can request profile corrections from their dashboard. Approve to acknowledge — update the master Excel on the next weekly upload.
      </div>
      {pending.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: BRAND.textLight, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          No pending student detail updates.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{pending.length} pending request{pending.length === 1 ? '' : 's'}</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {pending.map(item => (
              <CorrectionCard key={item.id} item={item} onReviewed={() => setTick(t => t + 1)} />
            ))}
          </div>
        </>
      )}
      {recent.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Recently reviewed</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.map(item => (
              <div key={`${item.id}-${tick}`} style={{ fontSize: 12, padding: 10, border: `1px solid ${BRAND.borderLight}`, borderRadius: 8 }}>
                <strong>{item.studentName}</strong> — {item.status} · {formatWhen(item.reviewedAt ?? item.submittedAt)}
                {item.adminNote && <span style={{ color: BRAND.textLight }}> · {item.adminNote}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
