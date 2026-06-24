import type { ProgramIntelligenceBundle } from '../../../../types/intelligenceTypes';
import SmartAlertsBanner from './SmartAlertsBanner';
import OperationsHealthPanel from './OperationsHealthPanel';
import ExecutiveInsightsPanel from './ExecutiveInsightsPanel';
import CohortComparisonPanel from './CohortComparisonPanel';
import TopPerformerPanel from './TopPerformerPanel';
import InterventionPanel from './InterventionPanel';
import TrendComparisonPanel from './TrendComparisonPanel';
import CollegeReportCardsPanel from './CollegeReportCardsPanel';
import { BRAND } from '../../../../types/adminTypes';

interface ProgramIntelligenceHubProps {
  intelligence: ProgramIntelligenceBundle;
  mode: 'dashboard' | 'cohort-comparison' | 'weekly-ops' | 'full';
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12, marginTop: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function ProgramIntelligenceHub({ intelligence, mode }: ProgramIntelligenceHubProps) {
  const showDashboard = mode === 'dashboard' || mode === ('full' as typeof mode);
  const showComparison = mode === 'cohort-comparison' || mode === 'full';
  const showWeekly = mode === 'weekly-ops' || mode === 'full';

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <SmartAlertsBanner alerts={intelligence.alerts} />

      {showDashboard && (
        <>
          <Heading title="Operations Health Score" hint="Composite program health from attendance, assessment, assignments, certification, risk, and data quality." />
          <OperationsHealthPanel health={intelligence.healthScore} />

          <Heading title="Executive Insights" hint="Auto-generated highlights, warnings, and recommendations." />
          <ExecutiveInsightsPanel insights={intelligence.executiveInsights} />

          <Heading title="Top Performer Intelligence" />
          <TopPerformerPanel data={intelligence.topPerformers} />

          <Heading title="Intervention Recommendations" />
          <InterventionPanel recommendations={intelligence.interventions} />
        </>
      )}

      {showComparison && (
        <>
          <Heading title="Cohort Comparison Engine" hint="Compare groups across mapped category dimensions." />
          <CohortComparisonPanel comparisons={intelligence.cohortComparisons} />
        </>
      )}

      {showWeekly && (
        <>
          <Heading title="Upload Trend Comparison" hint="Current upload vs previous snapshot." />
          <TrendComparisonPanel trends={intelligence.trends} />

          <Heading title="College Report Cards" hint="One-page summary per college — print to PDF." />
          <CollegeReportCardsPanel cards={intelligence.collegeReportCards} />
        </>
      )}

      {mode === 'full' && (
        <>
          <Heading title="Cohort Comparison" />
          <CohortComparisonPanel comparisons={intelligence.cohortComparisons} />
          <Heading title="Trends & Report Cards" />
          <TrendComparisonPanel trends={intelligence.trends} />
          <CollegeReportCardsPanel cards={intelligence.collegeReportCards} />
        </>
      )}
    </div>
  );
}
