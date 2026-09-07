import { useCallback, useEffect, useState } from 'react';
import {
  Key,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LineChart,
  Link as LinkIcon,
  Unlink,
  ShieldCheck,
} from 'lucide-react';
import authenticatedFetch from '@/shared/api/httpClient';
import { ga4Service } from '@/shared/api/ga4';
import { gscService } from '@/shared/api/gsc';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

type KeyStatus = { configured: boolean; masked: string; source: 'user' | 'workspace' | 'env' | null };
type Statuses = Record<string, KeyStatus>;
type TestResult = { ok: boolean; reason?: string; message?: string };

/**
 * Bring-your-own-key settings.
 *
 * Every account supplies its own credentials and spends its own quota. The
 * server never returns a stored key — only whether one is set, a masked hint,
 * and whose it is — so these inputs are always blank and typing replaces.
 * Before this, the endpoint returned raw values and the Google fields fell
 * back to the admin's, which meant any signed-in user could read the
 * workspace admin's Google key.
 */

/** Each row: what to show, what to send, and how to test it. */
const FIELDS: {
  id: string;
  label: string;
  statusKey: string;
  payloadKey: string;
  testService: string;
  help: string;
  link?: { label: string; href: string };
  secondary?: { id: string; label: string; statusKey: string; payloadKey: string; type?: string };
}[] = [
  {
    id: 'serperApiKey',
    label: 'Serper',
    statusKey: 'serper',
    payloadKey: 'serperApiKey',
    testService: 'serper',
    help: 'Powers citation audits and Answer the AI.',
    link: { label: 'Get a key', href: 'https://serper.dev' },
  },
  {
    id: 'claudeApiKey',
    label: 'Anthropic',
    statusKey: 'claude',
    payloadKey: 'claudeApiKey',
    testService: 'claude',
    help: 'Powers the content generators.',
    link: { label: 'Get a key', href: 'https://console.anthropic.com/settings/keys' },
  },
  {
    id: 'googleApiKey',
    label: 'Google API key',
    statusKey: 'googleApiKey',
    payloadKey: 'googleApiKey',
    testService: 'googleSearch',
    help: 'Used with the Search Engine ID below for index checks and rank tracking.',
    link: { label: 'Google Cloud', href: 'https://console.cloud.google.com/apis/credentials' },
    secondary: {
      id: 'googleCx',
      label: 'Search Engine ID (CX)',
      statusKey: 'googleCx',
      payloadKey: 'googleCx',
    },
  },
  {
    id: 'googlePlaces',
    label: 'Google Places key',
    statusKey: 'googlePlaces',
    payloadKey: 'googlePlaces',
    testService: 'googlePlaces',
    help: 'Needs the Places API enabled. Powers the rank heatmap. Leave blank to reuse the key above.',
    link: { label: 'Enable Places', href: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com' },
  },
  {
    id: 'dataForSeoLogin',
    label: 'DataForSEO login',
    statusKey: 'dataForSeoLogin',
    payloadKey: 'dataForSeoLogin',
    testService: 'dataForSeo',
    help: 'Keyword research, business audits, AI keyword data and bulk index checks.',
    link: { label: 'Dashboard', href: 'https://app.dataforseo.com/api-access' },
    secondary: {
      id: 'dataForSeoPassword',
      label: 'DataForSEO password',
      statusKey: 'dataForSeoPassword',
      payloadKey: 'dataForSeoPassword',
      type: 'password',
    },
  },
];

export function ApiKeysCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [statuses, setStatuses] = useState<Statuses>({});
  const [oauth, setOauth] = useState<any>(null);
  const [ga4, setGa4] = useState<any>(null);
  const [gsc, setGsc] = useState<any>(null);

  // Typed values only. Never seeded from the server — a blank field means
  // "leave whatever is stored alone".
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const [oauthDraft, setOauthDraft] = useState({ googleOauthClientId: '', googleOauthClientSecret: '' });
  const [ga4Busy, setGa4Busy] = useState<'connect' | 'disconnect' | null>(null);
  const [gscBusy, setGscBusy] = useState<'connect' | 'disconnect' | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/settings/api-keys', { method: 'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load');
      setStatuses(data.keys || {});
      setIsAdmin(Boolean(data.isAdmin));
      setOauth(data.googleOauthStatus || null);
      setGa4(data.ga4Status || null);
      setGsc(data.gscStatus || null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, string> = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v.trim()) payload[k] = v.trim();
    });
    if (isAdmin) {
      Object.entries(oauthDraft).forEach(([k, v]) => {
        if (v.trim()) payload[k] = v.trim();
      });
    }
    if (Object.keys(payload).length === 0) {
      toast.error('Nothing to save — enter a key first.');
      return;
    }
    setSaving(true);
    try {
      const res = await authenticatedFetch('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');
      toast.success('Keys saved');
      setDraft({});
      setOauthDraft({ googleOauthClientId: '', googleOauthClientSecret: '' });
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /** Tests the typed value if there is one, otherwise what is stored. */
  const runTest = async (service: string, field: (typeof FIELDS)[number]) => {
    setTesting(service);
    setResults((p) => ({ ...p, [service]: undefined as any }));
    try {
      const body: Record<string, string> = { service };
      if (service === 'dataForSeo') {
        if (draft.dataForSeoLogin?.trim()) body.login = draft.dataForSeoLogin.trim();
        if (draft.dataForSeoPassword?.trim()) body.password = draft.dataForSeoPassword.trim();
      } else {
        if (draft[field.payloadKey]?.trim()) body.value = draft[field.payloadKey].trim();
        if (service === 'googleSearch' && draft.googleCx?.trim()) body.cx = draft.googleCx.trim();
      }
      const res = await authenticatedFetch('/api/settings/api-keys/test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data: TestResult = await res.json();
      setResults((p) => ({ ...p, [service]: data }));
    } catch (err: any) {
      setResults((p) => ({
        ...p,
        [service]: { ok: false, reason: 'error', message: err?.message || 'Test failed' },
      }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="size-4" /> Your API keys
          </CardTitle>
          <p className="text-sm text-foreground-muted">
            Keys are stored against your account and used only for your requests, so
            each person brings their own and spends their own quota. Saved keys are
            never shown again — leave a field blank to keep what is already stored.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="flex flex-col gap-6">
            {FIELDS.map((f) => {
              const status = statuses[f.statusKey];
              const secondaryStatus = f.secondary ? statuses[f.secondary.statusKey] : null;
              const result = results[f.testService];
              return (
                <div key={f.id} data-field={f.id} className="flex flex-col gap-2 rounded-lg">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label htmlFor={f.id} className="flex items-center gap-2">
                      {f.label}
                      <StatusPill status={status} />
                    </Label>
                    {f.link && (
                      <a
                        href={f.link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {f.link.label} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted">{f.help}</p>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={f.id}
                      type="password"
                      autoComplete="off"
                      value={draft[f.payloadKey] ?? ''}
                      onChange={(e) => setDraft((p) => ({ ...p, [f.payloadKey]: e.target.value }))}
                      placeholder={
                        status?.configured ? `Saved (${status.masked}) — type to replace` : 'Not set'
                      }
                      className="flex-1 font-mono text-xs"
                    />
                    {f.secondary && (
                      <Input
                        id={f.secondary.id}
                        type={f.secondary.type === 'password' ? 'password' : 'text'}
                        autoComplete="off"
                        value={draft[f.secondary.payloadKey] ?? ''}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [f.secondary!.payloadKey]: e.target.value }))
                        }
                        placeholder={
                          secondaryStatus?.configured
                            ? `Saved (${secondaryStatus.masked})`
                            : f.secondary.label
                        }
                        className="flex-1 font-mono text-xs"
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => runTest(f.testService, f)}
                      disabled={testing === f.testService}
                      className="shrink-0"
                    >
                      {testing === f.testService ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                      Test
                    </Button>
                  </div>

                  {result && <TestLine result={result} />}
                </div>
              );
            })}

            <div>
              <Button type="submit" disabled={saving}>
                <Save className="size-4" /> {saving ? 'Saving…' : 'Save keys'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Google OAuth — a workspace-level app credential, not a per-user key. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="size-4" /> Google connection
          </CardTitle>
          <p className="text-sm text-foreground-muted">
            AI Traffic Report and AI Assistant sign in with your own Google account.
            The OAuth client itself is set once for the workspace by an admin.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-foreground-muted">OAuth client:</span>
            {oauth?.configured ? (
              <Badge variant="mint">Configured {oauth.clientIdMasked}</Badge>
            ) : (
              <Badge variant="butter">Not configured</Badge>
            )}
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-field="googleOauthClientId" className="flex flex-col gap-1.5 rounded-lg">
                <Label htmlFor="googleOauthClientId">Client ID</Label>
                <Input
                  id="googleOauthClientId"
                  autoComplete="off"
                  value={oauthDraft.googleOauthClientId}
                  onChange={(e) =>
                    setOauthDraft((p) => ({ ...p, googleOauthClientId: e.target.value }))
                  }
                  placeholder={oauth?.configured ? 'Saved — type to replace' : 'Not set'}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="googleOauthClientSecret">Client secret</Label>
                <Input
                  id="googleOauthClientSecret"
                  type="password"
                  autoComplete="off"
                  value={oauthDraft.googleOauthClientSecret}
                  onChange={(e) =>
                    setOauthDraft((p) => ({ ...p, googleOauthClientSecret: e.target.value }))
                  }
                  placeholder={oauth?.configured ? 'Saved — type to replace' : 'Not set'}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ConnectRow
              title="Google Analytics"
              connected={Boolean(ga4?.connected)}
              email={ga4?.email}
              busy={ga4Busy}
              onConnect={async () => {
                setGa4Busy('connect');
                try {
                  const { url } = await ga4Service.startConnect();
                  window.location.href = url;
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to start Google sign-in');
                  setGa4Busy(null);
                }
              }}
              onDisconnect={async () => {
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
              }}
            />
            <ConnectRow
              title="Search Console"
              connected={Boolean(gsc?.connected)}
              email={gsc?.email}
              busy={gscBusy}
              onConnect={async () => {
                setGscBusy('connect');
                try {
                  const { url } = await gscService.startConnect();
                  window.location.href = url;
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to start Google sign-in');
                  setGscBusy(null);
                }
              }}
              onDisconnect={async () => {
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
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusPill({ status }: { status?: KeyStatus }) {
  if (!status?.configured) return <Badge variant="outline">Not set</Badge>;
  if (status.source === 'user') return <Badge variant="mint">Your key</Badge>;
  if (status.source === 'workspace') return <Badge variant="sky">Workspace key</Badge>;
  return <Badge variant="lavender">From server config</Badge>;
}

function TestLine({ result }: { result: TestResult }) {
  const tone = result.ok
    ? 'text-mint-ink'
    : result.reason === 'unreachable'
      ? 'text-butter-ink'
      : 'text-rose-ink';
  const Icon = result.ok ? CheckCircle2 : AlertCircle;
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs', tone)}>
      <Icon className="size-3.5 shrink-0" />
      {result.message || (result.ok ? 'Key works.' : 'Key was rejected.')}
    </p>
  );
}

function ConnectRow({
  title,
  connected,
  email,
  busy,
  onConnect,
  onDisconnect,
}: {
  title: string;
  connected: boolean;
  email?: string | null;
  busy: 'connect' | 'disconnect' | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-foreground-muted">
          {connected ? email || 'Connected' : 'Not connected'}
        </span>
      </div>
      {connected ? (
        <Button size="sm" variant="outline" onClick={onDisconnect} disabled={busy === 'disconnect'}>
          <Unlink className="size-3.5" /> Disconnect
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={onConnect} disabled={busy === 'connect'}>
          <LinkIcon className="size-3.5" /> Connect
        </Button>
      )}
    </div>
  );
}
