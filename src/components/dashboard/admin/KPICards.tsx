import {
  Users,
  UserCheck,
  AlertTriangle,
  Calendar,
  ClipboardList,
  Award,
  Activity,
  Star,
} from 'lucide-react';
import { BRAND } from '../../../types/adminTypes';
import type { KPISummary } from '../../../hooks/useAdminData';

interface KPICard {
  label: string;
  value: string;
  icon: typeof Users;
  accent: string;
  accentBg: string;
}

function buildCards(summary: KPISummary): KPICard[] {
  return [
    { label: 'Total Students', value: String(summary.totalStudents), icon: Users, accent: BRAND.navy, accentBg: '#e5edf7' },
    { label: 'Active Students', value: String(summary.activeStudents), icon: UserCheck, accent: BRAND.green, accentBg: BRAND.greenLight },
    { label: 'At Risk Students', value: String(summary.atRiskStudents), icon: AlertTriangle, accent: BRAND.red, accentBg: BRAND.redLight },
    { label: 'Avg Attendance', value: `${summary.avgAttendance}%`, icon: Calendar, accent: BRAND.navy, accentBg: '#e5edf7' },
    { label: 'Assignment Completion', value: `${summary.avgAssignment}%`, icon: ClipboardList, accent: BRAND.yellowDark, accentBg: BRAND.yellowLight },
    { label: 'Quiz Avg Score', value: `${summary.avgQuiz}%`, icon: Award, accent: BRAND.blue, accentBg: BRAND.blueLight },
    { label: 'Avg Engagement Score', value: String(summary.avgEngagement), icon: Activity, accent: BRAND.navy, accentBg: '#e5edf7' },
    { label: 'Top Performers', value: String(summary.topPerformers), icon: Star, accent: BRAND.green, accentBg: BRAND.greenLight },
  ];
}

interface KPICardsProps {
  summary?: KPISummary;
  loading?: boolean;
}

export default function KPICards({ summary, loading }: KPICardsProps) {
  if (loading || !summary) {
    return (
      <div style={{ padding: 24, color: BRAND.textLight, fontSize: 14 }}>Loading KPIs…</div>
    );
  }

  const cards = buildCards(summary);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}
    >
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            style={{
              background: BRAND.card,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 18,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: card.accentBg,
                color: card.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Icon size={18} />
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight, fontWeight: 500 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.text, marginTop: 4 }}>{card.value}</div>
          </div>
        );
      })}
    </div>
  );
}
