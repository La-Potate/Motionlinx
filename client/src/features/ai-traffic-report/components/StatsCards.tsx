import { Card } from '@/shared/ui/card';
import type { AiTrafficReport } from '@/shared/api/ga4';
import { formatNumber, formatPercent } from '../lib/ai-engines';

type Props = {
  totals: AiTrafficReport['totals'];
  engineCount: number;
};

export function StatsCards({ totals, engineCount }: Props) {
  const cards = [
    { label: 'AI Sessions', value: formatNumber(totals.sessions) },
    { label: 'AI Users', value: formatNumber(totals.users) },
    { label: 'Engaged Sessions', value: formatNumber(totals.engagedSessions) },
    {
      label: 'Engagement Rate',
      value: totals.sessions ? formatPercent(totals.engagementRate) : '—',
    },
    { label: 'Engines', value: String(engineCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            {c.label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {c.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
