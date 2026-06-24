import { BRAND } from '../../types/adminTypes';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
}

export default function ChartCard({ title, subtitle, children, height = 280 }: ChartCardProps) {
  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 18,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, lineHeight: 1.2 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      {/* Explicit pixel height — avoids Recharts width/height=-1 on first paint */}
      <div style={{ width: '100%', height, minHeight: height, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

/** The pixel height a ResponsiveContainer inside ChartCard should use. */
export const CHART_HEIGHT = {
  default: 260,
  tall: 280,
} as const;
