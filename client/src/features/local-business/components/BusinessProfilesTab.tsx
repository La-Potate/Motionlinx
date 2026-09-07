import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Loader2,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import citationService from '@/shared/api/citations';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Textarea } from '@/shared/ui/textarea';
import { Skeleton } from '@/shared/ui/skeleton';
import { Progress } from '@/shared/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

/**
 * Business profiles — the entity half of the citations backend.
 *
 * Eight endpoints (entities, listings, sync, profile health) shipped complete
 * with an API service module and no interface at all; the Citations page only
 * ever ran audits. The profile-health endpoint is the reason this is worth
 * surfacing: it scores an entity across 33 fields and says exactly which are
 * missing, which is the work you do *before* an audit is worth running.
 */

/** Human labels for the field keys profile-health returns. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Business name',
  phone: 'Phone',
  email: 'Email',
  country: 'Country',
  city: 'City',
  address: 'Street address',
  zipcode: 'Postcode',
  state: 'State / region',
  website: 'Website',
  workingHours: 'Opening hours',
  holidays: 'Holiday hours',
  categories: 'Categories',
  description: 'Description',
  yearEstablished: 'Year established',
  services: 'Services',
  associations: 'Associations',
  brands: 'Brands',
  languages: 'Languages',
  keywords: 'Keywords',
  logoUrl: 'Logo',
  logoDescription: 'Logo description',
  photos: 'Photos',
  paymentOptions: 'Payment options',
  featuredMessage: 'Featured message',
  x: 'X / Twitter',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebookPublisher: 'Facebook publisher',
  googleMyBusinessPublisher: 'Google Business publisher',
};

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  city: '',
  state: '',
  zipcode: '',
  country: 'US',
  description: '',
  categories: '',
};

export function BusinessProfilesTab() {
  const [entities, setEntities] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [health, setHealth] = useState<{ completed: number; missingFields: Record<string, boolean> } | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await citationService.getEntities();
      const list = Array.isArray(rows) ? rows : [];
      setEntities(list);
      setSelected((prev: any) =>
        prev ? list.find((e: any) => e.entityId === prev.entityId) || null : list[0] || null
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load business profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = selected?.entityId;
    if (!id) {
      setHealth(null);
      setListings([]);
      return;
    }
    let alive = true;
    setDetailBusy(true);
    Promise.allSettled([
      citationService.getProfileHealth(id),
      citationService.getListings(id),
    ])
      .then(([h, l]) => {
        if (!alive) return;
        setHealth(h.status === 'fulfilled' ? (h.value as any) : null);
        setListings(l.status === 'fulfilled' ? ((l.value as any) || []) : []);
      })
      .finally(() => {
        if (alive) setDetailBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.entityId]);

  const onSave = async () => {
    if (!form.name.trim()) {
      toast.error('Business name is required.');
      return;
    }
    setSaving(true);
    try {
      await citationService.saveEntity({
        ...form,
        // The API takes arrays for these; the form collects one comma list.
        categories: form.categories
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      });
      toast.success('Business profile saved');
      setShowCreate(false);
      setForm(emptyForm);
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onSync = async () => {
    if (!selected?.entityId) return;
    setSyncing(true);
    try {
      await citationService.syncListings(selected.entityId);
      toast.success('Sync started. Listings appear here as publishers respond.');
      const l = await citationService.getListings(selected.entityId);
      setListings(l || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const missing = health
    ? Object.entries(health.missingFields).filter(([, isMissing]) => isMissing)
    : [];
  const present = health
    ? Object.entries(health.missingFields).filter(([, isMissing]) => !isMissing)
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* --- entity list --- */}
      <div className="flex flex-col gap-3">
        <Button onClick={() => setShowCreate(true)} className="self-start">
          <Plus className="size-4" /> New business profile
        </Button>

        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : entities.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No business profiles yet. A profile holds the name, address and phone that
            an audit checks directories against.
          </p>
        ) : (
          entities.map((e) => (
            <button
              key={e.entityId}
              type="button"
              onClick={() => setSelected(e)}
              className={cn(
                'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected?.entityId === e.entityId
                  ? 'border-accent bg-accent-soft/40'
                  : 'border-border hover:border-border-strong'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                {e.businessIdSlug && <Badge variant="outline">#{e.businessIdSlug}</Badge>}
              </span>
              <span className="truncate text-[11px] text-foreground-muted">
                {[e.city, e.state, e.country].filter(Boolean).join(', ') || 'No location set'}
              </span>
            </button>
          ))
        )}
      </div>

      {/* --- detail --- */}
      {!selected ? (
        <EmptyState
          icon={Building2}
          title="No profile selected"
          description="Create a business profile to score how complete its listing data is, and to sync it out to publishers."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <h3 className="text-base font-semibold tracking-tight">{selected.name}</h3>
                  <p className="text-xs text-foreground-muted">
                    {[selected.address, selected.city, selected.state, selected.zipcode]
                      .filter(Boolean)
                      .join(', ') || 'No address on file'}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Sync listings
                </Button>
              </div>

              {detailBusy ? (
                <Skeleton className="h-24" />
              ) : health ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Profile completeness</span>
                    <span className="font-mono tabular-nums">{health.completed}%</span>
                  </div>
                  <Progress value={health.completed} />
                  <p className="text-xs text-foreground-muted">
                    {missing.length} of {missing.length + present.length} fields still empty.
                    Directories match on these, so the more that are filled the more
                    listings an audit can confirm.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {health && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-5">
                <h4 className="text-sm font-semibold">Fields to complete</h4>
                {missing.length === 0 ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-mint-ink">
                    <Check className="size-4" /> Everything is filled in.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {missing.map(([key]) => (
                      <li
                        key={key}
                        className="inline-flex items-center gap-1.5 text-sm text-foreground-muted"
                      >
                        <AlertCircle className="size-3.5 shrink-0 text-butter-ink" />
                        {FIELD_LABELS[key] || key}
                      </li>
                    ))}
                  </ul>
                )}
                {present.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-foreground-muted">
                      {present.length} already complete
                    </summary>
                    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {present.map(([key]) => (
                        <li
                          key={key}
                          className="inline-flex items-center gap-1.5 text-xs text-foreground-subtle"
                        >
                          <Check className="size-3 shrink-0 text-mint-ink" />
                          {FIELD_LABELS[key] || key}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <h4 className="mb-2 text-sm font-semibold">Publisher listings</h4>
              {listings.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No listings recorded yet. “Sync listings” queues this profile out to
                  publishers; results appear here as they come back.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {listings.map((l: any, i: number) => (
                    <li
                      key={l.id ?? i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        {citationService.formatPublisherName?.(l.publisher) || l.publisher || '—'}
                      </span>
                      <Badge variant="outline">{l.status || 'pending'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New business profile</DialogTitle>
            <DialogDescription>
              This is the name, address and phone that directory listings are matched
              against. The more fields you fill, the higher the completeness score.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <F id="e-name" label="Business name">
              <Input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </F>
            <F id="e-phone" label="Phone">
              <Input id="e-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </F>
            <F id="e-web" label="Website">
              <Input id="e-web" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
            </F>
            <F id="e-email" label="Email">
              <Input id="e-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </F>
            <F id="e-addr" label="Street address" className="sm:col-span-2">
              <Input id="e-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </F>
            <F id="e-city" label="City">
              <Input id="e-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </F>
            <F id="e-state" label="State / region">
              <Input id="e-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </F>
            <F id="e-zip" label="Postcode">
              <Input id="e-zip" value={form.zipcode} onChange={(e) => setForm({ ...form, zipcode: e.target.value })} />
            </F>
            <F id="e-country" label="Country">
              <Input id="e-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </F>
            <F id="e-cats" label="Categories (comma separated)" className="sm:col-span-2">
              <Input id="e-cats" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="Dentist, Cosmetic Dentist" />
            </F>
            <F id="e-desc" label="Description" className="sm:col-span-2">
              <Textarea id="e-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({
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
