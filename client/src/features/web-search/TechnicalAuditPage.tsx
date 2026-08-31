import { useState } from 'react';
import {
  ShieldAlert,
  Globe,
  Loader2,
  Download,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';
import { downloadCsv, stampedName } from '@/shared/lib/exportCsv';
import { cn } from '@/shared/lib/cn';
import {
  runTechnicalAudit,
  type AuditResult,
  type Finding,
  type Progress as Prog,
  type Severity,
} from './lib/runTechnicalAudit';

const SEVERITY: Record<Severity, { label: string; icon: typeof AlertCircle; cls: string }> = {
  critical: { label: 'Critical', icon: AlertCircle, cls: 'text-rose-ink' },
  warning: { label: 'Warning', icon: AlertTriangle, cls: 'text-butter-ink' },
  notice: { label: 'Notice', icon: Info, cls: 'text-sky-ink' },
};

export default function TechnicalAuditPage() {
  const [target, setTarget] = useState('');
  const [limit, setLimit] = useState('50');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Prog | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const onRun = async () => {
    if (!target.trim()) {
      toast.error('Enter a domain or URL.');
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress({ step: 'Starting', done: 0, total: 1 });
    try {
      const data = await runTechnicalAudit(target.trim(), parseInt(limit, 10) || 50, setProgress);
      setResult(data);
      setOpen(new Set(data.findings.filter((f) => f.severity === 'critical').map((f) => f.id)));
      toast.success(`Audited ${data.audited} page${data.audited === 1 ? '' : 's'}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Audit failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const exportCsv = () => {
    if (!result) return;
    downloadCsv(
      stampedName('technical-audit'),
      ['url', 'status', 'redirected', 'hops', 'final_url', 'title', 'description', 'time_ms'],
      result.pages.map((p) => [
        p.url,
        p.status ?? '',
        p.redirected ? 'yes' : 'no',
        p.hops,
        p.finalUrl,
        p.title,
        p.description,
        p.timeMs ?? '',
      ])
    );
  };

  const counts = (sev: Severity) =>
    result?.findings.filter((f) => f.severity === sev).reduce((n, f) => n + f.urls.length, 0) ?? 0;

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={ShieldAlert}
      title="Technical audit"
      description="Crawls a site and reports real response, redirect and metadata problems across its pages."
      actions={
        result ? (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="ta-domain">Domain or URL</Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
                <Input
                  id="ta-domain"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="example.com"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:w-44">
              <Label htmlFor="ta-limit">Pages to audit</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="ta-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 pages</SelectItem>
                  <SelectItem value="50">50 pages</SelectItem>
                  <SelectItem value="100">100 pages</SelectItem>
                  <SelectItem value="200">200 pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" onClick={onRun} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Auditing…
                </>
              ) : (
                <>
                  <ShieldAlert className="size-4" /> Run audit
                </>
              )}
            </Button>
          </div>

          {progress && (
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-foreground-muted">
                <span>{progress.step}…</span>
                {progress.total > 1 && (
                  <span className="tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
              <Progress
                value={progress.total ? (progress.done / progress.total) * 100 : 15}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!result ? (
        !busy && (
          <EmptyState
            icon={ShieldAlert}
            title="No audit yet"
            description="Enter a domain. Pages are found from the sitemap, or by crawling if there is none, then checked for response errors, redirect chains and metadata problems."
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Health score" value={String(result.score)} tone={result.score >= 80 ? 'good' : result.score >= 50 ? 'warn' : 'bad'} />
            <Stat label="Pages audited" value={`${result.audited}`} hint={`of ${result.discovered} found via ${result.source}`} />
            <Stat label="Critical" value={String(counts('critical'))} tone={counts('critical') ? 'bad' : 'good'} />
            <Stat label="Warnings" value={String(counts('warning'))} tone={counts('warning') ? 'warn' : 'good'} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
              <p className="text-sm text-foreground-muted">
                Every item below comes from an actual response for one of the audited
                pages.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {result.findings.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-mint-ink">
                  <Check className="size-4" /> Nothing flagged across {result.audited} pages.
                </div>
              ) : (
                result.findings.map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    open={open.has(f.id)}
                    onToggle={() =>
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        return next;
                      })
                    }
                  />
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ToolPage>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneCls =
    tone === 'good'
      ? 'text-mint-ink'
      : tone === 'warn'
        ? 'text-butter-ink'
        : tone === 'bad'
          ? 'text-rose-ink'
          : 'text-foreground';
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
        {label}
      </span>
      <span className={cn('text-2xl font-semibold tabular-nums tracking-tight', toneCls)}>
        {value}
      </span>
      {hint && <span className="text-[11px] text-foreground-muted">{hint}</span>}
    </div>
  );
}

function FindingRow({
  finding,
  open,
  onToggle,
}: {
  finding: Finding;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = SEVERITY[finding.severity];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-foreground-subtle" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-foreground-subtle" />
        )}
        <Icon className={cn('size-4 shrink-0', meta.cls)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-foreground">{finding.title}</span>
          <span className="text-xs text-foreground-muted">{finding.detail}</span>
        </span>
        <Badge variant="outline">{finding.urls.length}</Badge>
      </button>
      {open && (
        <ul className="max-h-64 overflow-auto border-t border-border px-3 py-2">
          {finding.urls.map((u) => (
            <li key={u} className="py-0.5">
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-accent hover:underline break-all"
              >
                {u}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
