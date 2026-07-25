import authenticatedFetch from './httpClient';

export type SeoProject = {
  id: number;
  name: string;
  primaryDomain: string | null;
  notes: string;
  lastRunId: number | null;
  createdAt: string;
  updatedAt: string;
  properties: string[];
};

export type FindingStatus = 'open' | 'new' | 'done';
export type FindingCategory =
  | 'technical'
  | 'content'
  | 'onpage'
  | 'internal-linking'
  | 'geo'
  | 'opportunity';

export type AnalysisFinding = {
  id: number;
  category: FindingCategory | string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  impact: number;
  title: string;
  description: string | null;
  affectedUrls: string[];
  status: FindingStatus;
  firstSeenRunId: number | null;
  resolvedRunId: number | null;
};

export type ScoreBreakdownEntry = {
  key: string;
  label: string;
  weight: number;
  value: number | null;
};

export type ScoreCard = {
  score: number;
  breakdown: ScoreBreakdownEntry[];
};

export type AnalysisRun = {
  id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  scores: {
    overall: number;
    technical: ScoreCard;
    content: ScoreCard;
    geo: ScoreCard;
  } | null;
  summary: {
    reasons: string[];
    findingsByCategory: Record<string, number>;
  } | null;
  urlCount: number;
  prevRunId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
};

export type SitemapEntry = {
  siteUrl: string;
  sitemapUrl: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  warnings: number;
  errors: number;
  contentsCount: number;
};

export type JobView = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  meta: any;
} | null;

export type Dashboard = {
  project: SeoProject & { properties: string[] };
  run: AnalysisRun | null;
  prevScores: AnalysisRun['scores'] | null;
  findings: AnalysisFinding[];
  sitemaps: SitemapEntry[];
  hasSitemap: boolean;
  job: JobView;
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
      'The /api/ai-assistant route returned HTML instead of JSON. Restart the backend.',
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
  return (await res.json()) as T;
}

export const aiAssistantService = {
  async listProjects(): Promise<{ projects: SeoProject[] }> {
    const res = await authenticatedFetch('/api/ai-assistant/projects', { method: 'GET' });
    return handle<{ projects: SeoProject[] }>(res);
  },
  async createProject(payload: { name: string; siteUrls: string[]; primaryDomain?: string }): Promise<{ project: SeoProject }> {
    const res = await authenticatedFetch('/api/ai-assistant/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return handle<{ project: SeoProject }>(res);
  },
  async updateProject(id: number, payload: { name?: string; siteUrls?: string[]; primaryDomain?: string }): Promise<{ success: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return handle<{ success: boolean }>(res);
  },
  async deleteProject(id: number): Promise<{ success: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}`, { method: 'DELETE' });
    return handle<{ success: boolean }>(res);
  },
  async dashboard(id: number): Promise<Dashboard> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}/dashboard`, { method: 'GET' });
    return handle<Dashboard>(res);
  },
  async startRun(id: number): Promise<{ jobId: string; alreadyRunning?: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}/runs`, { method: 'POST' });
    return handle<{ jobId: string; alreadyRunning?: boolean }>(res);
  },
  async cancelRun(id: number): Promise<{ cancelled: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}/runs/current`, { method: 'DELETE' });
    return handle<{ cancelled: boolean }>(res);
  },
  async patchFinding(id: number, status: 'open' | 'done'): Promise<{ success: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/findings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return handle<{ success: boolean }>(res);
  },
  async submitSitemap(id: number, siteUrl: string, sitemapUrl: string): Promise<{ success: boolean }> {
    const res = await authenticatedFetch(`/api/ai-assistant/projects/${id}/sitemaps`, {
      method: 'POST',
      body: JSON.stringify({ siteUrl, sitemapUrl }),
    });
    return handle<{ success: boolean }>(res);
  },
};
