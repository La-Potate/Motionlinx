import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bot,
  Link as LinkIcon,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  Unlink,
} from 'lucide-react';
import { settingsLinkFor } from '@/app/nav-config';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import { toast } from '@/shared/ui/sonner';
import { gscService, type GscStatus } from '@/shared/api/gsc';
import {
  aiAssistantService,
  type Dashboard,
  type SeoProject,
} from '@/shared/api/aiAssistant';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectCreator } from './components/ProjectCreator';
import { ScoreCard } from './components/ScoreCard';
import { FindingsList } from './components/FindingsList';
import { SitemapGate } from './components/SitemapGate';

const SELECTED_PROJECT_KEY = 'ai-assistant.selected-project';

export default function AiAssistantPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [gscStatus, setGscStatus] = useState<GscStatus | null>(null);
  const [gscError, setGscError] = useState<string | null>(null);
  const [gscBusy, setGscBusy] = useState<'connect' | 'disconnect' | null>(null);

  const [projects, setProjects] = useState<SeoProject[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [runStarting, setRunStarting] = useState(false);

  const dashboardPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Surface OAuth round-trip feedback -----
  useEffect(() => {
    const connected = searchParams.get('gsc_connected');
    const err = searchParams.get('gsc_error');
    if (connected) toast.success('Search Console connected');
    if (err) {
      const map: Record<string, string> = {
        oauth_not_configured: 'Admin must configure the Google OAuth client in Settings first.',
        invalid_state: 'Sign-in expired before completing. Try again.',
        exchange_failed: 'Google rejected the authorization.',
        missing_params: 'Missing OAuth parameters from Google.',
      };
      toast.error(map[err] || `GSC connect failed: ${err}`);
    }
    if (connected || err) {
      searchParams.delete('gsc_connected');
      searchParams.delete('gsc_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ----- GSC status -----
  const refreshStatus = useCallback(async () => {
    try {
      const s = await gscService.status();
      setGscStatus(s);
      setGscError(null);
      return s;
    } catch (err: any) {
      setGscError(err?.message || 'Failed to load Search Console status');
      return null;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // ----- Projects -----
  const loadProjects = useCallback(async () => {
    try {
      const data = await aiAssistantService.listProjects();
      setProjects(data.projects);
      if (data.projects.length && selectedId == null) {
        const stored = typeof window !== 'undefined' ? Number(localStorage.getItem(SELECTED_PROJECT_KEY)) : NaN;
        const candidate = data.projects.find((p) => p.id === stored)?.id ?? data.projects[0].id;
        setSelectedId(candidate);
      }
      return data.projects;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load projects');
      return [];
    }
  }, [selectedId]);

  useEffect(() => {
    if (gscStatus?.connected) loadProjects();
  }, [gscStatus?.connected, loadProjects]);

  // ----- Dashboard -----
  const loadDashboard = useCallback(async (projectId: number) => {
    setDashboardLoading(true);
    try {
      const data = await aiAssistantService.dashboard(projectId);
      setDashboard(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setDashboard(null);
      return;
    }
    if (typeof window !== 'undefined') localStorage.setItem(SELECTED_PROJECT_KEY, String(selectedId));
    loadDashboard(selectedId);
  }, [selectedId, loadDashboard]);

  // ----- Poll while a run is in-flight -----
  useEffect(() => {
    const job = dashboard?.job;
    const isRunning = job && (job.status === 'pending' || job.status === 'running');
    if (!isRunning) {
      if (dashboardPollRef.current) {
        clearInterval(dashboardPollRef.current);
        dashboardPollRef.current = null;
      }
      return;
    }
    if (dashboardPollRef.current) return;
    dashboardPollRef.current = setInterval(() => {
      if (selectedId != null) loadDashboard(selectedId);
    }, 4000);
    return () => {
      if (dashboardPollRef.current) {
        clearInterval(dashboardPollRef.current);
        dashboardPollRef.current = null;
      }
    };
  }, [dashboard?.job?.status, selectedId, loadDashboard, dashboard?.job]);

  // ----- Connect / disconnect -----
  const connectGsc = async () => {
    setGscBusy('connect');
    try {
      const { url } = await gscService.startConnect();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start sign-in');
      setGscBusy(null);
    }
  };

  const disconnectGsc = async () => {
    setGscBusy('disconnect');
    try {
      await gscService.disconnect();
      setProjects(null);
      setSelectedId(null);
      setDashboard(null);
      await refreshStatus();
      toast.success('Disconnected');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disconnect');
    } finally {
      setGscBusy(null);
    }
  };

  // ----- Run analysis -----
  const startRun = async () => {
    if (selectedId == null) return;
    setRunStarting(true);
    try {
      const out = await aiAssistantService.startRun(selectedId);
      if (out.alreadyRunning) toast.info('Analysis already running');
      else toast.success('Analysis started');
      loadDashboard(selectedId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start analysis');
    } finally {
      setRunStarting(false);
    }
  };

  const cancelRun = async () => {
    if (selectedId == null) return;
    try {
      await aiAssistantService.cancelRun(selectedId);
      loadDashboard(selectedId);
    } catch (err: any) {
      toast.error(err?.message || 'Cancel failed');
    }
  };

  // ----- Render branches -----
  if (gscError) {
    return (
      <ToolPage eyebrow="Motionlinx" title="AI Assistant" icon={Bot}>
        <Card className="p-6">
          <p className="text-sm text-rose-ink">{gscError}</p>
          <Button className="mt-4" size="sm" onClick={refreshStatus}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </Card>
      </ToolPage>
    );
  }

  if (!gscStatus) {
    return (
      <ToolPage eyebrow="Motionlinx" title="AI Assistant" icon={Bot}>
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </ToolPage>
    );
  }

  if (!gscStatus.oauthConfigured) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Assistant"
        icon={Bot}
        description="Search Console OAuth credentials haven't been configured yet."
      >
        <Card className="p-6 flex flex-col gap-4 max-w-2xl">
          <h3 className="text-base font-semibold tracking-tight">Setup needed</h3>
          <p className="text-sm text-foreground-muted">
            An admin needs to add the Google OAuth Client ID + Secret in{' '}
            <button
              type="button"
              onClick={() => navigate(settingsLinkFor('Search Console'))}
              className="text-accent hover:underline"
            >
              Settings → API keys
            </button>{' '}
            and register{' '}
            <code className="font-mono text-foreground-muted">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/gsc/auth/callback` : '/api/gsc/auth/callback'}
            </code>{' '}
            as an authorized redirect URI in Google Cloud Console.
          </p>
          <div>
            <Button onClick={() => navigate(settingsLinkFor('Search Console'))}>
              <SettingsIcon className="size-4" /> Add OAuth credentials
            </Button>
          </div>
        </Card>
      </ToolPage>
    );
  }

  if (!gscStatus.connected) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Assistant"
        icon={Bot}
        description="Full SEO analysis driven by Google Search Console + DataForSEO."
      >
        <Card className="p-8 flex flex-col items-start gap-4 max-w-2xl">
          <span className="flex size-12 items-center justify-center rounded-xl bg-lavender/40 text-lavender-ink">
            <LinkIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-lg font-semibold tracking-tight">Connect Search Console</h3>
            <p className="text-sm text-foreground-muted">
              Sign in with the Google account that owns your GSC properties. We request
              read access (and write access for sitemap submission) — nothing else.
            </p>
          </div>
          <Button onClick={connectGsc} disabled={gscBusy === 'connect'} size="lg">
            <LinkIcon className="size-4" />
            {gscBusy === 'connect' ? 'Redirecting…' : 'Connect Search Console'}
          </Button>
          <p className="text-xs text-foreground-subtle">
            Scopes: <code className="font-mono">webmasters.readonly</code> +{' '}
            <code className="font-mono">webmasters</code>. Disconnect any time.
          </p>
        </Card>
      </ToolPage>
    );
  }

  if (!projects) {
    return (
      <ToolPage eyebrow="Motionlinx" title="AI Assistant" icon={Bot}>
        <Skeleton className="h-32" />
      </ToolPage>
    );
  }

  if (projects.length === 0) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Assistant"
        icon={Bot}
        description="Pick the Search Console properties you want to analyse."
        actions={
          <Button variant="outline" size="sm" onClick={disconnectGsc} disabled={gscBusy === 'disconnect'}>
            <Unlink className="size-3.5" />
            {gscBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        }
      >
        <ProjectCreator
          onCreated={async (id) => {
            await loadProjects();
            setSelectedId(id);
          }}
        />
      </ToolPage>
    );
  }

  // ----- Dashboard view -----
  const selected = projects.find((p) => p.id === selectedId);
  const scores = dashboard?.run?.scores ?? null;
  const prev = dashboard?.prevScores ?? null;
  const delta = (cur: number | undefined, prv: number | undefined) =>
    typeof cur === 'number' && typeof prv === 'number' ? cur - prv : null;
  const job = dashboard?.job;
  const isRunning = job && (job.status === 'pending' || job.status === 'running');

  return (
    <ToolPage
      eyebrow="Motionlinx"
      title="AI Assistant"
      icon={Bot}
      description={
        gscStatus.email ? (
          <span>
            Reading from <span className="text-foreground">{gscStatus.email}</span>
          </span>
        ) : (
          'Search Console analysis dashboard.'
        )
      }
      actions={
        <>
          <Badge variant="mint">Connected</Badge>
          <Button variant="outline" size="sm" onClick={disconnectGsc} disabled={gscBusy === 'disconnect'}>
            <Unlink className="size-3.5" />
            {gscBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <ProjectSelector projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
        <span className="text-xs text-foreground-subtle">
          {selected?.properties.length} propert{(selected?.properties.length || 0) === 1 ? 'y' : 'ies'} mapped
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={isRunning ? cancelRun : startRun}
          disabled={runStarting}
          className="ml-auto"
        >
          {isRunning ? (
            <>Cancel run</>
          ) : (
            <>
              <Sparkles className={runStarting ? 'size-3.5 animate-pulse' : 'size-3.5'} />
              {runStarting ? 'Starting…' : 'Run full analysis'}
            </>
          )}
        </Button>
      </div>

      {isRunning && (
        <Card className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              Analysis in progress — phase {job.meta?.phase || job.status}
            </span>
            <span className="text-xs text-foreground-subtle tabular-nums">{job.progress}%</span>
          </div>
          <Progress value={job.progress} />
        </Card>
      )}

      {dashboardLoading && !dashboard ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : !dashboard?.run ? (
        <Card className="p-8 text-center text-sm text-foreground-subtle">
          No analysis yet. Click <span className="text-foreground">Run full analysis</span> to start.
        </Card>
      ) : (
        <>
          {dashboard.hasSitemap === false && selected && (
            <SitemapGate
              projectId={selected.id}
              siteUrls={selected.properties}
              onSubmitted={() => loadDashboard(selected.id)}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ScoreCard
              label="Overall SEO Health"
              score={scores?.overall ?? 0}
              delta={delta(scores?.overall, prev?.overall)}
            />
            <ScoreCard
              label="Technical / CWV"
              score={scores?.technical.score ?? 0}
              delta={delta(scores?.technical.score, prev?.technical?.score)}
              breakdown={scores?.technical.breakdown}
            />
            <ScoreCard
              label="GEO / AI-Readiness"
              score={scores?.geo.score ?? 0}
              delta={delta(scores?.geo.score, prev?.geo?.score)}
              breakdown={scores?.geo.breakdown}
            />
          </div>

          {dashboard.run.summary?.reasons && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold tracking-tight mb-2">Analysis notes</h2>
              <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
                {dashboard.run.summary.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </Card>
          )}

          <FindingsList
            findings={dashboard.findings}
            onPatched={() => selectedId != null && loadDashboard(selectedId)}
          />
        </>
      )}
    </ToolPage>
  );
}
