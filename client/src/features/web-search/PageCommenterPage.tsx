import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Loader2,
  Download,
  Globe,
  ExternalLink,
} from 'lucide-react';
import pageCommenterService from '@/shared/api/pageCommenter';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageAnnotator, type Annotation } from '@/shared/components/PageAnnotator';
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

export default function PageCommenterPage() {
  const [pages, setPages] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<{ html: string; comments: Annotation[] } | null>(null);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ url: '', title: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await pageCommenterService.listPages();
      setPages(Array.isArray(data?.pages) ? data.pages : []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load the stored capture whenever the selection changes.
  useEffect(() => {
    const id = selected?.id;
    if (!id) {
      setCapture(null);
      return;
    }
    let alive = true;
    setLoadingCapture(true);
    setCapture(null);
    pageCommenterService
      .getPage(id)
      .then((data: any) => {
        if (!alive) return;
        setCapture({
          html: data?.html || '',
          comments: Array.isArray(data?.page?.comments) ? data.page.comments : [],
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

  const onCreate = async () => {
    if (!form.url.trim()) {
      toast.error('URL is required.');
      return;
    }
    setCreating(true);
    try {
      const data: any = await pageCommenterService.createPage({
        url: form.url.trim(),
        title: form.title.trim(),
      });
      toast.success('Page captured');
      setShowCreate(false);
      setForm({ url: '', title: '' });
      await refresh();
      if (data?.page) setSelected(data.page);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to capture page');
    } finally {
      setCreating(false);
    }
  };

  const onSaveComments = async (comments: Annotation[]) => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const data: any = await pageCommenterService.saveComments(selected.id, comments);
      setCapture((prev) => (prev ? { ...prev, comments } : prev));
      if (data?.page) {
        setPages((prev) => prev.map((p) => (p.id === selected.id ? { ...p, ...data.page } : p)));
        setSelected((prev: any) => (prev ? { ...prev, ...data.page } : prev));
      }
      toast.success('Comments saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save comments');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this page and all its comments?')) return;
    try {
      await pageCommenterService.deletePage(id);
      if (selected?.id === id) setSelected(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  const onDownload = async () => {
    if (!selected?.id) return;
    try {
      await pageCommenterService.downloadPage(
        selected.id,
        `${(selected.title || 'page').replace(/[^\w.-]+/g, '-')}.html`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Download failed');
    }
  };

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={MessageSquare}
      title="Page Commenter"
      description="Capture a page and leave positioned comments on it, then hand the whole thing over as a single annotated file."
      actions={
        <>
          {selected && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="size-3.5" /> Download annotated
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-3.5" /> Capture page
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-1.5 p-3">
            {loading ? (
              <>
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </>
            ) : pages.length === 0 ? (
              <p className="px-2 py-3 text-xs text-foreground-muted">
                No pages captured yet.
              </p>
            ) : (
              pages.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    'group flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors',
                    selected?.id === p.id
                      ? 'border-accent bg-accent-soft/40'
                      : 'border-border hover:border-border-strong'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {p.title || 'Untitled page'}
                    </span>
                    <span className="truncate text-[11px] text-foreground-muted">{p.url}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline">{p.commentCount ?? 0}</Badge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onDelete(p.id)}
                      aria-label="Delete page"
                    >
                      <Trash2 className="size-3.5 text-rose-ink" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {!selected ? (
          <EmptyState
            icon={MessageSquare}
            title="No page selected"
            description="Capture a page, then click anywhere on it to leave a comment. The download bakes the comments into the HTML, so a reviewer needs no account to read them."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {selected.title || 'Untitled page'}
                  </span>
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate text-xs text-accent hover:underline"
                  >
                    <Globe className="size-3" />
                    {selected.url}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                {loadingCapture ? (
                  <Skeleton className="h-[520px] w-full" />
                ) : capture ? (
                  <PageAnnotator
                    html={capture.html}
                    annotations={capture.comments}
                    saving={saving}
                    onSave={onSaveComments}
                    noun="comment"
                  />
                ) : (
                  <p className="text-sm text-foreground-muted">
                    This capture has no stored page content.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture a page</DialogTitle>
            <DialogDescription>
              The page is fetched and frozen with its styles inlined, so comments stay
              anchored even if the live site changes later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-url">URL</Label>
              <Input
                id="pc-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/pricing"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-title">Title (optional)</Label>
              <Input
                id="pc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Pricing page review"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Capturing…
                </>
              ) : (
                <>
                  <Plus className="size-4" /> Capture
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}
