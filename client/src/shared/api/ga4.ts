import authenticatedFetch from './httpClient';

type FetchResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<any>;
  text: () => Promise<string>;
};

export type Ga4Property = {
  id: string;
  displayName: string;
  accountId: string;
  accountName: string;
};

export type EngineTotals = {
  engineId: string;
  engineName: string;
  color: string;
  sessions: number;
  users: number;
  engagedSessions: number;
};

export type TimeseriesPoint = {
  date: string;
  total: number;
  perEngine: Record<string, number>;
};

export type TopPage = {
  page: string;
  engineId: string;
  engineName: string;
  sessions: number;
};

export type AiEngineMeta = {
  id: string;
  name: string;
  color: string;
  hostnames: string[];
};

export type AiTrafficReport = {
  totals: {
    sessions: number;
    users: number;
    engagedSessions: number;
    engagementRate: number;
  };
  byEngine: EngineTotals[];
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  enginesPresent: AiEngineMeta[];
};

export type Ga4Status = {
  oauthConfigured: boolean;
  connected: boolean;
  email: string | null;
};

async function handle<T>(res: FetchResponse): Promise<T> {
  // Express's SPA catch-all returns index.html when the API route isn't
  // mounted (typical sign: backend was restarted onto stale code, or a route
  // file failed to load). Detect HTML up front so the dashboard surfaces a
  // useful error instead of getting `null` JSON and hanging on a skeleton.
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const err = new Error(
      'The /api/ga4 route returned HTML instead of JSON. The backend is likely running stale code — restart the server.'
    ) as any;
    err.status = res.status;
    err.code = 'route_not_mounted';
    throw err;
  }

  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const err = new Error(body?.message || body?.error || `HTTP ${res.status}`) as any;
    err.status = res.status;
    err.code = body?.error;
    throw err;
  }

  const body = await res.json();
  if (body === null || body === undefined) {
    const err = new Error('Empty response from the GA4 API') as any;
    err.status = res.status;
    err.code = 'empty_response';
    throw err;
  }
  return body as T;
}

export const ga4Service = {
  async status(): Promise<Ga4Status> {
    const res = await authenticatedFetch('/api/ga4/status', { method: 'GET' });
    return handle<Ga4Status>(res);
  },
  async startConnect(): Promise<{ url: string }> {
    const res = await authenticatedFetch('/api/ga4/auth/start', { method: 'POST' });
    return handle<{ url: string }>(res);
  },
  async disconnect(): Promise<{ success: boolean }> {
    const res = await authenticatedFetch('/api/ga4/disconnect', { method: 'POST' });
    return handle<{ success: boolean }>(res);
  },
  async listProperties(): Promise<{ properties: Ga4Property[] }> {
    const res = await authenticatedFetch('/api/ga4/properties', { method: 'GET' });
    return handle<{ properties: Ga4Property[] }>(res);
  },
  async runReport(params: {
    propertyId: string;
    startDate: string;
    endDate: string;
  }): Promise<AiTrafficReport> {
    const qs = new URLSearchParams({
      propertyId: params.propertyId,
      startDate: params.startDate,
      endDate: params.endDate,
    });
    const res = await authenticatedFetch(`/api/ga4/report?${qs.toString()}`, { method: 'GET' });
    return handle<AiTrafficReport>(res);
  },
};
