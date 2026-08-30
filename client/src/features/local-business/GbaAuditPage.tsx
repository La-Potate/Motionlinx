import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Loader2,
  MapPin,
  History,
  Star,
  Phone,
  Globe,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { motion } from 'motion/react';
import serpService from '@/shared/api/serp';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/sonner';
import { stagger } from '@/shared/motion/presets';

const PLACE_ID_REGEX = /^ChI[A-Za-z0-9_-]{20,}$/;

function extractIdentifier(input: string) {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const placeId = url.searchParams.get('place_id') || '';
    if (PLACE_ID_REGEX.test(placeId)) return placeId;
    const cidMatch = url.toString().match(/(?:cid|ludocid)=([0-9]{5,})/i);
    if (cidMatch?.[1]) return cidMatch[1];
    return url.toString();
  } catch {
    return trimmed;
  }
}

export default function GbaAuditPage() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  // Every successful audit is already saved server-side; this page simply
  // never read it back, so results vanished the moment you navigated away.
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSaved, setViewingSaved] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res: any = await serpService.getBusinessHistory();
      if (res?.ok) setHistory(res.data?.data || []);
    } catch {
      // Non-fatal: the audit itself still works without the saved list.
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const openSaved = async (id: string) => {
    setBusy(true);
    try {
      const res: any = await serpService.getBusinessHistoryItem(id);
      if (!res?.ok) throw new Error(res?.data?.error || 'Could not open that audit');
      const item = res.data?.data;
      setData(item?.data || null);
      setViewingSaved(id);
      setHistoryOpen(false);
      if (!item?.data) toast.info?.('That saved audit has no stored detail.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not open that audit');
    } finally {
      setBusy(false);
    }
  };

  const onRun = async () => {
    if (!input.trim()) {
      toast.error('Paste a Google Business URL or place ID.');
      return;
    }
    setBusy(true);
    try {
      const identifier = extractIdentifier(input);
      const res: any = await serpService.getBusinessDetails(identifier, {
        mapUrl: input.trim(),
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to fetch business');
      setData(res.data);
      setViewingSaved(null);
      loadHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Audit failed');
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={Sparkles}
      title="Google Business Audit"
      description="Inspect a Google Business profile for completeness, accuracy, and risk."
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="gba-input">Google Business URL or place ID</Label>
              <Input
                id="gba-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://maps.google.com/?cid=... or ChI..."
              />
            </div>
            <Button size="lg" onClick={onRun} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Auditing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Run audit
                </>
              )}
            </Button>
            {history.length > 0 && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <History className="size-4" />
                Saved ({history.length})
              </Button>
            )}
          </div>

          {historyOpen && history.length > 0 && (
            <div className="mt-4 flex flex-col gap-1 rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs text-foreground-muted">
                  Your most recent audit for each business, newest first. Re-auditing a
                  business replaces its saved entry.
                </p>
              </div>
              <ul className="max-h-72 overflow-auto">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => openSaved(h.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {h.title || 'Unknown business'}
                        </span>
                        <span className="text-xs text-foreground-muted">
                          {h.auditAt ? new Date(h.auditAt).toLocaleString() : '—'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-foreground-muted tabular-nums">
                        {typeof h.rating === 'number' && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3" /> {h.rating}
                          </span>
                        )}
                        {h.reviewCount ? <span>{h.reviewCount} reviews</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {viewingSaved && data && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-sky bg-sky/25 px-4 py-2.5">
          <span className="text-sm text-foreground">
            Showing a saved audit, not a fresh lookup.
          </span>
          <Button size="sm" variant="outline" onClick={onRun} disabled={busy || !input.trim()}>
            Re-run
          </Button>
        </div>
      )}

      {!data ? (
        <EmptyState
          icon={Sparkles}
          title="No audit yet"
          description="Paste a Google Business profile URL or place ID to inspect completeness, ratings, attributes, and risks."
        />
      ) : (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-4"
        >
          <motion.div variants={stagger.item}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {data.name || data.title || 'Untitled profile'}
                    </h2>
                    <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-foreground-muted">
                      {typeof data.rating === 'number' && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-3.5 text-accent fill-accent" />
                          <strong>{data.rating.toFixed(1)}</strong>
                          <span className="text-foreground-subtle">
                            ({(data.userRatingsTotal || data.reviews || 0).toLocaleString()} reviews)
                          </span>
                        </span>
                      )}
                      {data.businessStatus && (
                        <Badge variant={data.businessStatus === 'OPERATIONAL' ? 'mint' : 'butter'}>
                          {data.businessStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={stagger.item} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailRow icon={MapPin} label="Address" value={data.address} />
            <DetailRow icon={Phone} label="Phone" value={data.phone || data.internationalPhone} />
            <DetailRow
              icon={Globe}
              label="Website"
              value={
                data.website ? (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline truncate inline-block max-w-full"
                  >
                    {data.website}
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <DetailRow
              icon={Clock}
              label="Hours"
              value={
                data.openingHours?.weekday_text?.length
                  ? data.openingHours.weekday_text.join(' · ')
                  : '—'
              }
            />
          </motion.div>

          {Array.isArray(data.categories) && data.categories.length > 0 && (
            <motion.div variants={stagger.item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Categories</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {data.categories.map((cat: string) => (
                      <Badge key={cat} variant="accent">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {Array.isArray(data.completeness?.missingFields) && (
            <motion.div variants={stagger.item}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Profile completeness
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {data.completeness.missingFields.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-mint-ink">
                      <CheckCircle2 className="size-4" />
                      All key fields present.
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {data.completeness.missingFields.map((f: string) => (
                        <li
                          key={f}
                          className="flex items-center gap-2 text-sm text-rose-ink"
                        >
                          <AlertCircle className="size-3.5" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </ToolPage>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent-pressed shrink-0">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-foreground-subtle">
            {label}
          </div>
          <div className="text-sm text-foreground mt-0.5 truncate">{value || '—'}</div>
        </div>
      </CardContent>
    </Card>
  );
}
