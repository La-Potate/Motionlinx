import { Card } from '@/shared/ui/card';
import type { EngineTotals } from '@/shared/api/ga4';
import { formatNumber, formatPercent } from '../lib/ai-engines';

type Props = {
  engines: EngineTotals[];
};

export function EngineBreakdown({ engines }: Props) {
  const max = Math.max(...engines.map((e) => e.sessions), 1);
  const total = engines.reduce((sum, e) => sum + e.sessions, 0);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">By engine</h2>
      {engines.length === 0 ? (
        <p className="text-sm text-foreground-subtle">No data.</p>
      ) : (
        <ul className="space-y-3">
          {engines.map((e) => {
            const share = total ? e.sessions / total : 0;
            const width = (e.sessions / max) * 100;
            return (
              <li key={e.engineId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: e.color }}
                    />
                    {e.engineName}
                  </span>
                  <span className="text-foreground-muted tabular-nums">
                    {formatNumber(e.sessions)}
                    <span className="ml-1 text-foreground-subtle">
                      ({formatPercent(share, 0)})
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${width}%`, background: e.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
