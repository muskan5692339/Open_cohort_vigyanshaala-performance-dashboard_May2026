import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquare, Phone, RefreshCw } from 'lucide-react';
import type { DynamicAnalyticsResult } from '../../../services/dynamicAnalytics';
import { BRAND } from '../../../types/adminTypes';
import type { RiskActionRecord } from '../../../types/opsTypes';
import { actionTypeLabel, addRiskAction, listRiskActions } from '../../../services/riskActionStore';
import { useSyncContext } from '../../../hooks/useSyncContext';

interface RiskActionCenterProps {
  riskStudents: DynamicAnalyticsResult['riskMetrics']['students'];
}

const AT_RISK_CATEGORIES = new Set(['At Risk', 'Critical Risk']);

export default function RiskActionCenter({ riskStudents }: RiskActionCenterProps) {
  const syncCtx = useSyncContext();
  const [actions, setActions] = useState<RiskActionRecord[]>(() => listRiskActions(undefined, syncCtx));
  const [noteStudent, setNoteStudent] = useState<{ key: string; label: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  const atRiskStudents = useMemo(
    () => riskStudents.filter(s => AT_RISK_CATEGORIES.has(s.category)),
    [riskStudents],
  );

  const actionsByStudent = useMemo(() => {
    const map = new Map<string, RiskActionRecord[]>();
    for (const a of actions) {
      if (!map.has(a.studentKey)) map.set(a.studentKey, []);
      map.get(a.studentKey)!.push(a);
    }
    return map;
  }, [actions]);

  const refreshActions = () => setActions(listRiskActions(undefined, syncCtx));

  const runAction = (
    studentKey: string,
    studentLabel: string,
    actionType: 'contacted' | 'follow_up' | 'resolved',
  ) => {
    addRiskAction({ studentKey, studentLabel, actionType }, syncCtx);
    refreshActions();
  };

  const submitNote = () => {
    if (!noteStudent || !noteText.trim()) return;
    addRiskAction({
      studentKey: noteStudent.key,
      studentLabel: noteStudent.label,
      actionType: 'note',
      note: noteText.trim(),
    }, syncCtx);
    setNoteStudent(null);
    setNoteText('');
    refreshActions();
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
          <AlertTriangle size={18} color={BRAND.red} /> Risk Action Center
        </div>
        <p style={{ margin: 0, fontSize: 13, color: BRAND.textLight }}>
          Triage students in <strong>At Risk</strong> or <strong>Critical Risk</strong>. Actions are stored locally.
        </p>
      </div>

      {atRiskStudents.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: BRAND.textLight, background: '#fff', borderRadius: 12, border: `1px dashed ${BRAND.border}` }}>
          No at-risk students in the current filter selection.
        </div>
      ) : (
        atRiskStudents.map(student => {
          const history = actionsByStudent.get(student.studentKey) ?? [];
          const latest = history[0];
          return (
            <div key={student.studentKey} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.navy }}>{student.studentLabel}</div>
                  <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
                    Score {student.score} · {student.category} · {student.reasons.join(', ')}
                  </div>
                  {latest && (
                    <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 4 }}>
                      Latest: {actionTypeLabel(latest.actionType)} · {new Date(latest.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <ActionBtn icon={MessageSquare} label="Add Note" onClick={() => { setNoteStudent({ key: student.studentKey, label: student.studentLabel }); setNoteText(''); }} />
                  <ActionBtn icon={Phone} label="Contacted" onClick={() => runAction(student.studentKey, student.studentLabel, 'contacted')} />
                  <ActionBtn icon={RefreshCw} label="Follow-up" onClick={() => runAction(student.studentKey, student.studentLabel, 'follow_up')} />
                  <ActionBtn icon={CheckCircle2} label="Resolved" onClick={() => runAction(student.studentKey, student.studentLabel, 'resolved')} />
                </div>
              </div>

              {history.length > 0 && (
                <div style={{ borderTop: `1px solid ${BRAND.borderLight}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Action History</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {history.slice(0, 8).map(h => (
                      <div key={h.id} style={{ fontSize: 12, color: BRAND.text, background: BRAND.bg, borderRadius: 8, padding: '6px 10px' }}>
                        <strong>{actionTypeLabel(h.actionType)}</strong>
                        <span style={{ color: BRAND.textLight }}> · {new Date(h.createdAt).toLocaleString()}</span>
                        {h.note && <div style={{ marginTop: 4, color: BRAND.textLight }}>{h.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {noteStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setNoteStudent(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 20, width: 'min(480px, 92vw)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Add note — {noteStudent.label}</div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8, fontFamily: 'inherit', fontSize: 13 }}
              placeholder="Intervention note…"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => setNoteStudent(null)} style={modalBtn}>Cancel</button>
              <button type="button" onClick={submitNote} style={{ ...modalBtn, background: BRAND.navy, color: '#fff', border: 'none' }}>Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof MessageSquare;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 8,
        background: '#fff',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

const modalBtn: React.CSSProperties = {
  padding: '8px 14px',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  background: '#fff',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
