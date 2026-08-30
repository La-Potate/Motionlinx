import { useMemo, useState } from 'react';
import { Globe, Network, Loader2, ChevronDown, ChevronRight, Download, RefreshCw, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import authenticatedFetch from '@/shared/api/httpClient';
import spiderService from '@/shared/api/spider';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

type Node = {
  id: string;
  label: string;
  url: string;
  depth: number;
  children: Node[];
};

function buildTree(urls: string[]): Node {
  const root: Node = { id: 'root', label: 'Home', url: '', depth: 0, children: [] };
  const lookup = new Map<string, Node>();
  urls.forEach((raw) => {
    try {
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length === 0) {
        root.url = `${u.origin}/`;
        return;
      }
      let cursor = root;
      let path = '';
      parts.forEach((part, idx) => {
        path += `/${part}`;
        const id = path;
        let next = cursor.children.find((c) => c.id === id);
        if (!next) {
          next = { id, label: part, url: '', depth: idx + 1, children: [] };
          cursor.children.push(next);
          lookup.set(id, next);
        }
        if (idx === parts.length - 1) {
          next.url = `${u.origin}${path}`;
        }
        cursor = next;
      });
    } catch {
      // skip
    }
  });
  const sort = (n: Node) => {
    n.children.sort((a, b) => a.label.localeCompare(b.label));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export default function SiteTreePage() {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']));
  /** Which route produced the current tree, shown alongside the count. */
  const [source, setSource] = useState<'sitemap' | 'crawl' | null>(null);
  /** Set when the sitemap route found nothing, so we can offer the crawler
   *  instead of leaving the user on a dead end. */
  const [canCrawl, setCanCrawl] = useState(false);

  const tree = useMemo(() => buildTree(urls), [urls]);
  const total = urls.length;

  const onAnalyze = async () => {
    if (!target.trim()) {
      toast.error('Enter a domain or full URL.');
      return;
    }
    setBusy(true);
    setExpanded(new Set(['root']));
    setCanCrawl(false);
    try {
      const res = await authenticatedFetch('/api/web-search/site-tree/sitemap', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch sitemap');
      const found: string[] = data.urls || [];
      setUrls(found);
      setSource(found.length ? 'sitemap' : null);
      if (!found.length) {
        // Plenty of sites publish no sitemap. Offer the crawler rather than
        // ending on "nothing found" — it is a separate, slower operation, so
        // it stays opt-in instead of running automatically.
        setCanCrawl(true);
        toast.info?.('No sitemap found — you can crawl the site instead.');
      }
    } catch (err: any) {
      setUrls([]);
      setSource(null);
      setCanCrawl(true);
      toast.error(err?.message || 'Failed to fetch sitemap');
    } finally {
      setBusy(false);
    }
  };

  /** Fallback discovery: follow internal links instead of reading a sitemap. */
  const onCrawl = async () => {
    if (!target.trim()) {
      toast.error('Enter a domain or full URL.');
      return;
    }
    setBusy(true);
    setCanCrawl(false);
    setExpanded(new Set(['root']));
    try {
      const data: any = await spiderService.crawl(target.trim(), { crawlLimit: 200 });
      const found: string[] = (data?.nodes || [])
        .map((n: any) => n?.url)
        .filter((u: any): u is string => typeof u === 'string' && u.length > 0);
      setUrls(found);
      setSource(found.length ? 'crawl' : null);
      if (!found.length) toast.info?.('Crawl finished without finding linked pages.');
      else toast.success(`Crawled ${found.length} page${found.length === 1 ? '' : 's'}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Crawl failed');
      setCanCrawl(true);
    } finally {
      setBusy(false);
    }
  };

  const expandAll = () => {
    const all = new Set<string>(['root']);
    const walk = (n: Node) => {
      all.add(n.id);
      n.children.forEach(walk);
    };
    walk(tree);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set(['root']));

  const exportHtml = () => {
    const buildHtml = (n: Node): string => {
      const label = n.url ? `<a href="${n.url}" target="_blank">${n.label}</a>` : n.label;
      const kids = n.children.map(buildHtml).join('');
      return `<li>${label}${kids ? `<ul>${kids}</ul>` : ''}</li>`;
    };
    const html = `<!doctype html><meta charset="utf-8"><title>Site tree</title><ul>${buildHtml(tree)}</ul>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-tree.html';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={GitBranch}
      title="Site tree generator"
      description="Pull a domain's sitemap and render a structured, navigable tree."
      actions={
        urls.length > 0 ? (
          <>
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse all
            </Button>
            <Button size="sm" onClick={exportHtml}>
              <Download className="size-3.5" /> Export HTML
            </Button>
          </>
        ) : null
      }
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="st-domain">Domain or URL</Label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
                <Input
                  id="st-domain"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="example.com or https://example.com/sitemap.xml"
                  className="pl-8"
                />
              </div>
            </div>
            <Button size="lg" onClick={onAnalyze} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Fetching…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" /> Analyze
                </>
              )}
            </Button>
          </div>

          {canCrawl && !busy && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  No sitemap to read
                </span>
                <span className="text-xs text-foreground-muted">
                  Crawl the site instead — follows internal links, up to 200 pages.
                  Slower than a sitemap, but works on sites that do not publish one.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onCrawl} className="shrink-0">
                <Network className="size-3.5" /> Crawl instead
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {urls.length === 0 && !busy ? (
        <EmptyState
          icon={Globe}
          title="No tree yet"
          description="Enter a domain and we'll read its sitemap. If it has none, you can crawl the site instead."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Discovered URLs</span>
                <Badge variant="outline">{total.toLocaleString()}</Badge>
                {source && (
                  <Badge variant={source === 'sitemap' ? 'sky' : 'lavender'}>
                    via {source}
                  </Badge>
                )}
              </div>
            </div>
            <ScrollArea className="h-[600px]">
              <div className="p-3">
                <TreeNode
                  node={tree}
                  expanded={expanded}
                  onToggle={(id) =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </ToolPage>
  );
}

function TreeNode({
  node,
  expanded,
  onToggle,
}: {
  node: Node;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasKids = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 rounded-md hover:bg-surface-muted/60 px-2 py-1 transition-colors group">
        {hasKids ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="flex size-5 items-center justify-center rounded text-foreground-subtle hover:text-foreground transition-colors"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 inline-block" />
        )}
        {node.url ? (
          <a
            href={node.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'text-sm font-mono truncate hover:text-accent transition-colors',
              node.depth === 0 && 'font-semibold text-foreground'
            )}
            title={node.url}
          >
            /{node.label === 'Home' ? '' : node.label}
          </a>
        ) : (
          <span className="text-sm font-mono text-foreground">
            /{node.label === 'Home' ? '' : node.label}
          </span>
        )}
        {hasKids && (
          <Badge variant="outline" className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {node.children.length}
          </Badge>
        )}
      </div>
      <AnimatePresence>
        {isOpen && hasKids && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pl-4 border-l border-border ml-2.5"
          >
            {node.children.map((c) => (
              <TreeNode key={c.id} node={c} expanded={expanded} onToggle={onToggle} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
