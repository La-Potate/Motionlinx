import authenticatedFetch from './httpClient';

export type GscStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  email: string | null;
};

export type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
  verified: number | boolean;
  lastSyncedAt: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<any>;
};

async function handle<T>(res: FetchResponse): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const err = new Error(
      'The /api/gsc route returned HTML instead of JSON. The backend is likely running stale code — restart the server.',
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
    const err = new Error('Empty response from the GSC API') as any;
    err.status = res.status;
    err.code = 'empty_response';
    throw err;
  }
  return body as T;
}

export const gscService = {
  async status(): Promise<GscStatus> {
    const res = await authenticatedFetch('/api/gsc/status', { method: 'GET' });
    return handle<GscStatus>(res);
  },
  async startConnect(): Promise<{ url: string }> {
    const res = await authenticatedFetch('/api/gsc/auth/start', { method: 'POST' });
    return handle<{ url: string }>(res);
  },
  async disconnect(): Promise<{ success: boolean }> {
    const res = await authenticatedFetch('/api/gsc/disconnect', { method: 'POST' });
    return handle<{ success: boolean }>(res);
  },
  async sites(opts: { refresh?: boolean } = {}): Promise<{ properties: GscProperty[] }> {
    const qs = opts.refresh ? '?refresh=1' : '';
    const res = await authenticatedFetch(`/api/gsc/sites${qs}`, { method: 'GET' });
    return handle<{ properties: GscProperty[] }>(res);
  },
};
