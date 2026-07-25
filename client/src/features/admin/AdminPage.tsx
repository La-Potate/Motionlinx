import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  Ban,
  Unlock,
  Coins,
  BarChart3,
  Activity,
  ShieldOff,
  Search,
  RefreshCw,
  ChevronDown,
  Mail,
  Calendar,
  Hash,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { userService } from '@/shared/api/user';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { Skeleton } from '@/shared/ui/skeleton';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/sonner';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', tone: 'accent' as const },
  { value: 'business', label: 'Business', tone: 'sky' as const },
  { value: 'personal', label: 'Personal', tone: 'mint' as const },
  { value: 'trial', label: 'Trial', tone: 'butter' as const },
];

function formatDate(value?: string | number | null) {
  if (!value && value !== 0) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function formatRelative(value?: string | number | null) {
  if (!value && value !== 0) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  for (const [unit, sec] of units) {
    if (Math.abs(seconds) >= sec || unit === 'second') {
      return rtf.format(-Math.round(seconds / sec), unit);
    }
  }
  return 'just now';
}

function currentUserId(): number | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).id ?? null;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [bannedIPs, setBannedIPs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activity, setActivity] = useState<{
    items: any[];
    loading: boolean;
    error: string;
  }>({ items: [], loading: false, error: '' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showBanIP, setShowBanIP] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'personal',
  });
  const [banIP, setBanIP] = useState({ ipAddress: '', reason: '' });
  const meId = currentUserId();

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [u, b, s] = await Promise.all([
        userService.getAllUsers(),
        userService.getBannedIPs(),
        userService.getUserStats(),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setBannedIPs(Array.isArray(b) ? b : []);
      setStats(s || {});
    } catch (err: any) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const loadActivity = async () => {
    setActivity({ items: [], loading: true, error: '' });
    try {
      const data: any = await userService.getApiLogs({ limit: 100 });
      setActivity({
        items: Array.isArray(data?.logs) ? data.logs : [],
        loading: false,
        error: '',
      });
    } catch (err: any) {
      setActivity({
        items: [],
        loading: false,
        error: err?.response?.data?.error || err?.message || 'Failed to load activity',
      });
    }
  };

  const onRoleChange = async (uid: number, role: string) => {
    try {
      await userService.updateUser(uid, { role });
      toast.success('User level updated');
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role } : u)));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    }
  };

  const onAddCredits = async (user: any) => {
    const amount = window.prompt(
      `Current credits: ${user.credits ?? 'N/A'}\nEnter the number of credits to add:`
    );
    if (!amount) return;
    const n = parseInt(amount, 10);
    if (Number.isNaN(n)) return toast.error('Enter a valid number');
    try {
      await userService.addCredits(user.id, n);
      toast.success('Credits updated');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update credits');
    }
  };

  const onBanUser = async (uid: number) => {
    const reason = window.prompt('Ban reason:');
    if (!reason) return;
    try {
      await userService.banUser(uid, reason);
      toast.success('User banned');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to ban');
    }
  };

  const onUnbanUser = async (uid: number) => {
    try {
      await userService.unbanUser(uid);
      toast.success('User unbanned');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to unban');
    }
  };

  const onDeleteUser = async (uid: number) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    try {
      await userService.deleteUser(uid);
      toast.success('User deleted');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  const onCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userService.createUser(newUser);
      toast.success('User created');
      setShowCreateUser(false);
      setNewUser({ username: '', email: '', password: '', role: 'personal' });
      refresh();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.response?.data?.errors?.[0]?.msg ||
        'Failed to create user';
      toast.error(msg);
    }
  };

  const onBanIP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userService.banIP(banIP.ipAddress, banIP.reason);
      toast.success('IP banned');
      setShowBanIP(false);
      setBanIP({ ipAddress: '', reason: '' });
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to ban IP');
    }
  };

  const onUnbanIP = async (ip: string) => {
    try {
      await userService.unbanIP(ip);
      toast.success('IP unbanned');
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to unban IP');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && u.isBanned) return false;
      if (statusFilter === 'banned' && !u.isBanned) return false;
      if (!q) return true;
      return [u.username, u.email, u.id]
        .filter(Boolean)
        .some((f: any) => String(f).toLowerCase().includes(q));
    });
  }, [users, search, roleFilter, statusFilter]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <ToolPage
      eyebrow="Admin"
      title="Operations console"
      description="Users, banned IPs, activity, and global statistics."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh"
        >
          <motion.span
            animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={
              refreshing
                ? { repeat: Infinity, duration: 0.9, ease: 'linear' }
                : { duration: 0.3 }
            }
          >
            <RefreshCw className="size-3.5" />
          </motion.span>
          Refresh
        </Button>
      }
    >
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <StatCard
          icon={Users}
          label="Total users"
          value={users.length || stats.totalUsers || 0}
        />
        <StatCard
          icon={Users}
          label="Active"
          value={users.filter((u) => !u.isBanned).length}
          tone="mint"
        />
        <StatCard
          icon={Ban}
          label="Banned"
          value={users.filter((u) => u.isBanned).length}
          tone="rose"
        />
        <StatCard
          icon={Activity}
          label="API calls (24h)"
          value={stats.apiCallsLast24h ?? 0}
          tone="sky"
        />
      </motion.div>

      <Tabs
        defaultValue="users"
        onValueChange={(v) => {
          if (v === 'activity' && activity.items.length === 0) loadActivity();
        }}
      >
        <TabsList>
          <TabsTrigger value="users">
            <Users className="size-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="banned-ips">
            <Ban className="size-3.5" /> Banned IPs
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="size-3.5" /> Activity
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="size-3.5" /> Statistics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card layout>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>User management</CardTitle>
                <Button onClick={() => setShowCreateUser(true)}>
                  <UserPlus className="size-4" /> Add user
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username, email, or id"
                    className="pl-8 h-9"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 flex flex-col gap-2">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>User</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-sm text-foreground-subtle py-12"
                          >
                            No users match the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUsers.map((u) => {
                          const isOpen = expanded.has(u.id);
                          return (
                            <UserRow
                              key={u.id}
                              user={u}
                              isOpen={isOpen}
                              onToggle={() => toggleExpand(u.id)}
                              meId={meId}
                              onRoleChange={onRoleChange}
                              onAddCredits={onAddCredits}
                              onBanUser={onBanUser}
                              onUnbanUser={onUnbanUser}
                              onDeleteUser={onDeleteUser}
                            />
                          );
                        })
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              )}
              <div className="px-5 py-3 border-t border-border text-xs text-foreground-muted">
                Showing{' '}
                <strong className="text-foreground tabular-nums">
                  {filteredUsers.length}
                </strong>{' '}
                of {users.length} users
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banned-ips">
          <Card layout>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>Banned IPs</CardTitle>
                <Button variant="destructive" onClick={() => setShowBanIP(true)}>
                  <ShieldOff className="size-4" /> Ban IP
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Banned</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence initial={false}>
                    {bannedIPs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-foreground-subtle py-12"
                        >
                          No banned IPs.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bannedIPs.map((b) => (
                        <motion.tr
                          key={b.ipAddress}
                          layout
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{
                            type: 'spring',
                            stiffness: 360,
                            damping: 30,
                          }}
                          className="border-b border-border transition-colors hover:bg-surface-muted/40"
                        >
                          <TableCell className="font-mono text-sm">
                            {b.ipAddress}
                          </TableCell>
                          <TableCell className="text-sm">{b.reason}</TableCell>
                          <TableCell className="text-xs text-foreground-muted">
                            {formatDate(b.bannedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onUnbanIP(b.ipAddress)}
                            >
                              <Unlock className="size-3.5" /> Unban
                            </Button>
                          </TableCell>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card layout>
            <CardHeader>
              <CardTitle>Recent API calls</CardTitle>
              <p className="text-sm text-foreground-muted">
                Last 100 across all users.
              </p>
            </CardHeader>
            <CardContent>
              {activity.loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : activity.error ? (
                <p className="text-sm text-rose-ink">{activity.error}</p>
              ) : activity.items.length === 0 ? (
                <p className="text-sm text-foreground-subtle">No activity yet.</p>
              ) : (
                <motion.ul
                  variants={stagger.container}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col gap-2"
                >
                  {activity.items.map((log) => (
                    <motion.li
                      key={log.id}
                      variants={stagger.item}
                      layout
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={log.success ? 'mint' : 'rose'}>
                          {log.success ? 'OK' : 'Fail'}
                        </Badge>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {log.service}{' '}
                            {log.statusCode ? (
                              <span className="text-foreground-subtle">
                                HTTP {log.statusCode}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-foreground-subtle">
                            user {log.userId} · {formatRelative(log.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-foreground-muted tabular-nums shrink-0">
                        {log.credits || 1} cr
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          <Card layout>
            <CardHeader>
              <CardTitle>Role distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {ROLE_OPTIONS.map((role) => {
                const count = users.filter((u) => u.role === role.value).length;
                const pct = users.length ? (count / users.length) * 100 : 0;
                return (
                  <div key={role.value} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Badge variant={role.tone}>{role.label}</Badge>
                      </span>
                      <span className="tabular-nums">
                        <AnimatedNumber value={count} /> users ·{' '}
                        <span className="text-foreground-subtle">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-inset overflow-hidden">
                      <motion.div
                        layout
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          type: 'spring',
                          stiffness: 200,
                          damping: 28,
                        }}
                        className={cn(
                          'h-full',
                          role.tone === 'accent' && 'bg-accent',
                          role.tone === 'sky' && 'bg-sky-ink/70',
                          role.tone === 'mint' && 'bg-mint-ink/70',
                          role.tone === 'butter' && 'bg-butter-ink/70'
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              New users default to the Personal level unless changed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateUser} className="flex flex-col gap-4">
            <FieldRow id="new-username" label="Username">
              <Input
                id="new-username"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser({ ...newUser, username: e.target.value })
                }
                required
              />
            </FieldRow>
            <FieldRow id="new-email" label="Email">
              <Input
                id="new-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </FieldRow>
            <FieldRow id="new-password" label="Password">
              <Input
                id="new-password"
                type="password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                required
              />
            </FieldRow>
            <FieldRow id="new-role" label="Role">
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser({ ...newUser, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateUser(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                <UserPlus className="size-4" /> Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showBanIP} onOpenChange={setShowBanIP}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban IP address</DialogTitle>
            <DialogDescription>
              Blocks the address from creating accounts or signing in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onBanIP} className="flex flex-col gap-4">
            <FieldRow id="ban-ip" label="IP address">
              <Input
                id="ban-ip"
                value={banIP.ipAddress}
                onChange={(e) =>
                  setBanIP({ ...banIP, ipAddress: e.target.value })
                }
                placeholder="192.168.1.1"
                required
              />
            </FieldRow>
            <FieldRow id="ban-reason" label="Reason">
              <Input
                id="ban-reason"
                value={banIP.reason}
                onChange={(e) => setBanIP({ ...banIP, reason: e.target.value })}
                required
              />
            </FieldRow>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBanIP(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive">
                <Ban className="size-4" /> Ban
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}

function UserRow({
  user,
  isOpen,
  onToggle,
  meId,
  onRoleChange,
  onAddCredits,
  onBanUser,
  onUnbanUser,
  onDeleteUser,
}: {
  user: any;
  isOpen: boolean;
  onToggle: () => void;
  meId: number | null;
  onRoleChange: (uid: number, role: string) => void;
  onAddCredits: (user: any) => void;
  onBanUser: (uid: number) => void;
  onUnbanUser: (uid: number) => void;
  onDeleteUser: (uid: number) => void;
}) {
  const roleOpt = ROLE_OPTIONS.find((o) => o.value === user.role);
  return (
    <>
      <motion.tr
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="border-b border-border transition-colors hover:bg-surface-muted/40"
      >
        <TableCell className="w-8">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24 }}
              className="inline-flex"
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </Button>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium text-sm">{user.username}</span>
            <span className="text-xs text-foreground-subtle truncate max-w-[220px]">
              {user.email}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <Select
            value={user.role || 'personal'}
            onValueChange={(v) => onRoleChange(user.id, v)}
            disabled={user.id === meId && user.role === 'admin'}
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm">
          {typeof user.credits === 'number' ? (
            <AnimatedNumber value={user.credits} />
          ) : (
            '—'
          )}
        </TableCell>
        <TableCell>
          <Badge variant={user.isBanned ? 'rose' : 'mint'}>
            {user.isBanned ? 'Banned' : 'Active'}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-foreground-muted">
          {formatRelative(user.lastSeen || user.lastLogin || user.createdAt)}
        </TableCell>
        <TableCell className="text-right">
          <div className="inline-flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onAddCredits(user)}
              title="Add credits"
            >
              <Coins className="size-3.5" />
            </Button>
            {user.isBanned ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUnbanUser(user.id)}
                title="Unban user"
              >
                <Unlock className="size-3.5 text-mint-ink" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onBanUser(user.id)}
                title="Ban user"
              >
                <Ban className="size-3.5 text-butter-ink" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDeleteUser(user.id)}
              title="Delete user"
            >
              <UserMinus className="size-3.5 text-rose-ink" />
            </Button>
          </div>
        </TableCell>
      </motion.tr>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.tr
            key={`exp-${user.id}`}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <TableCell colSpan={7} className="p-0">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                className="overflow-hidden bg-surface-muted/40"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-4">
                  <ExpandedDetail
                    icon={Hash}
                    label="Account ID"
                    value={String(user.id)}
                  />
                  <ExpandedDetail
                    icon={Mail}
                    label="Email"
                    value={user.email || '—'}
                  />
                  <ExpandedDetail
                    icon={Calendar}
                    label="Created"
                    value={formatDate(user.createdAt || user.created_at)}
                  />
                  {user.banReason && (
                    <ExpandedDetail
                      icon={Ban}
                      label="Ban reason"
                      value={user.banReason}
                      tone="rose"
                    />
                  )}
                  {roleOpt && (
                    <ExpandedDetail
                      icon={Users}
                      label="Plan"
                      value={<Badge variant={roleOpt.tone}>{roleOpt.label}</Badge>}
                    />
                  )}
                  <ExpandedDetail
                    icon={Coins}
                    label="Credit limit"
                    value={
                      typeof user.credit_limit === 'number'
                        ? user.credit_limit.toLocaleString()
                        : '—'
                    }
                  />
                </div>
              </motion.div>
            </TableCell>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

function ExpandedDetail({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'rose';
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-md shrink-0 mt-0.5',
          tone === 'rose'
            ? 'bg-rose text-rose-ink'
            : 'bg-accent-soft text-accent-pressed'
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-foreground-subtle">
          {label}
        </div>
        <div className="text-sm text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'default' | 'mint' | 'rose' | 'sky';
}) {
  const valueColor =
    tone === 'mint'
      ? 'text-mint-ink'
      : tone === 'rose'
        ? 'text-rose-ink'
        : tone === 'sky'
          ? 'text-sky-ink'
          : 'text-foreground';
  return (
    <motion.div variants={stagger.item} layout>
      <Card className="hover:border-border-strong transition-colors">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed">
              <Icon className="size-4" />
            </span>
            <div>
              <div className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
                <AnimatedNumber value={value} />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-foreground-subtle mt-0.5">
                {label}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
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
