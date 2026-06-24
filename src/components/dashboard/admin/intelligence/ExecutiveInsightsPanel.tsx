import { Lightbulb, ThumbsUp, AlertTriangle } from 'lucide-react';
import type { ProgramIntelligenceBundle } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

export default function ExecutiveInsightsPanel({
  insights,
}: {
  insights: ProgramIntelligenceBundle['executiveInsights'];
}) {
  const sections = [
    { key: 'highlights', title: 'Positive Highlights', icon: ThumbsUp, color: BRAND.green, items: insights.highlights },
    { key: 'warnings', title: 'Warnings', icon: AlertTriangle, color: '#d97706', items: insights.warnings },
    { key: 'recommendations', title: 'Recommendations', icon: Lightbulb, color: BRAND.navy, items: insights.recommendations },
  ] as const;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {sections.map(sec => {
        const Icon = sec.icon;
        if (!sec.items.length) return null;
        return (
          <div key={sec.key} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: sec.color, fontWeight: 700, fontSize: 14 }}>
              <Icon size={16} /> {sec.title}
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
              {sec.items.map(item => (
                <li key={item.id} style={{ fontSize: 13, color: BRAND.text, lineHeight: 1.5 }}>{item.message}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
