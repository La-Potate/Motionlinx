import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Play,
  Trash2,
  Loader2,
  RefreshCw,
  MapPin,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { heatmapService } from '@/shared/api/heatmap';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/sonner';
import { AddressSearch } from '@/features/web-search/components/AddressSearch';
import { parsePlaceInput, parseLatLngFromMapsUrl } from '@/shared/lib/placeId';
import { cn } from '@/shared/lib/cn';

export default function HeatmapPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // These mirror the API contract. The old form collected `radius` and `grid`
  // and no placeId/lat/lng at all, so every create returned 400.
  const [form, setForm] = useState({
    name: '',
    keyword: '',
    address: '',
    business: '',
    placeId: '',
    lat: '',
    lng: '',
    radiusMiles: '3',
    grid: '5',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await heatmapService.listReports();
      setReports(Array.isArray(data?.reports) ? data.reports : data || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!form.name.trim() || !form.keyword.trim()) {
      toast.error('Report name and keyword are required.');
      return;
    }
    if (!form.placeId.trim()) {
      toast.error('Paste the business’s Google Maps link so we can identify it.');
      return;
    }
    if (!form.lat || !form.lng) {
      toast.error('Set the map centre — search the address or paste a Maps link.');
      return;
    }
    setBusy(true);
    try {
      const miles = parseFloat(form.radiusMiles) || 3;
      const grid = Math.max(parseInt(form.grid, 10) || 5, 2);
      const radiusMeters = Math.round(miles * 1609.34);
      const payload = {
        name: form.name.trim(),
        keyword: form.keyword.trim(),
        address: form.address.trim(),
        placeId: form.placeId.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        gridSize: grid,
        radiusMeters,
        // Spacing between cells: spread the grid evenly across the diameter,
        // so a wider radius does not silently sample the same tight cluster.
        stepMeters: Math.max(Math.round((radiusMeters * 2) / Math.max(grid - 1, 1)), 50),
      };
      const data: any = await heatmapService.createReport(payload);
      toast.success('Report created');
      setShowCreate(false);
      setForm({
        name: '',
        keyword: '',
        address: '',
        business: '',
        placeId: '',
        lat: '',
        lng: '',
        radiusMiles: '3',
        grid: '5',
      });
      refresh();
      if (data?.id) setSelected(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create');
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async (id: number) => {
    setBusy(true);
    try {
      await heatmapService.generateReport(id);
      toast.success('Snapshot started');
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('Delete this report?')) return;
    try {
      await heatmapService.deleteReport(id);
      toast.success('Deleted');
      if (selected?.id === id) setSelected(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={MapPin}
      title="Google Business Heatmap"
      description="Visualise ranking density across a service area by sampling a geographic grid."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> New report
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-3">
          {loading ? (
            <Skeleton className="h-32" />
          ) : reports.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No heatmap reports"
              description="Create a report defining a keyword, center address, radius and grid size."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" /> Create report
                </Button>
              }
            />
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={cn(
                  'text-left rounded-md border border-border bg-surface p-3 transition-colors hover:border-border-strong',
                  selected?.id === r.id && 'border-accent shadow-elevation-sm'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <Badge
                    variant={
                      r.status === 'done'
                        ? 'mint'
                        : r.status === 'running'
                          ? 'sky'
                          : r.status === 'failed'
                            ? 'rose'
                            : 'butter'
                    }
                  >
                    {r.status || 'pending'}
                  </Badge>
                </div>
                <div className="text-xs text-foreground-subtle mt-1 truncate">
                  {r.keyword} · {r.address}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-col gap-4">
          {!selected ? (
            <EmptyState
              icon={MapPin}
              title="No report selected"
              description="Pick a heatmap from the list to preview the grid."
            />
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">
                        {selected.name}
                      </h2>
                      <div className="text-xs text-foreground-muted mt-1">
                        {selected.keyword} · {selected.address}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => onGenerate(selected.id)} disabled={busy}>
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        Generate snapshot
                      </Button>
                      <Button
                        variant="outline"
                        asChild
                      >
                        <a
                          href={heatmapService.reportHtmlUrl(selected.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-4" /> Open report
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(selected.id)}
                      >
                        <Trash2 className="size-4 text-rose-ink" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selected.status === 'pending' && (
                <Card className="border-butter">
                  <CardContent className="flex items-start gap-3 p-4">
                    <AlertCircle className="size-4 text-butter-ink shrink-0 mt-0.5" />
                    <p className="text-sm">
                      No snapshot yet — click <strong>Generate snapshot</strong> to sample
                      the grid.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-0">
                  <iframe
                    title="Heatmap preview"
                    src={heatmapService.reportHtmlUrl(selected.id)}
                    className="w-full h-[640px] rounded-lg border-0"
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New heatmap report</DialogTitle>
            <DialogDescription>
              Defines a grid centered on an address. Each cell pings SERP for the keyword.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldRow id="h-name" label="Report name">
              <Input
                id="h-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FieldRow>
            <FieldRow id="h-kw" label="Keyword">
              <Input
                id="h-kw"
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                placeholder="plumber near me"
              />
            </FieldRow>

            {/* The business being ranked. Parsed locally, so setting up a
                report needs no Google key — only generating the grid does. */}
            <FieldRow
              id="h-biz"
              label="Business — Google Maps link or place ID"
              className="sm:col-span-2"
            >
              <Input
                id="h-biz"
                value={form.business}
                onChange={(e) => {
                  const business = e.target.value;
                  const parsed = parsePlaceInput(business);
                  const coords = parseLatLngFromMapsUrl(business);
                  setForm((f) => ({
                    ...f,
                    business,
                    placeId: parsed.placeId,
                    // A pasted Maps URL usually carries the coordinates too.
                    lat: coords ? String(coords.lat) : f.lat,
                    lng: coords ? String(coords.lng) : f.lng,
                  }));
                }}
                placeholder="https://www.google.com/maps/place/… or ChIJ…"
              />
              <span className="text-xs text-foreground-muted">
                {form.placeId ? (
                  <span className="text-mint-ink">Place ID found: {form.placeId}</span>
                ) : form.business ? (
                  'No place ID in that link yet — open the business in Google Maps and copy the URL from the address bar.'
                ) : (
                  'Identifies which business to track across the grid.'
                )}
              </span>
            </FieldRow>

            {/* Centre of the grid. Uses the keyless geocode endpoint. */}
            <FieldRow id="h-addr" label="Grid centre" className="sm:col-span-2">
              <AddressSearch
                id="h-addr"
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onPick={(hit) =>
                  setForm((f) => ({
                    ...f,
                    address: hit.displayName,
                    lat: Number(hit.lat).toFixed(6),
                    lng: Number(hit.lng).toFixed(6),
                  }))
                }
                placeholder="Search the business address"
              />
              <span className="text-xs text-foreground-muted">
                {form.lat && form.lng
                  ? `Centre set: ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`
                  : 'Search an address, or paste a Maps link above to fill this automatically.'}
              </span>
            </FieldRow>

            <FieldRow id="h-radius" label="Radius (miles)">
              <Input
                id="h-radius"
                type="number"
                min="0.1"
                step="0.1"
                value={form.radiusMiles}
                onChange={(e) => setForm({ ...form, radiusMiles: e.target.value })}
              />
            </FieldRow>
            <FieldRow id="h-grid" label="Grid size (cells per side)">
              <Input
                id="h-grid"
                type="number"
                min="2"
                max="15"
                value={form.grid}
                onChange={(e) => setForm({ ...form, grid: e.target.value })}
              />
            </FieldRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}

function FieldRow({
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
