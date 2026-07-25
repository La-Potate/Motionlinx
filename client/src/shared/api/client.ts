import axios from 'axios';

/**
 * Single axios instance for the whole app. Owns:
 *   - Base URL from VITE_API_URL (defaults to '/api')
 *   - Auth header injection from localStorage
 *   - 401 → refresh-token retry queue
 *   - JSON content-type defaults
 *
 * Existing services that already use their own axios instances can be migrated
 * to this incrementally. New code should always import from here.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Inject Authorization header from localStorage on every request.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Refresh queue ----
type Waiter = (token: string | null) => void;
let isRefreshing = false;
let waiters: Waiter[] = [];

function notifyWaiters(token: string | null) {
  waiters.forEach((cb) => cb(token));
  waiters = [];
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function refreshSession() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('no_refresh_token');
  const { data } = await axios.post(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (data?.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    if (data.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    return data.token;
  }
  throw new Error('refresh_failed');
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (!original || original._retried) return Promise.reject(error);

    const status = error.response?.status;
    if (status !== 401 && status !== 403) return Promise.reject(error);

    // Don't try to refresh while hitting the auth endpoints themselves.
    if (original.url?.includes('/auth/login') || original.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    original._retried = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waiters.push((newToken) => {
          if (!newToken) return reject(error);
          original.headers.Authorization = `Bearer ${newToken}`;
          resolve(apiClient(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const newToken = await refreshSession();
      isRefreshing = false;
      notifyWaiters(newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshErr) {
      isRefreshing = false;
      notifyWaiters(null);
      clearSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
      return Promise.reject(refreshErr);
    }
  },
);

export default apiClient;
