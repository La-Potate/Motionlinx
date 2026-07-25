import { motion } from 'motion/react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import { scoreColor, scoreRingClass } from '../lib/categories';
import type { ScoreBreakdownEntry } from '@/shared/api/aiAssistant';

type Props = {
  label: string;
  score: number;
  delta?: number | null;
  breakdown?: ScoreBreakdownEntry[];
  loading?: boolean;
};

export function ScoreCard({ label, score, delta, breakdown, loading }: Props) {
  const trend = typeof delta === 'number' ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') : null;

  return (
    <Card className="p-6 flex flex-col gap-4 min-h-[200px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
          {label}
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              trend === 'up' && 'text-mint-ink',
              trend === 'down' && 'text-rose-ink',
              trend === 'flat' && 'text-foreground-subtle',
            )}
          >
            {trend === 'up' ? <ArrowUp className="size-3" /> : trend === 'down' ? <ArrowDown className="size-3" /> : <Minus className="size-3" />}
            {Math.abs(delta ?? 0)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={cn('text-5xl font-semibold tracking-tight tabular-nums', scoreColor(score))}
        >
          {loading ? '—' : score}
        </motion.span>
        <span className="text-sm text-foreground-subtle">/100</span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', scoreRingClass(score))}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {breakdown && (
        <ul className="flex flex-col gap-1.5 text-xs">
          {breakdown.slice(0, 4).map((entry) => (
            <li key={entry.key} className="flex items-center justify-between gap-2">
              <span className="text-foreground-muted truncate">{entry.label}</span>
              <span className="text-foreground-subtle tabular-nums">
                {entry.value === null ? '—' : `${Math.round(entry.value * 100)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
