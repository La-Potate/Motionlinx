import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Loader2, PlusCircle, Trash2, AlertCircle, Star, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import serpService from '@/shared/api/serp';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const PLACE_ID_REGEX = /^ChI[A-Za-z0-9_-]{20,}$/;
const MAX_ITEMS = 6;
const INITIAL_COLS = 4;

type Entry = {
  id: string;
  mapUrl: string;
  loading: boolean;
  error: string;
  data: any;
};

const createEntry = (idx = 0): Entry => ({
  id: `slot-${idx}-${Date.now()}`,
  mapUrl: '',
  loading: false,
  error: '',
  data: null,
});

function extractPlaceId(rawInput = '') {
  const base = { placeId: '', fallbackQuery: '', cid: '' };
  if (!rawInput) return base;
  const trimmed = rawInput.trim();
  try {
    const url = new URL(trimmed);
    const params = url.searchParams;
    if (params.has('place_id')) {
      const candidate = params.get('place_id') || '';
      if (PLACE_ID_REGEX.test(candidate)) base.placeId = candidate;
    }
    const cidMatch = url.toString().match(/(?:cid|ludocid)=([0-9]{5,})/i);
    if (cidMatch?.[1]) {
      base.cid = cidMatch[1];
      base.fallbackQuery = `https://www.google.com/maps?cid=${base.cid}`;
      return base;
    }
    base.fallbackQuery = url.toString();
    return base;
  } catch {
    // not a URL
  }
  if (PLACE_ID_REGEX.test(trimmed)) base.placeId = trimmed;
  const cidCandidate = (trimmed.match(/(?:cid|ludocid)=([0-9]{5,})/i) || [])[1];
  if (cidCandidate) {
    base.cid = cidCandidate;
    base.fallbackQuery = `https://www.google.com/maps?cid=${cidCandidate}`;
    return base;
  }
  base.fallbackQuery = trimmed;
  return base;
}

function buildEmbedUrl(data: any) {
  if (!data) return '';
  const coords = data?.coordinates;
  const placeId = data?.placeId;
  const cid = data?.cid;
  const key = serpService.getGooglePlacesKey?.();
  if (key && placeId) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=place_id:${placeId}`;
  }
  if (key && coords?.lat && coords?.lng) {
    return `https://www.google.com/maps/embed/v1/view?key=${key}&center=${coords.lat},${coords.lng}&zoom=15`;
  }
  if (placeId) {
    return `https://www.google.com/maps?q=place_id:${encodeURIComponent(placeId)}&output=embed`;
  }
  if (coords?.lat && coords?.lng) {
    return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&output=embed`;
  }
  if (cid) return `https://www.google.com/maps?q=cid:${encodeURIComponent(cid)}&output=embed`;
  if (data?.mapsUrl)
    return `${data.mapsUrl}${data.mapsUrl.includes('?') ? '&' : '?'}output=embed`;
  return '';
}

const summaryRows: { label: string; accessor: (d: any) => string }[] = [
  { label: 'Name', accessor: (d) => d?.name || d?.title || '—' },
  {
    label: 'Rating',
    accessor: (d) => (typeof d?.rating === 'number' ? d.rating.toFixed(1) : '—'),
  },
  {
    label: 'Reviews',
    accessor: (d) =>
      typeof d?.userRatingsTotal === 'number'
        ? d.userRatingsTotal.toLocaleString()
        : typeof d?.reviews === 'number'
          ? d.reviews.toLocaleString()
          : '—',
  },
  { label: 'Status', accessor: (d) => d?.businessStatus || '—' },
  { label: 'Address', accessor: (d) => d?.address || '—' },
  { label: 'Phone', accessor: (d) => d?.phone || d?.internationalPhone || '—' },
  { label: 'Website', accessor: (d) => d?.website || '—' },
  {
    label: 'Categories',
    accessor: (d) => (Array.isArray(d?.categories) ? d.categories.join(', ') : '—'),
  },
  { label: 'Place ID', accessor: (d) => d?.placeId || '—' },
  { label: 'CID', accessor: (d) => d?.cid || '—' },
];

