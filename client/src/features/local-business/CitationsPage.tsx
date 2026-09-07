import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  ExternalLink,
  Globe,
  Phone,
  MapPin,
  Search,
  FileText,
} from 'lucide-react';
import authenticatedFetch from '@/shared/api/httpClient';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { BusinessProfilesTab } from './components/BusinessProfilesTab';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

const STATUS_VARIANT: Record<string, 'mint' | 'sky' | 'butter' | 'rose' | 'default'> = {
  done: 'mint',
  completed: 'mint',
  running: 'sky',
  pending: 'butter',
  failed: 'rose',
  error: 'rose',
};

export default function CitationsPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [form, setForm] = useState({
    businessName: '',
    businessWebsite: '',
    businessAddress: '',
    businessPhone: '',
    businessCity: '',
    businessState: '',
    businessZipcode: '',
    country: 'US',
  });

  const loadAudits = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/citation-audit/list');
      const data = await res.json();
      if (res.ok) setAudits(data.audits || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (id: number) => {
    try {
      const res = await authenticatedFetch(`/api/citation-audit/${id}`);
      const data = await res.json();
      if (res.ok) {
        setSelected(data.audit);
        setResults(data.results || []);
        setAudits((prev) => prev.map((a) => (a.id === id ? data.audit : a)));
      }
    } catch (err) {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selected?.status === 'running') {
      pollRef.current = setInterval(() => loadDetails(selected.id), 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selected?.id, selected?.status, loadDetails]);

  const onCreate = async () => {
    if (!form.businessName.trim()) {
      toast.error('Business name is required.');
      return;
    }
    setCreating(true);
    try {
      const res = await authenticatedFetch('/api/citation-audit/create', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Audit created');
        setShowCreate(false);
        setForm({
          businessName: '',
          businessWebsite: '',
          businessAddress: '',
          businessPhone: '',
          businessCity: '',
          businessState: '',
          businessZipcode: '',
          country: 'US',
        });
        await loadAudits();
        if (data.auditId) await loadDetails(data.auditId);
      } else toast.error(data.error || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const onStart = async (id: number) => {
    try {
      const res = await authenticatedFetch(`/api/citation-audit/${id}/start`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Audit running');
        loadDetails(id);
      } else toast.error(data.error || 'Failed to start');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start');
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('Delete this audit?')) return;
    try {
      const res = await authenticatedFetch(`/api/citation-audit/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Deleted');
        setAudits((prev) => prev.filter((a) => a.id !== id));
        if (selected?.id === id) {
          setSelected(null);
          setResults([]);
        }
      } else toast.error('Failed to delete');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const filtered = audits.filter((a) =>
    [a.businessName, a.businessWebsite, a.businessCity]
      .filter(Boolean)
      .some((f: string) => f.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={FileText}
      title="Business citations"
      description="Keep business details consistent, then audit them across 52 US or 38 UK directories."
    >
      <Tabs defaultValue="audits">
        <TabsList>
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="profiles">Business profiles</TabsTrigger>
        </TabsList>

        <TabsContent value="audits" className="flex flex-col gap-4">
          <Button onClick={() => setShowCreate(true)} className="self-start">
            <Plus className="size-4" /> New audit
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4">
        {/* Audit list */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audits"
              className="pl-8 h-9"
            />
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No audits yet"
              description="Create the first audit to begin scanning publishers."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" /> New audit
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => loadDetails(a.id)}
                  className={cn(
                    'text-left rounded-md border border-border bg-surface p-3 transition-colors hover:border-border-strong',
                    selected?.id === a.id && 'border-accent shadow-elevation-sm'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {a.businessName}
                      </div>
                      <div className="text-xs text-foreground-subtle truncate">
                        {a.businessWebsite || a.businessCity || '—'}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[a.status] || 'default'}>
                      {a.status}
                    </Badge>
                  </div>
                  {typeof a.completedCount === 'number' && a.totalCount > 0 && (
                    <Progress
                      value={(a.completedCount / a.totalCount) * 100}
                      className="mt-2"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audit detail */}
        <div className="flex flex-col gap-4">
          {!selected ? (
            <EmptyState
              icon={Building2}
              title="No audit selected"
              description="Pick an audit from the list to see results."
            />
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex flex-col gap-1.5">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {selected.businessName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
                        {selected.businessWebsite && (
                          <span className="inline-flex items-center gap-1">
                            <Globe className="size-3" />
                            {selected.businessWebsite}
                          </span>
                        )}
                        {selected.businessPhone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {selected.businessPhone}
                          </span>
                        )}
                        {(selected.businessCity || selected.businessState) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {[selected.businessCity, selected.businessState]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selected.status !== 'running' && (
                        <Button onClick={() => onStart(selected.id)}>
                          <Play className="size-4" />
                          {selected.status === 'done' ? 'Re-run' : 'Start'}
                        </Button>
                      )}
                      {selected.status === 'running' && (
                        <Button variant="outline" disabled>
                          <Loader2 className="size-4 animate-spin" /> Running
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => loadDetails(selected.id)}
                        aria-label="Refresh"
                      >
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(selected.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4 text-rose-ink" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Publisher</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="text-right">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-foreground-subtle py-8"
                        >
                          {selected.status === 'running'
                            ? 'Scanning…'
                            : 'No results yet.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium text-sm">
                            {r.publisherName || r.publisher_name || r.publisher}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-sm text-foreground-muted">
                            {r.matched ? (
                              <Badge variant="mint">
                                <CheckCircle2 className="size-3" /> Matched
                              </Badge>
                            ) : r.status === 'completed' || r.status === 'done' ? (
                              <Badge variant="rose">
                                <XCircle className="size-3" /> Missing
                              </Badge>
                            ) : (
                              <span className="text-foreground-subtle">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-accent hover:underline text-sm"
                              >
                                Open <ExternalLink className="size-3" />
                              </a>
                            ) : (
                              <span className="text-foreground-subtle text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
          </div>
          </div>
        </TabsContent>

        <TabsContent value="profiles">
          {/* Entity management + profile-health scoring. Eight endpoints that
              shipped with a service module and no interface. */}
          <BusinessProfilesTab />
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New citation audit</DialogTitle>
            <DialogDescription>
              We'll scan citation publishers for matches against this business.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldRow id="bn" label="Business name *">
              <Input
                id="bn"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </FieldRow>
            <FieldRow id="bw" label="Website">
              <Input
                id="bw"
                value={form.businessWebsite}
                onChange={(e) =>
                  setForm({ ...form, businessWebsite: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="ba" label="Address">
              <Input
                id="ba"
                value={form.businessAddress}
                onChange={(e) =>
                  setForm({ ...form, businessAddress: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="bp" label="Phone">
              <Input
                id="bp"
                value={form.businessPhone}
                onChange={(e) =>
                  setForm({ ...form, businessPhone: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="bc" label="City">
              <Input
                id="bc"
                value={form.businessCity}
                onChange={(e) =>
                  setForm({ ...form, businessCity: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="bs" label="State">
              <Input
                id="bs"
                value={form.businessState}
                onChange={(e) =>
                  setForm({ ...form, businessState: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="bz" label="Zip">
              <Input
                id="bz"
                value={form.businessZipcode}
                onChange={(e) =>
                  setForm({ ...form, businessZipcode: e.target.value })
                }
              />
            </FieldRow>
            <FieldRow id="bcountry" label="Country">
              <Select
                value={form.country}
                onValueChange={(v) => setForm({ ...form, country: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="UK">United Kingdom</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={creating}>
              {creating ? (
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed' || status === 'done') {
    return (
      <Badge variant="mint">
        <CheckCircle2 className="size-3" /> {status}
      </Badge>
    );
  }
  if (status === 'running' || status === 'pending') {
    return (
      <Badge variant="sky">
        <Clock className="size-3" /> {status}
      </Badge>
    );
  }
  if (status === 'failed' || status === 'error') {
    return (
      <Badge variant="rose">
        <AlertCircle className="size-3" /> {status}
      </Badge>
    );
  }
  return <Badge variant="default">{status}</Badge>;
}

function FieldRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
