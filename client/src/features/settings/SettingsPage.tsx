import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  User as UserIcon,
  Mail,
  Lock,
  Save,
  Eye,
  EyeOff,
  Key,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  Unlink,
  LineChart,
  ShieldAlert,
} from 'lucide-react';
import { userService } from '@/shared/api/user';
import authenticatedFetch from '@/shared/api/httpClient';
import serpService from '@/shared/api/serp';
import { ga4Service } from '@/shared/api/ga4';
import { gscService } from '@/shared/api/gsc';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

type CurrentUser = {
  id?: number;
  username: string;
  email?: string;
  role?: string;
  isBanned?: boolean;
  iat?: number;
};

function getUserFromToken(): CurrentUser | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const user = getUserFromToken();

  // Deep-link support: /settings?tab=apis&highlight=serperApiKey opens the
  // right tab AND scrolls to the exact field. Tools link here directly so
  // "you need a key" resolves to the one input instead of dropping someone
  // on this page to hunt for it.
  //
  // These hooks sit above the `!user` early return — React requires an
  // unconditional call order.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const highlight = searchParams.get('highlight');
  const [tab, setTab] = useState(requestedTab || 'profile');

  // 'apis' and 'prompts' only exist for admins. A non-admin following a
  // "set it up" link would otherwise land on an empty panel, so fall back to
  // Profile and tell them who can actually add the key.
  const ADMIN_ONLY_TABS = ['apis', 'prompts'];
  const isAdminUser = user?.role === 'admin';
  const blockedTab = Boolean(
    requestedTab && ADMIN_ONLY_TABS.includes(requestedTab) && !isAdminUser,
  );

  useEffect(() => {
    if (requestedTab) setTab(blockedTab ? 'profile' : requestedTab);
  }, [requestedTab, blockedTab]);

  useEffect(() => {
    if (!highlight || blockedTab) return;
    // Radix unmounts inactive tab panels, so wait a frame for the target
    // tab's content to mount before looking the field up.
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = document.getElementById(highlight);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus so a keyboard user lands on the field too, not just the eye.
      if (typeof (el as HTMLInputElement).focus === 'function') {
        (el as HTMLInputElement).focus({ preventScroll: true });
      }
      const wrapper = el.closest('[data-field]') || el;
      wrapper.classList.add('field-highlight');
      window.setTimeout(() => wrapper.classList.remove('field-highlight'), 2600);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [highlight, tab, blockedTab]);

  if (!user) {
    return (
      <ToolPage title="Settings" eyebrow="Account">
        <Skeleton className="h-64" />
      </ToolPage>
    );
  }

  const isAdmin = user.role === 'admin';
  const memberSince = user.iat ? new Date(user.iat * 1000).toLocaleDateString() : '—';

  return (
    <ToolPage
      eyebrow="Account"
      title={user.username}
      description={user.email}
      actions={
        <>
          <Badge variant="accent">{user.role}</Badge>
          <Badge variant={user.isBanned ? 'rose' : 'mint'}>
            {user.isBanned ? 'Banned' : 'Active'}
          </Badge>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Member since" value={memberSince} />
        <Stat label="Account ID" value={String(user.id ?? '—')} />
        <Stat label="Role" value={user.role || 'personal'} />
      </div>

      {blockedTab && (
        <div className="flex items-start gap-3 rounded-lg border border-butter bg-butter/25 p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-butter-ink" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              That setting is managed by an admin
            </p>
            <p className="text-sm text-foreground-muted">
              Shared API keys apply to everyone on this workspace, so only an admin
              can change them. Ask an admin to add it and the tool will start working
              for you — no change needed on your account.
            </p>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isAdmin && <TabsTrigger value="apis">API keys</TabsTrigger>}
          {isAdmin && <TabsTrigger value="prompts">Prompts</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <ProfileCard user={user} />
        </TabsContent>
        <TabsContent value="security">
          <PasswordCard />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="apis">
            <ApiKeysCard />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="prompts">
            <PromptsCard />
          </TabsContent>
        )}
      </Tabs>
    </ToolPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-base font-semibold text-foreground truncate">{value}</div>
        <div className="text-[11px] uppercase tracking-wider text-foreground-subtle mt-1">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ user }: { user: CurrentUser }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { username: user.username, email: user.email || '' },
  });

  const onSubmit = async (data: any) => {
    try {
      await userService.updateProfile(data);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update profile');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <p className="text-sm text-foreground-muted">
          Update your username and email address.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="username"
            label="Username"
            icon={<UserIcon className="size-4 text-foreground-subtle" />}
            {...register('username', { required: true })}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            icon={<Mail className="size-4 text-foreground-subtle" />}
            {...register('email')}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              <Save className="size-4" />
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [show, setShow] = useState(false);
  const { register, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPwd = watch('newPassword');
  const confirm = watch('confirmPassword');
  const match = newPwd && confirm && newPwd === confirm;
  const mismatch = newPwd && confirm && newPwd !== confirm;

  const onSubmit = async (data: any) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (data.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await userService.changePassword(data.oldPassword, data.newPassword);
      toast.success('Password changed');
      reset();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change password');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update password</CardTitle>
        <p className="text-sm text-foreground-muted">
          Use at least 8 characters with a mix of letters, numbers, and symbols.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            id="oldPassword"
            label="Current"
            type={show ? 'text' : 'password'}
            icon={<Lock className="size-4 text-foreground-subtle" />}
            {...register('oldPassword', { required: true })}
          />
          <Field
            id="newPassword"
            label="New"
            type={show ? 'text' : 'password'}
            icon={<Lock className="size-4 text-foreground-subtle" />}
            trailing={
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="text-foreground-subtle hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register('newPassword', { required: true })}
          />
          <Field
            id="confirmPassword"
            label="Confirm"
            type={show ? 'text' : 'password'}
            icon={<Lock className="size-4 text-foreground-subtle" />}
            {...register('confirmPassword', { required: true })}
          />
          <div className="sm:col-span-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs">
              {match && (
                <span className="text-mint-ink inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" /> Passwords match
                </span>
              )}
              {mismatch && (
                <span className="text-rose-ink inline-flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" /> Passwords do not match
                </span>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting || !!mismatch}>
              <Lock className="size-4" />
              {isSubmitting ? 'Updating…' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ApiKeysCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [keys, setKeys] = useState({
    googleApiKey: '',
    googleCx: '',
    dataForSeoLogin: '',
    dataForSeoPassword: '',
    serperApiKey: '',
    claudeApiKey: '',
    googleOauthClientId: '',
    googleOauthClientSecret: '',
  });
  const [meta, setMeta] = useState<{
    serperConfigured: boolean;
    claudeConfigured: boolean;
    googleOauthConfigured: boolean;
    ga4Connected: boolean;
    ga4Email: string | null;
    gscConnected: boolean;
    gscEmail: string | null;
  }>({
    serperConfigured: false,
    claudeConfigured: false,
    googleOauthConfigured: false,
    ga4Connected: false,
    ga4Email: null,
    gscConnected: false,
    gscEmail: null,
  });
  const [ga4Busy, setGa4Busy] = useState<'connect' | 'disconnect' | null>(null);
  const [gscBusy, setGscBusy] = useState<'connect' | 'disconnect' | null>(null);

  const reload = async () => {
    try {
      const res = await authenticatedFetch('/api/settings/api-keys', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(Boolean(data.isAdmin));
        setKeys({
          googleApiKey: data.googleApiKey || '',
          googleCx: data.googleCx || '',
          dataForSeoLogin: data.dataForSeoLogin || '',
          dataForSeoPassword: data.dataForSeoPassword || '',
          serperApiKey: data.serperApiKey || '',
          claudeApiKey: data.claudeApiKey || '',
          googleOauthClientId: data.googleOauthClientId || '',
          googleOauthClientSecret: data.googleOauthClientSecret || '',
        });
        setMeta({
          serperConfigured: Boolean(data.serperStatus?.configured),
          claudeConfigured: Boolean(data.claudeStatus?.configured),
          googleOauthConfigured: Boolean(data.googleOauthStatus?.configured),
          ga4Connected: Boolean(data.ga4Status?.connected),
          ga4Email: data.ga4Status?.email || null,
          gscConnected: Boolean(data.gscStatus?.connected),
          gscEmail: data.gscStatus?.email || null,
        });
      }
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGa4 = async () => {
    setGa4Busy('connect');
    try {
      const { url } = await ga4Service.startConnect();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start Google sign-in');
      setGa4Busy(null);
    }
  };

  const disconnectGa4 = async () => {
    setGa4Busy('disconnect');
    try {
      await ga4Service.disconnect();
      toast.success('Disconnected from Google Analytics');
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disconnect');
    } finally {
      setGa4Busy(null);
    }
  };

  const connectGsc = async () => {
    setGscBusy('connect');
    try {
      const { url } = await gscService.startConnect();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start Google sign-in');
      setGscBusy(null);
    }
  };

  const disconnectGsc = async () => {
    setGscBusy('disconnect');
    try {
      await gscService.disconnect();
      toast.success('Disconnected from Search Console');
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disconnect');
    } finally {
      setGscBusy(null);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authenticatedFetch('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify(keys),
      });
      if (res.ok) toast.success('API keys saved');
      else toast.error('Failed to save');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const testSerper = async () => {
    if (!keys.serperApiKey?.trim()) {
      toast.error('Enter a Serper key first.');
      return;
    }
    setTesting(true);
    try {
      const result: any = await serpService.serperSearch({
        query: 'apple inc',
        apiKey: keys.serperApiKey.trim(),
      });
      if (result.ok && result.data?.success) {
        const count = Array.isArray(result.data?.data?.organic)
          ? result.data.data.organic.length
          : Array.isArray(result.data?.data?.results)
            ? result.data.data.results.length
            : 0;
        toast.success(`Serper OK — ${count} organic results`);
      } else {
        toast.error(result.data?.error || 'Serper test failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Serper test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared API keys</CardTitle>
        <p className="text-sm text-foreground-muted">
          Keys configured here are used by every user on this workspace.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="flex flex-col gap-5">
          <KeyField
            id="googleApiKey"
            label="Google API Key"
            type="password"
            value={keys.googleApiKey}
            onChange={(v) => setKeys((k) => ({ ...k, googleApiKey: v }))}
            help="Used for Google Search API and other Google services."
            externalLink={{
              label: 'Google Cloud',
              href: 'https://console.cloud.google.com/apis/credentials',
            }}
            disabled={!isAdmin}
          />
          <KeyField
            id="googleCx"
            label="Search Engine ID (CX)"
            value={keys.googleCx}
            onChange={(v) => setKeys((k) => ({ ...k, googleCx: v }))}
            help="Custom Search Engine ID for Google Programmable Search."
            externalLink={{
              label: 'Manage',
              href: 'https://programmablesearchengine.google.com/controlpanel/all',
            }}
            disabled={!isAdmin}
          />
          <KeyField
            id="serperApiKey"
            label="Serper API Key"
            type="password"
            value={keys.serperApiKey}
            onChange={(v) => setKeys((k) => ({ ...k, serperApiKey: v }))}
            help={meta.serperConfigured ? 'Connected.' : 'Not connected yet.'}
            disabled={!isAdmin}
            trailing={
              isAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={testSerper}
                  disabled={testing}
                >
                  {testing ? 'Testing…' : 'Test'}
                </Button>
              ) : undefined
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KeyField
              id="dataForSeoLogin"
              label="DataForSEO login"
              type="email"
              value={keys.dataForSeoLogin}
              onChange={(v) => setKeys((k) => ({ ...k, dataForSeoLogin: v }))}
              disabled={!isAdmin}
            />
            <KeyField
              id="dataForSeoPassword"
              label="DataForSEO password"
              type="password"
              value={keys.dataForSeoPassword}
              onChange={(v) => setKeys((k) => ({ ...k, dataForSeoPassword: v }))}
              disabled={!isAdmin}
            />
          </div>
          <KeyField
            id="claudeApiKey"
            label="Anthropic Claude API Key"
            type="password"
            value={keys.claudeApiKey}
            onChange={(v) => setKeys((k) => ({ ...k, claudeApiKey: v }))}
            help={meta.claudeConfigured ? 'Connected.' : 'Not connected yet.'}
            disabled={!isAdmin}
          />

          {/* Google OAuth (for AI Traffic Report). Admin enters credentials
              once; each user then connects their own Google account. */}
          <div className="rounded-lg border border-border bg-surface-muted/40 p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-sky/40 text-sky-ink shrink-0">
                <LineChart className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h4 className="text-sm font-semibold tracking-tight">
                  Google Analytics — AI Traffic Report
                </h4>
                <p className="text-xs text-foreground-muted">
                  Used by the AI Traffic Report app. Admin sets the OAuth client once;
                  each user connects their own Google account.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KeyField
                id="googleOauthClientId"
                label="Google OAuth Client ID"
                value={keys.googleOauthClientId}
                onChange={(v) => setKeys((k) => ({ ...k, googleOauthClientId: v }))}
                externalLink={{
                  label: 'Google Cloud',
                  href: 'https://console.cloud.google.com/apis/credentials',
                }}
                disabled={!isAdmin}
              />
              <KeyField
                id="googleOauthClientSecret"
                label="Google OAuth Client Secret"
                type="password"
                value={keys.googleOauthClientSecret}
                onChange={(v) =>
                  setKeys((k) => ({ ...k, googleOauthClientSecret: v }))
                }
                disabled={!isAdmin}
              />
            </div>

            <div className="rounded-md border border-border bg-background p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                  Your Google account
                </span>
                <span className="text-sm text-foreground truncate">
                  {meta.ga4Connected
                    ? meta.ga4Email || 'Connected'
                    : meta.googleOauthConfigured
                      ? 'Not connected'
                      : 'OAuth client not configured yet'}
                </span>
              </div>
              {meta.ga4Connected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={disconnectGa4}
                  disabled={ga4Busy === 'disconnect'}
                >
                  <Unlink className="size-3.5" />
                  {ga4Busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={connectGa4}
                  disabled={!meta.googleOauthConfigured || ga4Busy === 'connect'}
                >
                  <LinkIcon className="size-3.5" />
                  {ga4Busy === 'connect' ? 'Redirecting…' : 'Connect Google Analytics'}
                </Button>
              )}
            </div>

            {isAdmin && (
              <p className="text-[11px] text-foreground-subtle leading-relaxed">
                Add the redirect URI{' '}
                <code className="font-mono text-foreground-muted">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/api/ga4/auth/callback`
                    : '/api/ga4/auth/callback'}
                </code>{' '}
                to your OAuth client and enable the Analytics Data + Admin APIs in Google
                Cloud Console.
              </p>
            )}
          </div>

          {/* Google Search Console — same OAuth client as GA4; just a
              different scope and a second redirect URI. */}
          <div className="rounded-lg border border-border bg-surface-muted/40 p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-lavender/40 text-lavender-ink shrink-0">
                <LineChart className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h4 className="text-sm font-semibold tracking-tight">
                  Google Search Console — AI Assistant
                </h4>
                <p className="text-xs text-foreground-muted">
                  Re-uses the same Google OAuth client as the AI Traffic Report. Each user
                  connects their own Google account to run SEO analyses.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
                  Your Google account
                </span>
                <span className="text-sm text-foreground truncate">
                  {meta.gscConnected
                    ? meta.gscEmail || 'Connected'
                    : meta.googleOauthConfigured
                      ? 'Not connected'
                      : 'OAuth client not configured yet'}
                </span>
              </div>
              {meta.gscConnected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={disconnectGsc}
                  disabled={gscBusy === 'disconnect'}
                >
                  <Unlink className="size-3.5" />
                  {gscBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={connectGsc}
                  disabled={!meta.googleOauthConfigured || gscBusy === 'connect'}
                >
                  <LinkIcon className="size-3.5" />
                  {gscBusy === 'connect' ? 'Redirecting…' : 'Connect Search Console'}
                </Button>
              )}
            </div>

            {isAdmin && (
              <p className="text-[11px] text-foreground-subtle leading-relaxed">
                Add the redirect URI{' '}
                <code className="font-mono text-foreground-muted">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/api/gsc/auth/callback`
                    : '/api/gsc/auth/callback'}
                </code>{' '}
                to the same OAuth client. No new credentials needed.
              </p>
            )}
          </div>

          <div>
            <Button type="submit" disabled={saving || !isAdmin}>
              <Save className="size-4" /> {saving ? 'Saving…' : 'Save API keys'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PromptsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [editable, setEditable] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authenticatedFetch('/api/settings/prompts', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          setPrompts(data.prompts || {});
          setDefaults(data.defaults || {});
          // The server decides which prompts are editable, so this list does
          // not have to be kept in sync by hand on both sides.
          setEditable(data.editable || Object.keys(data.prompts || {}));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      editable.forEach((k) => {
        if (prompts[k]?.trim()) payload[k] = prompts[k];
      });
      const res = await authenticatedFetch('/api/settings/prompts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) toast.success('Prompts saved');
      else toast.error('Failed to save');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64" />;

  const META: Record<string, { label: string; help: string }> = {
    blogPost: {
      label: 'Blog post',
      help: 'Used by the Blog Post generator. The user supplies the URL, topic and word count.',
    },
    pressRelease: {
      label: 'Press release',
      help: 'Used by the Press Release generator. The user supplies the website, author and service.',
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> Content prompts
        </CardTitle>
        <p className="text-sm text-foreground-muted">
          System prompts used by the content generators. These apply to everyone on
          the workspace.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          {editable.map((key) => {
            const meta = META[key] || { label: key, help: '' };
            const isDefault = prompts[key] === defaults[key];
            return (
              <div key={key} data-field={`${key}Prompt`} className="flex flex-col gap-1.5 rounded-lg">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor={`${key}Prompt`}>{meta.label} system prompt</Label>
                  <button
                    type="button"
                    disabled={isDefault}
                    onClick={() =>
                      setPrompts((p) => ({ ...p, [key]: defaults[key] || '' }))
                    }
                    className="text-xs text-foreground-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:no-underline"
                  >
                    {isDefault ? 'Unchanged from default' : 'Reset to default'}
                  </button>
                </div>
                {meta.help && (
                  <span className="text-xs text-foreground-muted">{meta.help}</span>
                )}
                <Textarea
                  id={`${key}Prompt`}
                  value={prompts[key] || ''}
                  onChange={(e) =>
                    setPrompts((p) => ({ ...p, [key]: e.target.value }))
                  }
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
            );
          })}

          <p className="text-xs text-foreground-muted">
            Beyond Intent is not listed: it runs a nine-step chain and builds each
            step&rsquo;s prompt from the previous step&rsquo;s output, so it has no single
            prompt to edit here.
          </p>

          <div>
            <Button type="submit" disabled={saving}>
              <Save className="size-4" /> {saving ? 'Saving…' : 'Save prompts'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  icon,
  trailing,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{icon}</span>
        )}
        <Input
          id={id}
          className={cn(icon && 'pl-8', trailing && 'pr-10')}
          {...input}
        />
        {trailing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex">{trailing}</div>
        )}
      </div>
    </div>
  );
}

function KeyField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  help,
  externalLink,
  disabled = false,
  trailing,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  externalLink?: { label: string; href: string };
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    // data-field is the anchor the ?highlight= deep link rings — set on the
    // wrapper so the label and helper text light up with the input.
    <div data-field={id} className="flex flex-col gap-1.5 rounded-lg">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          <Key className="size-3.5 text-foreground-subtle" />
          {label}
        </Label>
        {externalLink && (
          <a
            href={externalLink.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
          >
            {externalLink.label} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1"
        />
        {trailing}
      </div>
      {help && <span className="text-xs text-foreground-subtle">{help}</span>}
    </div>
  );
}
