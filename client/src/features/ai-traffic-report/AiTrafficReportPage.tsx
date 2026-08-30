import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { BarChart3, Link as LinkIcon, RefreshCw, Settings as SettingsIcon, Unlink } from 'lucide-react';
import { settingsLinkFor } from '@/app/nav-config';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/sonner';
import {
  ga4Service,
  type AiTrafficReport,
  type Ga4Property,
  type Ga4Status,
} from '@/shared/api/ga4';
import { PropertySelector } from './components/PropertySelector';
import { DateRangeSelector } from './components/DateRangeSelector';
import { StatsCards } from './components/StatsCards';
import { TrafficChart } from './components/TrafficChart';
import { EngineBreakdown } from './components/EngineBreakdown';
import { TopPagesTable } from './components/TopPagesTable';

const STORAGE_KEY = 'atr.selected-property';
const ISO = (d: Date) => format(d, 'yyyy-MM-dd');

export default function AiTrafficReportPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<Ga4Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [properties, setProperties] = useState<Ga4Property[] | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(ISO(subDays(new Date(), 29)));
  const [endDate, setEndDate] = useState<string>(ISO(new Date()));

  const [report, setReport] = useState<AiTrafficReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // 1) Surface query-string feedback from the OAuth round-trip.
  useEffect(() => {
    const connected = searchParams.get('ga4_connected');
    const err = searchParams.get('ga4_error');
    if (connected) {
      toast.success('Google Analytics connected');
    }
    if (err) {
      const map: Record<string, string> = {
        oauth_not_configured:
          'Admin must configure the Google OAuth client in Settings → API keys first.',
        invalid_state: 'Sign-in expired before completing. Try connecting again.',
        exchange_failed: 'Google rejected the authorization. Try again.',
        missing_params: 'Missing OAuth parameters from Google.',
      };
      toast.error(map[err] || `Google connect failed: ${err}`);
    }
    if (connected || err) {
      searchParams.delete('ga4_connected');
      searchParams.delete('ga4_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await ga4Service.status();
      setStatus(s);
      setStatusError(null);
      return s;
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to load GA4 status');
      return null;
    }
  }, []);

  // 2) Initial status check.
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // 3) When connected, load properties.
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    (async () => {
      setLoadingProperties(true);
      setPropertiesError(null);
      try {
        const data = await ga4Service.listProperties();
        if (cancelled) return;
        setProperties(data.properties);
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const initial =
          (stored && data.properties.find((p) => p.id === stored)?.id) ??
          data.properties[0]?.id ??
          null;
        setSelected(initial);
      } catch (err: any) {
        if (!cancelled) {
          setPropertiesError(err?.message || 'Failed to load properties');
          if (err?.code === 'reauth_required' || err?.code === 'not_connected') {
            setStatus((prev) => (prev ? { ...prev, connected: false } : prev));
          }
        }
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status?.connected]);

  // 4) Whenever selection or date range changes, fetch the report.
  const fetchReport = useCallback(async () => {
    if (!selected) return;
    setLoadingReport(true);
    setReportError(null);
    try {
      const data = await ga4Service.runReport({ propertyId: selected, startDate, endDate });
      setReport(data);
    } catch (err: any) {
      setReportError(err?.message || 'Failed to load report');
      if (err?.code === 'reauth_required' || err?.code === 'not_connected') {
        setStatus((prev) => (prev ? { ...prev, connected: false } : prev));
      }
    } finally {
      setLoadingReport(false);
    }
  }, [selected, startDate, endDate]);

  useEffect(() => {
    if (status?.connected && selected) fetchReport();
  }, [status?.connected, selected, fetchReport]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await ga4Service.startConnect();
      window.location.href = url;
    } catch (err: any) {
      if (err?.code === 'oauth_not_configured') {
        toast.error('Admin must configure the Google OAuth client first.');
      } else {
        toast.error(err?.message || 'Failed to start Google sign-in');
      }
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await ga4Service.disconnect();
      toast.success('Disconnected from Google Analytics');
      setProperties(null);
      setSelected(null);
      setReport(null);
      await refreshStatus();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSelectProperty = (id: string) => {
    setSelected(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  };

  const dayCount = useMemo(
    () => differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1,
    [startDate, endDate],
  );

  // ----- Render branches -----

  // Status check failed entirely.
  if (statusError) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Traffic Report"
        icon={BarChart3}
        description="Couldn't load Google Analytics connection status."
      >
        <Card className="p-6">
          <p className="text-sm text-rose-ink">{statusError}</p>
          <Button className="mt-4" size="sm" onClick={refreshStatus}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </Card>
      </ToolPage>
    );
  }

  // Loading status.
  if (!status) {
    return (
      <ToolPage eyebrow="Motionlinx" title="AI Traffic Report" icon={BarChart3}>
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </ToolPage>
    );
  }

  // OAuth not configured by admin yet.
  if (!status.oauthConfigured) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Traffic Report"
        icon={BarChart3}
        description="Google OAuth credentials haven't been configured yet."
      >
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-semibold tracking-tight">Setup needed</h3>
            <p className="text-sm text-foreground-muted">
              An admin needs to add the Google OAuth Client ID + Secret in{' '}
              <button
                type="button"
                onClick={() => navigate(settingsLinkFor('Google Analytics'))}
                className="text-accent hover:underline"
              >
                Settings → API keys
              </button>
              . Steps are outlined there; it takes one Google Cloud Console session.
            </p>
          </div>
          <div>
            <Button onClick={() => navigate(settingsLinkFor('Google Analytics'))}>
              <SettingsIcon className="size-4" /> Add OAuth credentials
            </Button>
          </div>
        </Card>
      </ToolPage>
    );
  }

  // Configured but not connected — show connect prompt.
  if (!status.connected) {
    return (
      <ToolPage
        eyebrow="Motionlinx"
        title="AI Traffic Report"
        icon={BarChart3}
        description="See which AI engines are sending real users to your sites."
      >
        <Card className="p-8 flex flex-col items-start gap-4 max-w-2xl">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-pressed">
            <LinkIcon className="size-5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-lg font-semibold tracking-tight">Connect Google Analytics</h3>
            <p className="text-sm text-foreground-muted">
              Sign in with the Google account that has access to your GA4 properties.
              We request read-only Analytics access — no data is ever written back.
            </p>
          </div>
          <Button onClick={handleConnect} disabled={connecting} size="lg">
            <LinkIcon className="size-4" />
            {connecting ? 'Redirecting…' : 'Connect Google Analytics'}
          </Button>
          <p className="text-xs text-foreground-subtle">
            Scope: <code className="font-mono">analytics.readonly</code>. Disconnect any
            time from Settings or this page.
          </p>
        </Card>
      </ToolPage>
    );
  }

  // Connected — full dashboard.
  return (
    <ToolPage
      eyebrow="Motionlinx"
      title="AI Traffic Report"
      icon={BarChart3}
      description={
        status.email ? (
          <span>
            Reading from <span className="text-foreground">{status.email}</span>
          </span>
        ) : (
          'Reading from your Google Analytics account.'
        )
      }
      actions={
        <>
          <Badge variant="mint">Connected</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            <Unlink className="size-3.5" />
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <PropertySelector
          properties={properties}
          selectedId={selected}
          onSelect={handleSelectProperty}
          error={propertiesError}
          loading={loadingProperties}
        />
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
        <span className="text-xs text-foreground-subtle">{dayCount} days</span>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchReport}
          disabled={loadingReport || !selected}
          className="ml-auto"
        >
          <RefreshCw className={loadingReport ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {loadingReport ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {reportError && (
        <Card className="p-4 border-rose bg-rose/20 text-sm text-rose-ink">
          {reportError}
        </Card>
      )}

      {!report && !reportError && (
        <Card className="p-8 text-center text-sm text-foreground-subtle">
          {loadingReport ? 'Pulling AI traffic from GA4…' : 'Pick a property to get started.'}
        </Card>
      )}

      {report && (
        <>
          <StatsCards totals={report.totals} engineCount={report.byEngine.length} />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TrafficChart data={report.timeseries} engines={report.enginesPresent} />
            </div>
            <EngineBreakdown engines={report.byEngine} />
          </div>
          <TopPagesTable pages={report.topPages} />
        </>
      )}
    </ToolPage>
  );
}