export default function GbaComparePage() {
  const location = useLocation();
  const seed = (location.state as any)?.compareSeed;
  const seedAppliedRef = useRef(false);
  const [entries, setEntries] = useState<Entry[]>(() =>
    Array.from({ length: INITIAL_COLS }, (_, i) => createEntry(i))
  );

  const hasData = useMemo(() => entries.some((e) => e.data), [entries]);

  const update = (i: number, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const handleFetch = async (i: number) => {
    const t = entries[i];
    if (!t) return;
    const value = t.mapUrl.trim();
    if (!value) {
      update(i, { error: 'Enter a Google Maps link or place ID.' });
      return;
    }
    const parsed = extractPlaceId(value);
    const identifier = parsed.placeId || parsed.cid || parsed.fallbackQuery;
    const canonicalUrl = parsed.fallbackQuery || value;
    update(i, { loading: true, error: '', mapUrl: canonicalUrl });
    try {
      const res: any = await serpService.getBusinessDetails(identifier, {
        mapUrl: canonicalUrl,
        cid: parsed.cid || parsed.fallbackQuery,
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to fetch business.');
      update(i, { data: res.data, loading: false, error: '' });
    } catch (err: any) {
      update(i, { loading: false, error: err?.message || 'Fetch failed.' });
    }
  };

  const addEntry = () => {
    if (entries.length >= MAX_ITEMS) return;
    setEntries((prev) => [...prev, createEntry(prev.length)]);
  };

  const removeEntry = (i: number) => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  };

  useEffect(() => {
    if (!seed || seedAppliedRef.current) return;
    seedAppliedRef.current = true;
    const base: Entry[] = [];
    if (seed.primary) {
      base.push({
        ...createEntry(0),
        id: 'seed-primary',
        mapUrl: seed.primary.mapUrl || '',
        data: seed.primary.data || null,
      });
    }
    const extras = Array.isArray(seed.competitors) ? seed.competitors : [];
    extras.slice(0, MAX_ITEMS - base.length).forEach((item: any, idx: number) => {
      base.push({
        ...createEntry(idx + 1),
        id: `seed-${idx}`,
        mapUrl: item.mapUrl || '',
        data: item.data || null,
      });
    });
    const hydrated = base.length ? base : entries;
    setEntries(hydrated);
    setTimeout(() => {
      hydrated.forEach((entry, idx) => {
        if (entry.mapUrl && !entry.data) handleFetch(idx);
      });
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={Sparkles}
      title="Compare Google Business"
      description="Stack up to 6 listings side-by-side with live map embeds."
      actions={
        <Button onClick={addEntry} disabled={entries.length >= MAX_ITEMS} variant="outline">
          <PlusCircle className="size-4" /> Add business
        </Button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {entries.map((entry, i) => {
          const embedUrl = buildEmbedUrl(entry.data);
          return (
            <Card key={entry.id} className="flex flex-col">
              <CardContent className="p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
                    <Input
                      placeholder="Maps URL or place ID"
                      value={entry.mapUrl}
                      onChange={(e) => update(i, { mapUrl: e.target.value })}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleFetch(i)}
                    disabled={entry.loading}
                  >
                    {entry.loading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      'Fetch'
                    )}
                  </Button>
                  {entries.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeEntry(i)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-3.5 text-rose-ink" />
                    </Button>
                  )}
                </div>
                {entry.error && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-ink">
                    <AlertCircle className="size-3" /> {entry.error}
                  </div>
                )}
                <div className="aspect-square rounded-md bg-surface-muted overflow-hidden border border-border">
                  {embedUrl ? (
                    <iframe
                      title={`Map ${entry.data?.name || i + 1}`}
                      src={embedUrl}
                      loading="lazy"
                      allowFullScreen
                      className="size-full"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center text-foreground-subtle text-xs">
                      No data yet
                    </div>
                  )}
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground truncate">
                    {entry.data?.name || 'Waiting for data'}
                  </div>
                  <div className="flex items-center gap-2 text-foreground-muted mt-0.5 flex-wrap">
                    {typeof entry.data?.rating === 'number' && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="size-3 text-accent fill-accent" />
                        {entry.data.rating.toFixed(1)}
                      </span>
                    )}
                    {typeof entry.data?.userRatingsTotal === 'number' && (
                      <span>{entry.data.userRatingsTotal.toLocaleString()} reviews</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasData && (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Attribute</TableHead>
                {entries.map((e) => (
                  <TableHead key={`${e.id}-h`}>
                    <span className="truncate block max-w-[180px]">
                      {e.data?.name || '—'}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium text-foreground-muted text-xs uppercase tracking-wider">
                    {row.label}
                  </TableCell>
                  {entries.map((e) => (
                    <TableCell
                      key={`${e.id}-${row.label}`}
                      className="text-sm text-foreground"
                    >
                      <span className="truncate block max-w-[200px]" title={row.accessor(e.data)}>
                        {row.accessor(e.data)}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </ToolPage>
  );
}
