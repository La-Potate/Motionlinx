import { useMemo, useState } from 'react';
import {
  Download,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Link2,
  Loader2,
} from 'lucide-react';
import httpStatusService from '@/shared/api/httpStatus';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';
import { downloadCsv, stampedName } from '@/shared/lib/exportCsv';
import { cn } from '@/shared/lib/cn';

const MAX_URLS = 50;

type Hop = { url: string; status: number | string; resolvedLocation?: string };
type Item = {
  url: string;
  finalUrl?: string;
  finalStatus: number | string;
  chain?: Hop[];
};

function toneFor(status: number | string): 'mint' | 'sky' | 'rose' | 'default' {
  if (typeof status !== 'number') return 'rose';
  if (status >= 200 && status < 300) return 'mint';
  if (status >= 300 && status < 400) return 'sky';
  if (status >= 400) return 'rose';
  return 'default';
}

function statusLabel(status: number | string) {
  if (typeof status !== 'number') return 'Error';
  if (status >= 200 && status < 300) return `${status} OK`;
  if (status >= 300 && status < 400) return `${status} Redirect`;
  return `${status} Error`;
}

function StatusPill({ status }: { status: number | string }) {
  const tone = toneFor(status);
  const Icon =
    tone === 'mint' ? CheckCircle2 : tone === 'sky' ? ArrowRight : AlertTriangle;
  return (
    <Badge variant={tone}>
      <Icon className="size-3" />
      {statusLabel(status)}
    </Badge>
  );
}

export default function BulkHttpPage() {
  const [raw, setRaw] = useState('https://example.com/\nhttps://httpstatus.io/');
  const [results, setResults] = useState<Item[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    if (!results.length) return;
    downloadCsv(
      stampedName('http-check'),
      ['url', 'final_status', 'final_url', 'redirected', 'hops', 'chain'],
      results.map((r: any) => [
        r.url,
        r.finalStatus,
        r.finalUrl ?? '',
        r.redirected ? 'yes' : 'no',
        r.chain?.length ?? 0,
        (r.chain || []).map((h: any) => `${h.status} ${h.url}`).join(' -> '),
      ])
    );
  };

  const urls = useMemo(
    () =>
      raw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean),
    [raw]
  );

  const onCheck = async () => {
    if (urls.length === 0) {
      toast.error('Add at least one URL to check.');
      return;
    }
    if (urls.length > MAX_URLS) {
      toast.error(`You can check up to ${MAX_URLS} URLs per batch.`);
      return;
    }
    setBusy(true);
    setResults([]);
    setSummary(null);
    setNotes([]);
    try {
      const data = await httpStatusService.checkBulk(urls);
      setResults(data.results || []);
      setSummary(data.summary || null);
      setNotes(data.notes || []);
    } catch (err: any) {
      toast.error(err?.message || 'HTTP check failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={Link2}
      title="Bulk HTTP checker"
      description="Inspect HTTP responses and follow redirect chains for every URL in a batch. HEAD with GET fallback, max 10 hops per URL."
      twoColumn
      actions={
        results.length ? (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>URLs to inspect</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`https://yourdomain.com/page-one\nhttps://yourdomain.com/page-two`}
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>{urls.length} URLs queued</span>
            <span>{Math.max(0, MAX_URLS - urls.length)} slots remaining</span>
          </div>
          <Button
            onClick={onCheck}
            disabled={busy || urls.length === 0}
            size="lg"
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Checking…
              </>
            ) : (
              <>
                <Link2 className="size-4" /> Check HTTP status
              </>
            )}
          </Button>
          <div className="rounded-md bg-sky/40 border border-sky px-3 py-2 flex items-start gap-2">
            <Info className="size-3.5 text-sky-ink shrink-0 mt-0.5" />
            <p className="text-xs text-sky-ink leading-relaxed">
              Follows redirects safely, stopping after 10 hops per URL. Catches mixed
              HTTPS/HTTP, long redirect chains, and infinite loops.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!busy && results.length === 0 && (
          <EmptyState
            icon={Link2}
            title="Results will appear here"
            description="Paste URLs and run a check to see HTTP status, final destination, and the full redirect chain."
          />
        )}

        {busy && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="size-6 animate-spin text-accent" />
              <p className="text-sm text-foreground-muted">
                Running checks for {urls.length} URL{urls.length !== 1 ? 's' : ''}…
              </p>
            </CardContent>
          </Card>
        )}

        {!busy && results.length > 0 && (
          <>
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Healthy" value={summary.ok} tone="mint" />
                <Stat label="Redirecting" value={summary.redirected} tone="sky" />
                <Stat label="Errors" value={summary.errors} tone="rose" />
                <Stat label="Total scanned" value={summary.total} />
              </div>
            )}

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Final status</TableHead>
                    <TableHead>Redirect chain</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((item) => (
                    <TableRow key={item.url}>
                      <TableCell className="max-w-[260px] align-top">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium hover:text-accent transition-colors"
                          title={item.url}
                        >
                          {item.url}
                        </a>
                        {item.finalUrl && item.finalUrl !== item.url && (
                          <div className="text-[11px] text-foreground-subtle truncate mt-1">
                            <span>Resolves to </span>
                            <a
                              href={item.finalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-foreground-muted hover:text-accent"
                            >
                              {item.finalUrl}
                            </a>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusPill status={item.finalStatus} />
                      </TableCell>
                      <TableCell>
                        {item.chain && item.chain.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {item.chain.map((hop, i) => (
                              <div
                                key={`${hop.url}-${i}`}
                                className="flex items-start gap-2 text-xs"
                              >
                                <StatusPill status={hop.status} />
                                <div className="min-w-0">
                                  <div className="truncate text-foreground" title={hop.url}>
                                    {hop.url || 'Unknown hop'}
                                  </div>
                                  {hop.resolvedLocation && (
                                    <div className="text-foreground-subtle truncate">
                                      → {hop.resolvedLocation}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-foreground-subtle">
                            No response captured
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {notes.length > 0 && (
              <Card className="border-butter">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertTriangle className="size-4 text-butter-ink mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1 text-sm">
                    <strong className="text-butter-ink">Run notes</strong>
                    <ul className="text-foreground">
                      {notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'mint' | 'sky' | 'rose' | 'default';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'mint' && 'text-mint-ink',
            tone === 'sky' && 'text-sky-ink',
            tone === 'rose' && 'text-rose-ink',
            tone === 'default' && 'text-foreground'
          )}
        >
          {value}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-foreground-subtle mt-1">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}
