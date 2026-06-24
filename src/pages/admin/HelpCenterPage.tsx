import { BRAND } from '../../types/adminTypes';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.navy, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function HelpCenterPage() {
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginBottom: 8 }}>Help Center</h1>
      <p style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 20 }}>
        Guides for uploads, mapping, risk scores, exports, and troubleshooting.
      </p>

      <Section title="How uploads work">
        <ol style={{ paddingLeft: 18, margin: 0 }}>
          <li>Enter a cohort name and choose an Excel (.xlsx) file.</li>
          <li>Validation runs automatically — fix any errors before continuing.</li>
          <li>Preview sheet names, row/column counts, and the first 10 rows.</li>
          <li>Confirm the sheet, review schema mapping, apply mapping, then open the dashboard.</li>
        </ol>
      </Section>

      <Section title="Column mapping explained">
        <p>Each column has a <strong>Type</strong> (percentage, category, status…), a <strong>Business Role</strong> (attendance, assessment…), and a <strong>Display Group</strong> (profile, performance…).</p>
        <p>Saved mapping profiles reuse settings when headers match exactly or fuzzily (e.g. &quot;Attendance %&quot; ↔ &quot;Attendance Percent&quot;).</p>
      </Section>

      <Section title="Risk scores">
        <p>Risk combines attendance, assessment, assignment, and engagement signals into a 0–100 score and categories: Top Performer, Healthy, Needs Attention, At Risk, Critical Risk.</p>
        <p>Use the Risk Action Center to log outreach, notes, and follow-ups.</p>
      </Section>

      <Section title="Exports">
        <p>Export filtered student tables, risk reports, and summary dashboards as CSV or Excel from the Exports panel. Metadata includes applied filters and record counts.</p>
      </Section>

      <Section title="Troubleshooting">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li><strong>All zeros on dashboard</strong> — Re-upload and confirm attendance columns are mapped as Percentage + Attendance role.</li>
          <li><strong>Validation blocked</strong> — Check duplicate headers, empty sheets, or file size (&lt;25 MB).</li>
          <li><strong>Slow with large files</strong> — Use filters and pagination; analytics defer automatically above 5,000 rows.</li>
          <li><strong>Schema changes</strong> — Review the Schema Change Detector after upload when columns are added or renamed.</li>
        </ul>
      </Section>
    </div>
  );
}
