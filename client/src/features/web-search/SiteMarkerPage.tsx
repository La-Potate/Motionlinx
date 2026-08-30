import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Link2,
  MapPin,
  ExternalLink,
  Globe,
  Copy,
  Check,
  Share2,
  Shield,
  Loader2,
} from 'lucide-react';
import siteMarkerService from '@/shared/api/siteMarker';
import { SiteMarkerAnnotator } from './components/SiteMarkerAnnotator';
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
import { cn } from '@/shared/lib/cn';

export default function SiteMarkerPage() {
  const [pages, setPages] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ url: '', title: '' });
  const [copied, setCopied] = useState(false);
  // The stored capture and its markers, fetched when a page is selected.
  // Previously this page framed the LIVE url, so what you looked at was not
  // the thing that had been captured — and markers had nothing to attach to.
  const [capture, setCapture] = useState<{ html: string; markers: any[] } | null>(null);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [savingMarkers, setSavingMarkers] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data: any = await siteMarkerService.listPages();
      setPages(Array.isArray(data?.pages) ? data.pages : data || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Load the capture whenever the selection changes.
  useEffect(() => {
    const id = selected?.id;
    if (!id) {
      setCapture(null);
      return;
    }
    let alive = true;
    setLoadingCapture(true);
    setCapture(null);
    siteMarkerService
      .getPage(id)
      .then((data: any) => {
        if (!alive) return;
        setCapture({
          html: data?.html || '',
          markers: Array.isArray(data?.page?.markers) ? data.page.markers : [],
        });
      })
      .catch((err: any) => {
        if (alive) toast.error(err?.message || 'Failed to load the captured page');
      })
      .finally(() => {
        if (alive) setLoadingCapture(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.id]);

  const onSaveMarkers = async (markers: any[]) => {
    if (!selected?.id) return;
    setSavingMarkers(true);
    try {
      const data: any = await siteMarkerService.saveMarkers(selected.id, markers);
      setCapture((prev) => (prev ? { ...prev, markers } : prev));
      // Keep the list's marker count in step with what was just saved.
      if (data?.page) {
        setPages((prev) =>
          prev.map((p) => (p.id === selected.id ? { ...p, ...data.page } : p))
        );
        setSelected((prev: any) => (prev ? { ...prev, ...data.page } : prev));
      }
      toast.success('Markers saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save markers');
    } finally {
      setSavingMarkers(false);
    }
  };

  const onCreate = async () => {
    if (!form.url.trim()) {
      toast.error('URL is required.');
      return;
    }
    setCreating(true);
    try {
      const data: any = await siteMarkerService.createPage(form);
      toast.success('Page captured');
      setShowCreate(false);
      setForm({ url: '', title: '' });
      refresh();
      if (data?.page) setSelected(data.page);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to capture');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('Delete this page and all markers?')) return;
    try {
      await siteMarkerService.deletePage(id);
      toast.success('Deleted');
      if (selected?.id === id) setSelected(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const onShare = async () => {
    if (!selected) return;
    try {
      const data: any = await siteMarkerService.generateShareLink(selected.id);
      const updated = { ...selected, shareToken: data.shareToken };
      setSelected(updated);
      setPages((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      toast.success('Share link generated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate share link');
    }
  };

  const onRevoke = async () => {
    if (!selected) return;
    try {
      await siteMarkerService.revokeShareLink(selected.id);
      const updated = { ...selected, shareToken: null };
      setSelected(updated);
      setPages((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      toast.success('Share link revoked');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke');
    }
  };

  const shareUrl = selected?.shareToken
    ? `${window.location.origin}/shared/site-marker/${selected.shareToken}`
    : '';

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={MapPin}
      title="Site Marker"
      description="Capture any URL and annotate it with structured comments. Share the result via secure token link."
      actions={
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Capture page
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : pages.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No pages yet"
              description="Capture a URL to start annotating."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" /> Capture
                </Button>
              }
            />
          ) : (
            pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={cn(
                  'text-left rounded-md border border-border bg-surface p-3 transition-colors hover:border-border-strong',
                  selected?.id === p.id && 'border-accent shadow-elevation-sm'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{p.title || 'Untitled'}</div>
                  {p.shareToken && (
                    <Badge variant="accent">
                      <Share2 className="size-3" /> Shared
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-foreground-subtle truncate mt-1">{p.url}</div>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-col gap-4">
          {!selected ? (
            <EmptyState
              icon={Link2}
              title="No page selected"
              description="Choose a captured page from the list to manage markers and share access."
            />
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold tracking-tight truncate">
                        {selected.title || 'Untitled page'}
                      </h2>
                      <a
                        href={selected.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {selected.url} <ExternalLink className="size-3" />
                      </a>
                    </div>
                    <div className="flex gap-2">
                      {selected.shareToken ? (
                        <Button variant="outline" onClick={onRevoke}>
                          <Shield className="size-4" /> Revoke share
                        </Button>
                      ) : (
                        <Button onClick={onShare}>
                          <Share2 className="size-4" /> Share
                        </Button>
                      )}
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

              {shareUrl && (
                <Card>
                  <CardContent className="p-4 flex items-center gap-2">
                    <Globe className="size-4 text-foreground-subtle shrink-0" />
                    <Input value={shareUrl} readOnly className="font-mono text-xs" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setCopied(true);
                        toast.success('Copied');
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  {loadingCapture ? (
                    <Skeleton className="h-[520px] w-full" />
                  ) : capture ? (
                    <SiteMarkerAnnotator
                      html={capture.html}
                      markers={capture.markers}
                      saving={savingMarkers}
                      onSave={onSaveMarkers}
                    />
                  ) : (
                    <p className="text-sm text-foreground-muted">
                      This capture has no stored page content.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture a page</DialogTitle>
            <DialogDescription>
              We snapshot the URL so you can leave annotations and share them via token.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sm-url">URL</Label>
              <Input
                id="sm-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/page"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sm-title">Title (optional)</Label>
              <Input
                id="sm-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Homepage tour"
              />
            </div>
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
              Capture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}
