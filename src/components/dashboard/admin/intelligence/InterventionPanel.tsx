import { useState } from 'react';
import type { InterventionRecommendation, RecommendationHistoryRecord } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';
import {
  acknowledgeRecommendation,
  listRecommendationHistory,
} from '../../../../services/recommendationHistoryStore';

const TYPE_LABEL: Record<InterventionRecommendation['type'], string> = {
  attendance_outreach: 'Attendance Outreach',
  mentor_support: 'Mentor Support',
  assignment_followup: 'Assignment Follow-up',
  certification_reminder: 'Certification Reminder',
  general_intervention: 'General Intervention',
};

export default function InterventionPanel({ recommendations }: { recommendations: InterventionRecommendation[] }) {
  const [history, setHistory] = useState(() => listRecommendationHistory(30));

  const refresh = () => setHistory(listRecommendationHistory(30));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Active Recommendations ({recommendations.length})</div>
        {recommendations.length === 0 ? (
          <div style={{ fontSize: 13, color: BRAND.textLight }}>No intervention recommendations for the current filter selection.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {recommendations.slice(0, 25).map(rec => (
              <div
                key={rec.id}
                style={{
                  border: `1px solid ${rec.priority === 'high' ? '#fecaca' : BRAND.border}`,
                  borderRadius: 10,
                  padding: 12,
                  background: rec.priority === 'high' ? '#fef2f2' : BRAND.bg,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{rec.studentLabel}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: rec.priority === 'high' ? BRAND.red : BRAND.textLight }}>
                    {rec.priority}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: BRAND.navy, marginTop: 4 }}>{TYPE_LABEL[rec.type]}: {rec.title}</div>
                <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>{rec.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Recommendation History</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: BRAND.textLight }}>History builds as recommendations are generated each session.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {history.map((h: RecommendationHistoryRecord) => (
              <div key={h.id} style={{ fontSize: 12, padding: 10, background: BRAND.bg, borderRadius: 8, opacity: h.acknowledged ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{h.recommendation.studentLabel}</strong>
                  <span style={{ color: BRAND.textLight }}>{new Date(h.generatedAt).toLocaleString()}</span>
                </div>
                <div style={{ marginTop: 4 }}>{h.recommendation.title}</div>
                {!h.acknowledged && (
                  <button
                    type="button"
                    onClick={() => { acknowledgeRecommendation(h.id); refresh(); }}
                    style={{ marginTop: 6, fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}`, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
