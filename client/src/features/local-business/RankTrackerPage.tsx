import { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Building2,
  Download,
  ArrowDown,
  ArrowUp,
  Minus,
} from 'lucide-react';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/sonner';
import { downloadCsv, stampedName } from '@/shared/lib/exportCsv';
import { cn } from '@/shared/lib/cn';
import rankingsService, { type Business, type Keyword } from '@/shared/api/rankings';

export default function RankTrackerPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [traffic, setTraffic] = useState<any[]>([]);

  const [showBiz, setShowBiz] = useState(false);
  const [bizForm, setBizForm] = useState({ name: '', website: '', address: '', category: '' });
  const [kwInput, setKwInput] = useState('');
  const [kwUrl, setKwUrl] = useState('');

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await rankingsService.listBusinesses();
      setBusinesses(rows);
      setSelected((prev) => (prev ? rows.find((r) => r.id === prev.id) || null : rows[0] || null));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const loadDetail = useCallback(async (id: number) => {
    // Each tab has its own endpoint; fetched together so switching tabs is
    // instant and a single failure cannot blank the whole panel.
    const [k, c, b, t] = await Promise.allSettled([
      rankingsService.listKeywords(id),
      rankingsService.listCompetitors(id),
      rankingsService.listBacklinks(id),
      rankingsService.listTraffic(id),
    ]);
    setKeywords(k.status === 'fulfilled' ? k.value : []);
    setCompetitors(c.status === 'fulfilled' ? c.value : []);
    setBacklinks(b.status === 'fulfilled' ? b.value : []);
    setTraffic(t.status === 'fulfilled' ? t.value : []);
  }, []);

  useEffect(() => {
    if (selected?.id) loadDetail(selected.id);
  }, [selected?.id, loadDetail]);

  const onCreateBusiness = async () => {
    if (!bizForm.name.trim()) {
      toast.error('Business name is required.');
      return;
    }
    setBusy(true);
    try {
      await rankingsService.createBusiness({
        name: bizForm.name.trim(),
        website: bizForm.website.trim(),
        address: bizForm.address.trim(),
        category: bizForm.category.trim(),
      });
      toast.success('Business added');
      setShowBiz(false);
      setBizForm({ name: '', website: '', address: '', category: '' });
      loadBusinesses();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add business');
    } finally {
      setBusy(false);
    }
  };

  const onAddKeyword = async () => {
    if (!selected || !kwInput.trim()) return;
    setBusy(true);
    try {
      await rankingsService.addKeyword(selected.id, {
        keyword: kwInput.trim(),
        target_url: kwUrl.trim() || undefined,
        country: 'US',
        language: 'en',
        device: 'desktop',
      });
      setKwInput('');
      setKwUrl('');
      await loadDetail(selected.id);
      loadBusinesses();
      toast.success('Keyword added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add keyword');
    } finally {
      setBusy(false);
    }
  };

  const onLogPosition = async (kw: Keyword) => {
    const raw = window.prompt(`Position for “${kw.keyword}”? (1–100)`);
    if (raw === null) return;
    const position = parseInt(raw, 10);
    if (!Number.isFinite(position) || position < 1 || position > 100) {
      toast.error('Enter a position between 1 and 100.');
      return;
    }
    try {
      await rankingsService.trackKeyword(kw.id, { position, device: kw.device || 'desktop' });
      await loadDetail(selected!.id);
      loadBusinesses();
      toast.success('Position recorded');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record position');
    }
  };

  const onDeleteKeyword = async (kw: Keyword) => {
    if (!window.confirm(`Stop tracking “${kw.keyword}”?`)) return;
    try {
      await rankingsService.deleteKeyword(kw.id);
      await loadDetail(selected!.id);
      loadBusinesses();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete keyword');
    }
  };

  const onRefresh = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await rankingsService.refreshBusiness(selected.id);
      const ok = (res.results || []).filter((r: any) => r?.success).length;
      const failed = (res.results || []).length - ok;
      await loadDetail(selected.id);
      loadBusinesses();
      if (ok) toast.success(`Updated ${ok} keyword${ok === 1 ? '' : 's'}.`);
      if (failed) {
        toast.error(
          `${failed} could not be checked — this needs a Google API key and Search Engine ID.`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Refresh failed');
    } finally {
      setBusy(false);
    }
  };

  const exportKeywords = () => {
    if (!keywords.length) return;
    downloadCsv(
      stampedName(`rank-tracker-${selected?.name || 'business'}`),
      ['keyword', 'last_position', 'best_position', 'worst_position', 'volume', 'difficulty', 'target_url', 'last_checked'],
      keywords.map((k) => [
        k.keyword,
        k.last_position ?? '',
        k.best_position ?? '',
        k.worst_position ?? '',
        k.search_volume ?? '',
        k.difficulty ?? '',
        k.target_url ?? '',
        k.last_checked_at ?? '',
      ])
    );
  };

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={TrendingUp}
      title="Rank Tracker"
      description="Track keyword positions for a business over time, alongside competitors, backlinks and traffic."
      actions={
        selected ? (
          <>
            <Button variant="outline" size="sm" onClick={exportKeywords} disabled={!keywords.length}>
              <Download className="size-3.5" /> Export CSV
            </Button>
            <Button size="sm" onClick={onRefresh} disabled={busy || !keywords.length}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh positions
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        {/* --- business list --- */}
        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Businesses</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowBiz(true)}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 p-3 pt-0">
            {loading ? (
              <>
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </>
            ) : businesses.length === 0 ? (
              <p className="px-2 py-3 text-xs text-foreground-muted">
                No businesses yet. Add one to start tracking keywords.
              </p>
            ) : (
              businesses.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelected(b)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected?.id === b.id
                      ? 'border-accent bg-accent-soft/40'
                      : 'border-border hover:border-border-strong'
                  )}
                >
                  <span className="truncate text-sm font-medium text-foreground">{b.name}</span>
                  <span className="text-[11px] text-foreground-muted tabular-nums">
                    {b.keyword_count ?? 0} keyword{(b.keyword_count ?? 0) === 1 ? '' : 's'}
                    {b.average_position ? ` · avg #${Math.round(b.average_position)}` : ''}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* --- detail --- */}
        {!selected ? (
          <EmptyState
            icon={Building2}
            title="No business selected"
            description="Add a business, then track the keywords you want to watch. Positions can be entered by hand, or fetched automatically once a Google API key is configured."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Keywords" value={String(selected.keyword_count ?? 0)} />
              <Stat label="Tracked" value={String(selected.tracked_keywords ?? 0)} />
              <Stat
                label="Avg position"
                value={selected.average_position ? `#${Math.round(selected.average_position)}` : '—'}
              />
              <Stat
                label="Best"
                value={selected.best_position ? `#${selected.best_position}` : '—'}
              />
            </div>

            <Tabs defaultValue="keywords">
              <TabsList>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="competitors">Competitors</TabsTrigger>
                <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
                <TabsTrigger value="traffic">Traffic</TabsTrigger>
              </TabsList>

              <TabsContent value="keywords">
                <Card>
                  <CardContent className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="rt-kw">Keyword</Label>
                        <Input
                          id="rt-kw"
                          value={kwInput}
                          onChange={(e) => setKwInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && onAddKeyword()}
                          placeholder="emergency plumber austin"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="rt-url">Target URL (optional)</Label>
                        <Input
                          id="rt-url"
                          value={kwUrl}
                          onChange={(e) => setKwUrl(e.target.value)}
                          placeholder="https://example.com/page"
                        />
                      </div>
                      <Button onClick={onAddKeyword} disabled={busy || !kwInput.trim()}>
                        <Plus className="size-4" /> Track
                      </Button>
                    </div>

                    {keywords.length === 0 ? (
                      <p className="text-sm text-foreground-muted">
                        No keywords tracked yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Keyword</TableHead>
                              <TableHead>Current</TableHead>
                              <TableHead>Best</TableHead>
                              <TableHead>Worst</TableHead>
                              <TableHead>Checked</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {keywords.map((k) => (
                              <TableRow key={k.id}>
                                <TableCell className="font-medium">
                                  {k.keyword}
                                  {k.target_url && (
                                    <span className="block truncate text-[11px] text-foreground-subtle">
                                      {k.target_url}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <PositionCell current={k.last_position} best={k.best_position} />
                                </TableCell>
                                <TableCell className="tabular-nums text-foreground-muted">
                                  {k.best_position ? `#${k.best_position}` : '—'}
                                </TableCell>
                                <TableCell className="tabular-nums text-foreground-muted">
                                  {k.worst_position ? `#${k.worst_position}` : '—'}
                                </TableCell>
                                <TableCell className="text-xs text-foreground-muted">
                                  {k.last_checked_at
                                    ? new Date(k.last_checked_at).toLocaleDateString()
                                    : 'never'}
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onLogPosition(k)}
                                    >
                                      Log
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      onClick={() => onDeleteKeyword(k)}
                                      aria-label={`Stop tracking ${k.keyword}`}
                                    >
                                      <Trash2 className="size-3.5 text-rose-ink" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <p className="text-xs text-foreground-muted">
                      “Log” records a position by hand and needs no API key. “Refresh
                      positions” checks them automatically and needs a Google API key
                      with a Search Engine ID.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="competitors">
                <SimpleList
                  rows={competitors}
                  empty="No competitors recorded."
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'position', label: 'Position' },
                    { key: 'rating', label: 'Rating' },
                    { key: 'reviews', label: 'Reviews' },
                    { key: 'website', label: 'Website' },
                  ]}
                />
              </TabsContent>

              <TabsContent value="backlinks">
                <SimpleList
                  rows={backlinks}
                  empty="No backlinks recorded."
                  columns={[
                    { key: 'domain', label: 'Domain' },
                    { key: 'anchor_text', label: 'Anchor' },
                    { key: 'type', label: 'Type' },
                    { key: 'domain_authority', label: 'DA' },
                    { key: 'url', label: 'URL' },
                  ]}
                />
              </TabsContent>

              <TabsContent value="traffic">
                <SimpleList
                  rows={traffic}
                  empty="No traffic snapshots recorded."
                  columns={[
                    { key: 'date', label: 'Date' },
                    { key: 'monthly_visits', label: 'Visits' },
                    { key: 'growth_rate', label: 'Growth %' },
                    { key: 'organic_percentage', label: 'Organic %' },
                    { key: 'direct_percentage', label: 'Direct %' },
                  ]}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <Dialog open={showBiz} onOpenChange={setShowBiz}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a business</DialogTitle>
            <DialogDescription>
              Keywords, competitors and backlinks are all tracked against a business.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="b-name" label="Name">
              <Input
                id="b-name"
                value={bizForm.name}
                onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
              />
            </Field>
            <Field id="b-cat" label="Category">
              <Input
                id="b-cat"
                value={bizForm.category}
                onChange={(e) => setBizForm({ ...bizForm, category: e.target.value })}
                placeholder="Plumber"
              />
            </Field>
            <Field id="b-web" label="Website" className="sm:col-span-2">
              <Input
                id="b-web"
                value={bizForm.website}
                onChange={(e) => setBizForm({ ...bizForm, website: e.target.value })}
                placeholder="https://example.com"
              />
            </Field>
            <Field id="b-addr" label="Address" className="sm:col-span-2">
              <Input
                id="b-addr"
                value={bizForm.address}
                onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBiz(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateBusiness} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add business
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}

/* ---------------------------------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** Current position, with movement against the best ever seen. */
function PositionCell({
  current,
  best,
}: {
  current?: number | null;
  best?: number | null;
}) {
  if (!current) return <span className="text-foreground-subtle">—</span>;
  const tone = current <= 3 ? 'mint' : current <= 10 ? 'sky' : current <= 30 ? 'butter' : 'rose';
  const delta = best ? current - best : 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={tone as any}>#{current}</Badge>
      {delta > 0 ? (
        <span className="inline-flex items-center text-[11px] text-rose-ink">
          <ArrowDown className="size-3" />
          {delta}
        </span>
      ) : delta === 0 && best ? (
        <span className="inline-flex items-center text-[11px] text-mint-ink">
          <ArrowUp className="size-3" />
          best
        </span>
      ) : (
        <Minus className="size-3 text-foreground-subtle" />
      )}
    </span>
  );
}

function SimpleList({
  rows,
  columns,
  empty,
}: {
  rows: any[];
  columns: { key: string; label: string }[];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-muted">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id ?? i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="max-w-[240px] truncate">
                        {r[c.key] ?? '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
