import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { Card } from '@/shared/ui/card';
import type { AiEngineMeta, TimeseriesPoint } from '@/shared/api/ga4';

type Props = {
  data: TimeseriesPoint[];
  engines: AiEngineMeta[];
};

export function TrafficChart({ data, engines }: Props) {
  if (data.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-foreground-subtle">
        No AI traffic in this date range.
      </Card>
    );
  }

  const chartData = data.map((point) => ({
    date: point.date,
    ...point.perEngine,
  }));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Sessions over time</h2>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <defs>
              {engines.map((e) => (
                <linearGradient key={e.id} id={`grad-${e.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={e.color} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={e.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-foreground-muted)', fontSize: 11 }}
              tickFormatter={(d: string) => format(new Date(`${d}T00:00:00`), 'MMM d')}
              minTickGap={24}
              stroke="var(--color-border)"
            />
            <YAxis
              tick={{ fill: 'var(--color-foreground-muted)', fontSize: 11 }}
              allowDecimals={false}
              stroke="var(--color-border)"
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--color-foreground)',
              }}
              labelFormatter={(d: string) => format(new Date(`${d}T00:00:00`), 'MMM d, yyyy')}
              formatter={(value: any, name: string) => {
                const engine = engines.find((e) => e.id === name);
                return [value, engine?.name ?? name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              formatter={(value: string) => {
                const engine = engines.find((e) => e.id === value);
                return (
                  <span style={{ color: 'var(--color-foreground)' }}>
                    {engine?.name ?? value}
                  </span>
                );
              }}
            />
            {engines.map((e) => (
              <Area
                key={e.id}
                type="monotone"
                dataKey={e.id}
                stackId="1"
                stroke={e.color}
                fill={`url(#grad-${e.id})`}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
