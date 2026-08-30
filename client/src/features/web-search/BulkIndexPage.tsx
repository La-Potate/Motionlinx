import { useMemo, useState } from 'react';
import {
  Download,
  ListChecks,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Search,
} from 'lucide-react';
import indexCheckerService from '@/shared/api/indexChecker';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { toast } from '@/shared/ui/sonner';
import { downloadCsv, stampedName } from '@/shared/lib/exportCsv';

const MAX_URLS = 100;

type IndexStatus = 'indexed' | 'missing' | 'unknown' | string;
type Item = {
  url: string;
  status?: IndexStatus;
  google?: { status: IndexStatus };
  bing?: { status: IndexStatus };
  firstResult?: { title?: string; snippet?: string; link?: string };
};

export default function BulkIndexPage() {
  const [raw, setRaw] = useState('');
  // The backend supports three lookup routes; only the first was reachable
  // before. Each needs a different credential, named in the picker so it is
  // clear before you run rather than after it fails.
  const [mode, setMode] = useState<'dataforseo-dual' | 'dataforseo' | 'google-api'>(
    'dataforseo-dual'
  );
  const [results, setResults] = useState<Item[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);

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
      toast.error('Paste at least one URL.');
      return;
    }
    if (urls.length > MAX_URLS) {
      toast.error(`Maximum ${MAX_URLS} URLs per batch.`);
      return;
    }
    setBusy(true);
    setResults([]);
    setSummary(null);
    try {
      const data = await indexCheckerService.checkBulk(urls, { mode });
      setResults(data.results || []);
      setSummary(data.summary || null);
    } catch (err: any) {
      toast.error(err?.message || 'Check failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!results.length) return;
    downloadCsv(
      stampedName('index-check'),
      ['url', 'google', 'bing', 'title', 'snippet', 'first_result'],
      results.map((r: any) => [
        r.url,
        r.google?.status ?? r.status ?? '',
        r.bing?.status ?? '',
        r.firstResult?.title ?? '',
        r.firstResult?.snippet ?? '',
        r.firstResult?.link ?? '',
      ])
    );
  };

  const pct = Math.min((urls.length / MAX_URLS) * 100, 100);

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={ListChecks}
      title="Bulk index checker"
      description={`Verify Google and Bing index coverage for up to ${MAX_URLS} URLs in one pass.`}
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
          <CardTitle>URLs to check</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`Paste URLs here, one per line\nhttps://example.com/page-one\nhttps://example.com/page-two`}
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bi-mode">Lookup source</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger id="bi-mode" className="sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dataforseo-dual">
                  Google + Bing — via DataForSEO
                </SelectItem>
                <SelectItem value="dataforseo">Google only — via DataForSEO</SelectItem>
                <SelectItem value="google-api">
                  Google only — via Programmable Search
                </SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-foreground-muted">
              {mode === 'google-api'
                ? 'Needs a Google API key and Search Engine ID (CX) in Settings.'
                : 'Needs DataForSEO credentials in Settings.'}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 flex items-center gap-3 max-w-sm">
              <Progress value={pct} className="flex-1" />
              <span className="text-xs text-foreground-muted tabular-nums whitespace-nowrap">
                {urls.length} / {MAX_URLS}
              </span>
            </div>
            <Button onClick={onCheck} disabled={busy || urls.length === 0} size="lg">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Search className="size-4" /> Check index status
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!busy && results.length === 0 && (
        <EmptyState
          icon={ListChecks}
          title="Results will appear here"
          description="Paste your list and run the check. Each URL is queried against Google and Bing in parallel."
        />
      )}

      {busy && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-sm text-foreground-muted">
              Checking {urls.length} URL{urls.length !== 1 ? 's' : ''}…
            </p>
          </CardContent>
        </Card>
      )}

      {!busy && results.length > 0 && (
        <div className="flex flex-col gap-4">
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Total" value={summary.total} />
              <Stat
                label="Google indexed"
                value={summary.googleIndexed ?? summary.indexed}
                tone="mint"
              />
              <Stat
                label="Google missing"
                value={summary.googleMissing ?? summary.missing}
                tone="rose"
              />
              <Stat label="Bing indexed" value={summary.bingIndexed ?? 0} tone="mint" />
              <Stat label="Bing missing" value={summary.bingMissing ?? 0} tone="rose" />
            </div>
          )}

          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Google</TableHead>
                  <TableHead>Bing</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Snippet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((item) => (
                  <TableRow key={item.url}>
                    <TableCell className="max-w-[260px]">
                      <div className="flex flex-col gap-1 min-w-0">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-sm font-medium text-foreground hover:text-accent transition-colors"
                          title={item.url}
                        >
                          {item.url}
                        </a>
                        {item.firstResult?.link && (
                          <a
                            href={item.firstResult.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle hover:text-accent transition-colors w-fit"
                          >
                            View result <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.google?.status ?? item.status ?? 'unknown'} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.bing?.status ?? item.status ?? 'unknown'} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {item.firstResult?.title || (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs text-foreground-muted">
                      {item.firstResult?.snippet || (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </ToolPage>
  );
}

function StatusBadge({ status }: { status: IndexStatus }) {
  if (status === 'indexed') {
    return (
      <Badge variant="mint">
        <CheckCircle2 className="size-3" /> Indexed
      </Badge>
    );
  }
  if (status === 'missing') {
    return (
      <Badge variant="rose">
        <XCircle className="size-3" /> Not indexed
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <AlertTriangle className="size-3" /> Unknown
    </Badge>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'mint' | 'rose';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={
            tone === 'mint'
              ? 'text-2xl font-semibold text-mint-ink tabular-nums'
              : tone === 'rose'
                ? 'text-2xl font-semibold text-rose-ink tabular-nums'
                : 'text-2xl font-semibold text-foreground tabular-nums'
          }
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
