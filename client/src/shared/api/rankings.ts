import authenticatedFetch from './httpClient';

/**
 * Rank Tracker API.
 *
 * The backend for this has been complete and tested since before the UI
 * existed — fourteen endpoints with no client at all. This wraps them.
 *
 * Note the credential split: everything here works with no API key except
 * `refreshBusiness`, which resolves positions through Google Custom Search.
 * `trackKeyword` accepts a position directly, so the tool is fully usable by
 * entering positions by hand.
 */

export type Business = {
  id: number;
  name: string;
  website?: string;
  address?: string;
  category?: string;
  place_id?: string;
  keyword_count?: number;
  tracked_keywords?: number;
  competitor_count?: number;
  average_position?: number | null;
  best_position?: number | null;
  worst_position?: number | null;
  last_checked_at?: string | null;
};

export type Keyword = {
  id: number;
  business_id: number;
  keyword: string;
  search_volume?: number | null;
  difficulty?: number | null;
  country?: string;
  language?: string;
  device?: string;
  target_url?: string;
  last_position?: number | null;
  best_position?: number | null;
  worst_position?: number | null;
  last_checked_at?: string | null;
  status?: string;
  notes?: string;
};

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await authenticatedFetch(path, {
    method: init?.method || 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

const B = '/api/rankings';

export const rankingsService = {
  listBusinesses: () => call<Business[]>(`${B}/businesses`),

  createBusiness: (body: Partial<Business>) =>
    call<{ id: number }>(`${B}/businesses`, { method: 'POST', body }),

  listKeywords: (businessId: number) =>
    call<Keyword[]>(`${B}/businesses/${businessId}/keywords`),

  addKeyword: (businessId: number, body: Partial<Keyword>) =>
    call<{ keyword: Keyword }>(`${B}/businesses/${businessId}/keywords`, {
      method: 'POST',
      body,
    }),

  deleteKeyword: (keywordId: number) =>
    call<{ message: string }>(`${B}/keywords/${keywordId}`, { method: 'DELETE' }),

  /** Record a position. Pass one explicitly to log it without any API key. */
  trackKeyword: (keywordId: number, body: Record<string, unknown>) =>
    call<{ success: boolean; position: number | null }>(`${B}/keywords/${keywordId}/track`, {
      method: 'POST',
      body,
    }),

  keywordHistory: (keywordId: number) =>
    call<any[]>(`${B}/keywords/${keywordId}/history`),

  /** Re-checks every keyword via Google Custom Search — needs a key and CX. */
  refreshBusiness: (businessId: number) =>
    call<{ success: boolean; results: any[] }>(`${B}/businesses/${businessId}/refresh`, {
      method: 'POST',
      body: {},
    }),

  listCompetitors: (businessId: number) =>
    call<any[]>(`${B}/businesses/${businessId}/competitors`),
  addCompetitor: (businessId: number, body: Record<string, unknown>) =>
    call<{ id: number }>(`${B}/businesses/${businessId}/competitors`, { method: 'POST', body }),

  listBacklinks: (businessId: number) => call<any[]>(`${B}/businesses/${businessId}/backlinks`),
  addBacklink: (businessId: number, body: Record<string, unknown>) =>
    call<{ id: number }>(`${B}/businesses/${businessId}/backlinks`, { method: 'POST', body }),

  listTraffic: (businessId: number) => call<any[]>(`${B}/businesses/${businessId}/traffic`),
  addTraffic: (businessId: number, body: Record<string, unknown>) =>
    call<{ id: number }>(`${B}/businesses/${businessId}/traffic`, { method: 'POST', body }),
};

export default rankingsService;
