import { useMemo, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, Sparkles, Loader2 } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { cn } from '@/shared/lib/cn';
import { aiAssistantService, type AnalysisFinding } from '@/shared/api/aiAssistant';
import { CATEGORY_META, SEVERITY_TONE } from '../lib/categories';

type Props = {
  findings: AnalysisFinding[];
  onPatched?: () => void;
};

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'done', label: 'Done' },
] as const;

export function FindingsList({ findings, onPatched }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [category, setCategory] = useState<string>('all');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const visible = useMemo(() => {
    return findings.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (category !== 'all' && f.category !== category) return false;
      return true;
    });
  }, [findings, statusFilter, category]);

  const categories = useMemo(() => {
    return Array.from(new Set(findings.map((f) => f.category)));
  }, [findings]);

  const toggle = (id: number) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const markDone = async (f: AnalysisFinding) => {
    setPendingId(f.id);
    try {
      await aiAssistantService.patchFinding(f.id, f.status === 'done' ? 'open' : 'done');
      onPatched?.();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">Prioritised tasks</h2>
          <p className="text-xs text-foreground-subtle">
            Ranked by impact. New = surfaced this run; Done = fixed since last run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-auto min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_META[c as keyof typeof CATEGORY_META]?.label ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center text-sm text-foreground-muted">
          Nothing in this slice.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((f) => {
            const meta = CATEGORY_META[f.category as keyof typeof CATEGORY_META];
            const Icon = meta?.icon ?? Sparkles;
            const tone = SEVERITY_TONE[f.severity] || 'text-foreground-muted';
            return (
              <li
                key={f.id}
                className={cn(
                  'rounded-md border border-border bg-surface transition-colors',
                  f.status === 'done' && 'opacity-70',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-muted/40 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn('flex size-8 items-center justify-center rounded-md shrink-0', meta?.accent || 'bg-surface-muted')}>
                    <Icon className="size-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {f.status === 'new' && <Badge variant="accent">New</Badge>}
                      {f.status === 'done' && <Badge variant="mint">Done</Badge>}
                      <span className={cn('text-xs font-medium uppercase tracking-wider', tone)}>{f.severity}</span>
                      <span className="text-xs text-foreground-subtle">impact {f.impact}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-0.5 truncate">{f.title}</p>
                  </div>
                  <ChevronDown className={cn('size-4 text-foreground-subtle transition-transform', expanded[f.id] && 'rotate-180')} />
                </button>
                {expanded[f.id] && (
                  <div className="px-3 pb-3 pl-14 flex flex-col gap-2">
                    {f.description && <p className="text-sm text-foreground-muted leading-relaxed">{f.description}</p>}
                    {f.affectedUrls.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                          Affected URLs ({f.affectedUrls.length})
                        </span>
                        <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                          {f.affectedUrls.slice(0, 25).map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-xs text-foreground-muted hover:text-accent truncate inline-block max-w-full"
                              >
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markDone(f)}
                        disabled={pendingId === f.id}
                      >
                        {pendingId === f.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : f.status === 'done' ? (
                          <Circle className="size-3.5" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        {f.status === 'done' ? 'Re-open' : 'Mark done'}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
