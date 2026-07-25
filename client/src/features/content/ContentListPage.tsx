import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Trash2,
  Loader2,
  FileText,
  Save,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import contentService from '@/shared/api/content';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';

type Status = 'in_progress' | 'ready' | 'done';
const STATUS_LABEL: Record<Status, string> = {
  in_progress: 'In progress',
  ready: 'Ready',
  done: 'Done',
};
const STATUS_TONE: Record<Status, 'butter' | 'sky' | 'mint'> = {
  in_progress: 'butter',
  ready: 'sky',
  done: 'mint',
};

type ContentItem = {
  id: number | string;
  service?: string;
  topic?: string;
  website?: string;
  author?: string;
  status?: Status;
  content?: string;
  created_at?: string;
};

type Field = {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'url' | 'number';
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  createTitle: string;
  icon?: import('lucide-react').LucideIcon;
  fields: Field[];
  list: (search: string) => Promise<{ items: ContentItem[] }>;
  generate: (form: Record<string, any>) => Promise<any>;
  update: (id: any, body: any) => Promise<any>;
  remove: (id: any) => Promise<any>;
  /** Used for the row title and the modal title. */
  titleAccessor: (item: ContentItem) => string;
  /** Optional second column (Author or Topic). */
  secondColumn?: { label: string; accessor: (item: ContentItem) => React.ReactNode };
};

export function ContentListPage({
  eyebrow,
  title,
  description,
  createTitle,
  icon,
  fields,
  list,
  generate,
  update,
  remove,
  titleAccessor,
  secondColumn,
}: Props) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, '']))
  );
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await list(search);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [list, search]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.required !== false && !(form[f.id] || '').toString().trim()) {
        toast.error(`${f.label} is required.`);
        return;
      }
    }
    const titleKey = fields.find((f) => f.id === 'service' || f.id === 'topic')?.id;
    const itemName = titleKey ? form[titleKey] : 'content';
    setShowCreate(false);
    setForm(Object.fromEntries(fields.map((f) => [f.id, ''])));
    const toastId = toast.loading(`Writing for "${itemName}"…`);
    try {
      await generate(form);
      toast.success('Generated successfully', { id: toastId });
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Generation failed', { id: toastId });
    }
  };

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await update(selected.id, { content: editContent });
      toast.success('Saved');
      setItems((prev) =>
        prev.map((i) => (i.id === selected.id ? { ...i, content: editContent } : i))
      );
      setSelected((prev) => (prev ? { ...prev, content: editContent } : null));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onMarkDone = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await update(selected.id, { status: 'done', content: editContent });
      toast.success('Marked as done');
      setItems((prev) =>
        prev.map((i) =>
          i.id === selected.id ? { ...i, status: 'done', content: editContent } : i
        )
      );
      setSelected(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: any) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    try {
      await remove(id);
      toast.success('Deleted');
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  return (
    <ToolPage
      eyebrow={eyebrow}
      icon={icon}
      title={title}
      description={description}
      actions={
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Create
        </Button>
      }
    >
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by topic, website, or content…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={`No ${title.toLowerCase()} yet`}
          description={`Create your first one to get started.`}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> Create now
            </Button>
          }
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Content</TableHead>
                {secondColumn && <TableHead>{secondColumn.label}</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const status = (item.status || 'ready') as Status;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{titleAccessor(item)}</span>
                        <span className="text-xs text-foreground-subtle truncate max-w-[280px]">
                          {item.website}
                        </span>
                      </div>
                    </TableCell>
                    {secondColumn && (
                      <TableCell className="text-sm text-foreground-muted">
                        {secondColumn.accessor(item)}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-foreground-muted">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setSelected(item);
                            setEditContent(item.content || '');
                          }}
                          title="View / edit"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-3.5 text-rose-ink" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createTitle}</DialogTitle>
            <DialogDescription>
              Generation runs in the background. You can leave this page; the toast tracks it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            {fields.map((f) => (
              <div key={f.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`c-${f.id}`} className="flex items-center gap-1.5">
                  {f.id === 'website' && <Globe className="size-3.5 text-foreground-subtle" />}
                  {f.label}
                </Label>
                <Input
                  id={`c-${f.id}`}
                  type={f.type || 'text'}
                  value={form[f.id]}
                  onChange={(e) => setForm((s) => ({ ...s, [f.id]: e.target.value }))}
                  placeholder={f.placeholder}
                  required={f.required !== false}
                />
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Plus className="size-4" /> Generate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View / edit modal */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{titleAccessor(selected)}</DialogTitle>
                <DialogDescription>
                  {selected.website}
                  {selected.author && ` · by ${selected.author}`}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={18}
                disabled={saving}
                className="font-mono text-sm"
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelected(null)}
                  disabled={saving}
                >
                  Close
                </Button>
                <Button onClick={onSave} disabled={saving} variant="secondary">
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save
                </Button>
                {selected.status !== 'done' && (
                  <Button onClick={onMarkDone} disabled={saving}>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Mark as done
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}
