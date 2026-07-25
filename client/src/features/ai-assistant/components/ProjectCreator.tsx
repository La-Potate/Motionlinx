import { useEffect, useState } from 'react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Checkbox } from '@/shared/ui/checkbox';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { toast } from '@/shared/ui/sonner';
import { gscService, type GscProperty } from '@/shared/api/gsc';
import { aiAssistantService } from '@/shared/api/aiAssistant';

type Props = {
  onCreated: (projectId: number) => void;
};

export function ProjectCreator({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [properties, setProperties] = useState<GscProperty[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await gscService.sites();
        if (cancelled) return;
        setProperties(data.properties);
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load GSC properties.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (siteUrl: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(siteUrl)) next.delete(siteUrl);
      else next.add(siteUrl);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim() || selected.size === 0) {
      toast.error('Pick a name and at least one property.');
      return;
    }
    setSubmitting(true);
    try {
      const { project } = await aiAssistantService.createProject({
        name: name.trim(),
        siteUrls: Array.from(selected),
      });
      toast.success('Project created');
      onCreated(project.id);
    } catch (err: any) {
      if (err?.code === 'name_exists') {
        toast.error('A project with that name already exists.');
      } else {
        toast.error(err?.message || 'Failed to create project');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6 flex flex-col gap-5 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">Create your first SEO project</h3>
        <p className="text-sm text-foreground-muted">
          Pick the Search Console properties you want this project to cover. You can map
          more than one (e.g. a domain property and a URL-prefix property).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          placeholder="Acme SEO"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Search Console properties</Label>
        {loading ? (
          <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center text-sm text-foreground-subtle">
            Loading properties…
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose bg-rose/30 p-3 text-sm text-rose-ink">{error}</div>
        ) : properties.length === 0 ? (
          <div className="rounded-md border border-butter bg-butter/30 p-3 text-sm text-butter-ink">
            No verified GSC properties found for this Google account.
          </div>
        ) : (
          <ScrollArea className="rounded-md border border-border max-h-72">
            <ul className="divide-y divide-border">
              {properties.map((p) => (
                <li key={p.siteUrl}>
                  <label className="flex items-start gap-3 p-3 hover:bg-surface-muted/40 cursor-pointer">
                    <Checkbox
                      checked={selected.has(p.siteUrl)}
                      onCheckedChange={() => toggle(p.siteUrl)}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-mono text-foreground truncate">{p.siteUrl}</span>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                        {p.permissionLevel}
                      </span>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      <div>
        <Button onClick={submit} disabled={submitting || !name.trim() || selected.size === 0}>
          {submitting ? 'Creating…' : `Create project (${selected.size} propert${selected.size === 1 ? 'y' : 'ies'})`}
        </Button>
      </div>
    </Card>
  );
}
