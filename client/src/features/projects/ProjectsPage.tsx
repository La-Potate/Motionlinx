import { useCallback, useEffect, useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Loader2,
  Check,
  Pencil,
} from 'lucide-react';
import projectService from '@/shared/api/projects';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

type Project = { id: number; name: string; notes?: string };
type Group = { id: number; name: string; color?: string };
type Task = {
  id: number;
  title: string;
  assignee?: string;
  status?: string;
  date?: string;
  completed?: number | boolean;
};

/**
 * Projects board — the last of the backends that shipped without a UI.
 *
 * Three levels: projects contain groups, groups contain tasks, all twelve
 * endpoints already working and previously unreachable.
 *
 * Note this deliberately calls loadProjects/loadGroups/loadTasks rather than
 * the service's loadCompleteProjectData(): that helper CREATES placeholder
 * records ("Project 1", "Task 1"…) server-side when a user has none, gated on
 * a localStorage flag. A read that silently writes is not what an empty
 * workspace should do, so this renders a real empty state instead.
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Record<number, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newProject, setNewProject] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newTask, setNewTask] = useState<Record<number, string>>({});

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const rows: Project[] = await projectService.loadProjects();
      setProjects(rows);
      setSelected((prev) => (prev ? rows.find((r) => r.id === prev.id) || null : rows[0] || null));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadBoard = useCallback(async (projectId: number) => {
    try {
      const gs: Group[] = await projectService.loadGroups(projectId);
      setGroups(gs);
      // Tasks hang off groups, so they can only be fetched once groups are known.
      const entries = await Promise.all(
        gs.map(async (g) => [g.id, await projectService.loadTasks(g.id)] as const)
      );
      setTasks(Object.fromEntries(entries));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load board');
    }
  }, []);

  useEffect(() => {
    if (selected?.id) loadBoard(selected.id);
    else {
      setGroups([]);
      setTasks({});
    }
  }, [selected?.id, loadBoard]);

  const addProject = async () => {
    if (!newProject.trim()) return;
    setBusy(true);
    try {
      await projectService.createProject(newProject.trim());
      setNewProject('');
      await loadProjects();
      toast.success('Project created');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create project');
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (p: Project) => {
    const name = window.prompt('Rename project', p.name);
    if (!name || name === p.name) return;
    try {
      await projectService.updateProject(p.id, name, p.notes || '');
      await loadProjects();
    } catch (err: any) {
      toast.error(err?.message || 'Rename failed');
    }
  };

  const removeProject = async (p: Project) => {
    if (!window.confirm(`Delete “${p.name}” and everything in it?`)) return;
    try {
      await projectService.deleteProject(p.id);
      if (selected?.id === p.id) setSelected(null);
      await loadProjects();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  const addGroup = async () => {
    if (!selected || !newGroup.trim()) return;
    setBusy(true);
    try {
      await projectService.createGroup(selected.id, newGroup.trim());
      setNewGroup('');
      await loadBoard(selected.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add group');
    } finally {
      setBusy(false);
    }
  };

  const addTask = async (groupId: number) => {
    const title = (newTask[groupId] || '').trim();
    if (!title) return;
    try {
      await projectService.createTask(groupId, title);
      setNewTask((p) => ({ ...p, [groupId]: '' }));
      const rows = await projectService.loadTasks(groupId);
      setTasks((p) => ({ ...p, [groupId]: rows }));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add task');
    }
  };

  const toggleTask = async (groupId: number, t: Task) => {
    const completed = t.completed ? 0 : 1;
    // Optimistic: the board should feel immediate, and a failure re-syncs below.
    setTasks((p) => ({
      ...p,
      [groupId]: (p[groupId] || []).map((x) => (x.id === t.id ? { ...x, completed } : x)),
    }));
    try {
      await projectService.updateTask(t.id, { completed });
    } catch (err: any) {
      toast.error(err?.message || 'Could not update task');
      const rows = await projectService.loadTasks(groupId);
      setTasks((p) => ({ ...p, [groupId]: rows }));
    }
  };

  const removeTask = async (groupId: number, t: Task) => {
    try {
      await projectService.deleteTask(t.id);
      const rows = await projectService.loadTasks(groupId);
      setTasks((p) => ({ ...p, [groupId]: rows }));
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  return (
    <ToolPage
      eyebrow="Workspace"
      icon={FolderKanban}
      title="Projects"
      description="Group work into projects and columns, and track the tasks inside them."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* --- projects --- */}
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <Input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addProject()}
                placeholder="New project"
              />
              <Button size="icon" onClick={addProject} disabled={busy || !newProject.trim()} aria-label="Add project">
                <Plus className="size-4" />
              </Button>
            </div>

            {loading ? (
              <>
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </>
            ) : projects.length === 0 ? (
              <p className="text-xs text-foreground-muted">
                No projects yet. Create one above.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-lg border px-2.5 py-2 transition-colors',
                      selected?.id === p.id
                        ? 'border-accent bg-accent-soft/40'
                        : 'border-border hover:border-border-strong'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {p.name}
                    </button>
                    <Button size="icon-sm" variant="ghost" onClick={() => renameProject(p)} aria-label="Rename">
                      <Pencil className="size-3" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => removeProject(p)} aria-label="Delete">
                      <Trash2 className="size-3 text-rose-ink" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- board --- */}
        {!selected ? (
          <EmptyState
            icon={FolderKanban}
            title="No project selected"
            description="Create a project, add a few columns to it, then fill them with tasks."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGroup()}
                placeholder="New column, e.g. In progress"
                className="max-w-xs"
              />
              <Button variant="outline" onClick={addGroup} disabled={busy || !newGroup.trim()}>
                <Plus className="size-4" /> Add column
              </Button>
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                No columns yet. Add one to start placing tasks.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => {
                  const rows = tasks[g.id] || [];
                  const done = rows.filter((t) => t.completed).length;
                  return (
                    <Card key={g.id} className="flex flex-col">
                      <CardContent className="flex flex-col gap-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              aria-hidden
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: g.color || 'var(--accent)' }}
                            />
                            <span className="truncate text-sm font-semibold">{g.name}</span>
                          </span>
                          <Badge variant="outline">
                            {done}/{rows.length}
                          </Badge>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          {rows.length === 0 ? (
                            <p className="text-xs text-foreground-subtle">No tasks yet.</p>
                          ) : (
                            rows.map((t) => (
                              <div
                                key={t.id}
                                className="group flex items-start gap-2 rounded-md border border-border px-2.5 py-2"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleTask(g.id, t)}
                                  aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                                  className={cn(
                                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                    t.completed
                                      ? 'border-mint-ink bg-mint text-mint-ink'
                                      : 'border-border hover:border-border-strong'
                                  )}
                                >
                                  {t.completed ? <Check className="size-3" strokeWidth={3} /> : null}
                                </button>
                                <span
                                  className={cn(
                                    'min-w-0 flex-1 text-sm',
                                    t.completed && 'text-foreground-subtle line-through'
                                  )}
                                >
                                  {t.title}
                                  {t.assignee && t.assignee !== 'Unassigned' && (
                                    <span className="block text-[11px] text-foreground-muted">
                                      {t.assignee}
                                    </span>
                                  )}
                                </span>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => removeTask(g.id, t)}
                                  aria-label="Delete task"
                                >
                                  <Trash2 className="size-3 text-rose-ink" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex gap-1.5">
                          <Input
                            value={newTask[g.id] || ''}
                            onChange={(e) => setNewTask((p) => ({ ...p, [g.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addTask(g.id)}
                            placeholder="Add a task"
                            className="h-8 text-sm"
                          />
                          <Button
                            size="icon-sm"
                            variant="outline"
                            onClick={() => addTask(g.id)}
                            disabled={!(newTask[g.id] || '').trim()}
                            aria-label={`Add task to ${g.name}`}
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPage>
  );
}
