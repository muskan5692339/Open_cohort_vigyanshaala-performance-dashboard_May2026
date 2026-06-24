import { BRAND } from '../../types/adminTypes';

export default function TestingQualityReportPage() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginBottom: 8 }}>Testing & Quality Report</h1>
      <p style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 20 }}>Sprint 7 validation checklist, test scenarios, and known limitations.</p>

      <ReportSection title="Validation checklist">
        <ul>
          <li>Upload empty file → blocked with clear error</li>
          <li>Upload corrupt file → blocked, dashboard does not crash</li>
          <li>Upload valid file → preview shows sheets, rows, columns</li>
          <li>Duplicate headers → validation error before parse</li>
          <li>Apply mapping → health monitor records success</li>
          <li>Export CSV → audit log entry created</li>
          <li>Load demo dataset → dashboard populates without file upload</li>
        </ul>
      </ReportSection>

      <ReportSection title="Test scenarios">
        <ul>
          <li><strong>Happy path:</strong> Valid xlsx → preview → confirm → map → dashboard</li>
          <li><strong>Schema migration:</strong> Upload v1, save profile, upload v2 with renamed column</li>
          <li><strong>Fuzzy reuse:</strong> &quot;Attendance %&quot; vs &quot;Attendance Percent&quot; auto-maps</li>
          <li><strong>Large file:</strong> 5,000+ rows — filters and table pagination remain responsive</li>
          <li><strong>Demo mode:</strong> Load Demo Dataset from Data Sources</li>
        </ul>
      </ReportSection>

      <ReportSection title="Known limitations">
        <ul>
          <li>Trend comparison requires at least two uploads (local snapshots)</li>
          <li>Audit log and health metrics stored in browser localStorage only</li>
          <li>PDF exports use browser print dialog</li>
          <li>.xls legacy format supported with warning; .xlsx recommended</li>
          <li>No cloud sync, authentication, or Supabase integration (Sprint 8+)</li>
        </ul>
      </ReportSection>

      <ReportSection title="Performance strategy">
        <ul>
          <li>Memoized filter options (single-pass over rows)</li>
          <li>Deferred filter values for table search (`useDeferredValue`)</li>
          <li>Analytics reuse when no filters active</li>
          <li>Analytics timing tracked in health monitor; warning above 8k rows</li>
          <li>Paginated master student table (25 rows/page)</li>
        </ul>
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.navy, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
