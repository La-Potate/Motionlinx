// Legacy fetch-style facade — kept so existing api modules don't have to
// change their call sites. Under the hood it drives the same axios instance
// as the rest of the app (`./client.js`), so:
//   - Auth header is injected once, in one place.
//   - 401 → refresh-token retry is handled by ONE pipeline, not two.
//   - AbortSignal still works.
//
// New code should import `apiClient` from `@/shared/api/client` directly.
import { apiClient } from './client';

type FetchOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const buildBody = (body: any) => {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData) return body;
  if (typeof body === 'string') return body;
  return body; // axios serializes objects as JSON when Content-Type is application/json
};

/**
 * Wraps `apiClient.request(...)` and returns a Fetch-API-like Response object
 * so existing callers' `response.ok / json() / text() / status / headers.get(...)`
 * usage keeps working unchanged.
 *
 * Accepts: { method, body, headers, signal }
 * Returns: { ok, status, statusText, url, headers: { get(name) }, json(), text() }
 */
export async function authenticatedFetch(url: string, options: FetchOptions = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = options.body instanceof FormData;

  // apiClient has baseURL '/api', so strip a leading '/api/' if present to avoid
  // doubling it. Otherwise pass paths through as-is.
  const targetUrl = url.startsWith('/api/') ? url.slice(4) : url;

  const headers: Record<string, string> = { ...(options.headers || {}) };
  // Let axios set the Content-Type for FormData (with proper boundary).
  if (isFormData) delete headers['Content-Type'];

  const response = await apiClient.request({
    url: targetUrl,
    method,
    headers,
    data: method === 'GET' || method === 'HEAD' ? undefined : buildBody(options.body),
    signal: options.signal,
    // Never throw on non-2xx — legacy callers branch on `response.ok` themselves.
    validateStatus: () => true,
    // Preserve the raw response body in case callers want text().
    transformResponse: [(raw: any) => raw],
  });

  const rawText = typeof response.data === 'string' ? response.data : '';
  const headersObj: any = response.headers || {};

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText || '',
    url: response.config?.url || targetUrl,
    headers: {
      get(name: string) {
        if (!name) return null;
        const key = String(name).toLowerCase();
        const direct = headersObj[name] ?? headersObj[key];
        if (direct !== undefined) return direct;
        if (typeof headersObj.get === 'function') return headersObj.get(name);
        return null;
      },
    },
    async json() {
      if (!rawText) return null;
      try {
        return JSON.parse(rawText);
      } catch {
        return null;
      }
    },
    async text() {
      return rawText;
    },
  };
}

export default authenticatedFetch;
