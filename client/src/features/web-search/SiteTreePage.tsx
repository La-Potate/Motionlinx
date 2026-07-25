import { useMemo, useState } from 'react';
import { Globe, Loader2, ChevronDown, ChevronRight, Download, RefreshCw, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import authenticatedFetch from '@/shared/api/httpClient';
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

  const tree = useMemo(() => buildTree(urls), [urls]);
  const total = urls.length;

  const onAnalyze = async () => {
    if (!target.trim()) {
      toast.error('Enter a domain or full URL.');
      return;
    }
    setBusy(true);
    setExpanded(new Set(['root']));
    try {
      const res = await authenticatedFetch('/api/web-search/site-tree/sitemap', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch sitemap');
      setUrls(data.urls || []);
      if ((data.urls || []).length === 0) toast.info?.('No URLs found.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch sitemap');
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
        </CardContent>
      </Card>

      {urls.length === 0 && !busy ? (
        <EmptyState
          icon={Globe}
          title="No tree yet"
          description="Enter a domain and we'll fetch its sitemap and assemble a structured tree."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Discovered URLs</span>
                <Badge variant="outline">{total.toLocaleString()}</Badge>
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
