import { useMemo, useState } from 'react';
import {
  Download,
  Bot,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  ShieldCheck,
  Shield,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'motion/react';
import aiSeoService from '@/shared/api/aiSeo';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/sonner';
import { downloadCsv, stampedName } from '@/shared/lib/exportCsv';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

type Entry = { id: string; label: string; allowed: boolean; reason: string };
type Result = {
  // The endpoint also returns the resolved domain and the raw robots.txt;
  // both were absent from this type, so neither could be used.
  domain?: string;
  raw?: string;
  missing?: boolean;
  robotsUrl?: string;
  status?: number;
  fetchedVia?: string;
  results?: Entry[];
  notes?: string[];
  summary?: { total: number; allowed: number; blocked: number };
};

export default function CrawlerAccessPage() {
  const [domain, setDomain] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    if (result?.summary) return result.summary;
    const list = result?.results || [];
    const allowed = list.filter((e) => e.allowed).length;
    return { total: list.length, allowed, blocked: list.length - allowed };
  }, [result]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) {
      toast.error('Enter a domain to check.');
      return;
    }
    setBusy(true);
    try {
      const data = await aiSeoService.checkCrawlerAccess(domain.trim());
      setResult(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to check robots.txt');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = result?.results || [];
    if (!rows.length) return;
    downloadCsv(
      stampedName(`crawler-access-${result?.domain || 'site'}`),
      ['bot', 'allowed', 'matched_agent', 'matched_rule', 'reason'],
      rows.map((r: any) => [
        r.label ?? r.id ?? '',
        r.allowed ? 'allowed' : 'blocked',
        r.matchedAgent ?? '',
        r.matchedRule ?? '',
        r.reason ?? '',
      ])
    );
  };

  return (
    <ToolPage
      eyebrow="AI SEO"
      icon={Shield}
      title="Crawler access checker"
      description="Confirm whether GPTBot, ClaudeBot, Perplexity, Google-Extended, Meta, and other LLM crawlers can read your site."
      actions={
        (result?.results || []).length ? (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardContent className="p-6">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle text-xs">
                  https://
                </span>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="pl-16"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy} size="lg" className="sm:w-auto">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Check robots.txt
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {!result ? (
        <EmptyState
          icon={Bot}
          title="Enter a domain to begin"
          description="We fetch the site's robots.txt and report which LLM crawlers are allowed or blocked."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed shrink-0">
                  <Globe className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    {result.missing ? 'No robots.txt found' : 'Loaded robots.txt'}
                  </div>
                  <div className="text-xs text-foreground-muted flex flex-wrap items-center gap-2 mt-1">
                    {result.robotsUrl ? (
                      <a
                        href={result.robotsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-accent transition-colors"
                      >
                        {result.robotsUrl}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      'URL unavailable'
                    )}
                    {typeof result.status === 'number' && (
                      <Badge variant="outline">HTTP {result.status}</Badge>
                    )}
                    {result.fetchedVia && (
                      <Badge variant="outline">
                        via {String(result.fetchedVia).toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <SummaryPill icon={CheckCircle2} value={summary.allowed} label="Allowed" tone="mint" />
                <SummaryPill icon={XCircle} value={summary.blocked} label="Blocked" tone="rose" />
              </div>
            </CardContent>
          </Card>

          <motion.div
            variants={stagger.container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {result.results?.map((entry) => (
              <motion.div key={entry.id} variants={stagger.item}>
                <Card
                  className={cn(
                    'h-full transition-colors',
                    entry.allowed ? 'border-mint/60' : 'border-rose/60'
                  )}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-lg shrink-0',
                        entry.allowed
                          ? 'bg-mint text-mint-ink'
                          : 'bg-rose text-rose-ink'
                      )}
                    >
                      <Bot className="size-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">
                          {entry.label}
                        </span>
                        <Badge variant={entry.allowed ? 'mint' : 'rose'}>
                          {entry.allowed ? 'Allowed' : 'Blocked'}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground-muted mt-1.5 leading-relaxed">
                        {entry.reason}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {result.notes && result.notes.length > 0 && (
            <Card className="border-butter">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="size-4 text-butter-ink mt-0.5 shrink-0" />
                <ul className="flex flex-col gap-1 text-sm text-foreground">
                  {result.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </ToolPage>
  );
}

function SummaryPill({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof CheckCircle2;
  value: number;
  label: string;
  tone: 'mint' | 'rose';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5',
        tone === 'mint' ? 'border-mint bg-mint/30' : 'border-rose bg-rose/30'
      )}
    >
      <Icon
        className={cn(
          'size-4',
          tone === 'mint' ? 'text-mint-ink' : 'text-rose-ink'
        )}
      />
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          tone === 'mint' ? 'text-mint-ink' : 'text-rose-ink'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-foreground-muted">{label}</span>
    </div>
  );
}
