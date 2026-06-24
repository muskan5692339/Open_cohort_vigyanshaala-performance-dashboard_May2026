import { Printer } from 'lucide-react';
import type { CollegeReportCard } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

export default function CollegeReportCardsPanel({ cards }: { cards: CollegeReportCard[] }) {
  if (!cards.length) {
    return (
      <div style={{ padding: 16, color: BRAND.textLight, fontSize: 13, background: '#fff', borderRadius: 12, border: `1px dashed ${BRAND.border}` }}>
        Map a College or University category column to generate college report cards.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <button
        type="button"
        onClick={() => window.print()}
        className="no-print"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          border: 'none',
          borderRadius: 8,
          background: BRAND.navy,
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
          width: 'fit-content',
        }}
      >
        <Printer size={14} /> Print All Report Cards (PDF)
      </button>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .college-report-card, .college-report-card * { visibility: visible; }
          .college-report-card { break-inside: avoid; page-break-inside: avoid; margin-bottom: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {cards.map(card => (
        <div
          key={card.college}
          className="college-report-card"
          style={{
            background: '#fff',
            border: `2px solid ${BRAND.navy}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ borderBottom: `3px solid ${BRAND.yellow}`, paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase' }}>College Report Card</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>{card.college}</div>
            <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>
              Generated {new Date().toLocaleDateString()} · {card.studentCount} students
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
            <Stat label="Health Score" value={`${card.healthScore} (${card.healthCategory})`} />
            <Stat label="Attendance" value={`${card.avgAttendance}%`} />
            <Stat label="Assessment" value={`${card.avgAssessment}%`} />
            <Stat label="Completion" value={`${card.completionRate}%`} />
            <Stat label="Certification" value={`${card.certificationRate}%`} />
            <Stat label="At Risk" value={`${card.riskPercent}%`} />
          </div>

          {card.topStudents.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 6 }}>Top Performers</div>
              <div style={{ fontSize: 13 }}>{card.topStudents.join(' · ')}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: BRAND.bg, borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: BRAND.textLight, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.navy, marginTop: 4 }}>{value}</div>
    </div>
  );
}
