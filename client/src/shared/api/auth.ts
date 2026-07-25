import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_STORAGE_KEY = 'token';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';

const getStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);
const getStoredRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

const setSessionTokens = ({ token, refreshToken }: { token?: string; refreshToken?: string }) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  }
};

const clearSessionTokens = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

const isAuthEndpoint = (url = '') =>
  ['/auth/login', '/auth/signup', '/auth/google', '/auth/refresh'].some((endpoint) =>
    url.includes(endpoint)
  );

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

type RefreshQueueEntry = { resolve: (token: string | null) => void; reject: (err: any) => void };
let isRefreshing = false;
let refreshQueue: RefreshQueueEntry[] = [];

const processQueue = (error: any, token: string | null = null) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  refreshQueue = [];
};

const handleRefresh = () => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return Promise.reject(new Error('Missing refresh token'));
  }
  return refreshClient.post('/auth/refresh', { refreshToken });
};

// Response interceptor to handle token expiration and errors
api.interceptors.response.use(
  (response) => response,
  (error: any) => {
    const originalRequest: any = error.config || {};

    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - server took too long to respond');
      error.message = 'Request timeout. Please check your connection.';
    }

    if (!error.response) {
      console.error('Network error - cannot reach server');
      error.message = 'Cannot connect to server. Please check if the server is running.';
      return Promise.reject(error);
    }

    const { status } = error.response;

    if (status === 429) {
      console.error('Rate limit exceeded');
    }

    if (status === 402) {
      error.message =
        error.response?.data?.error ||
        'You are out of credits. Please upgrade your plan to continue.';
      return Promise.reject(error);
    }

    if (status === 401 && !originalRequest._retry && !isAuthEndpoint(originalRequest.url || '')) {
      originalRequest._retry = true;
      if (!getStoredRefreshToken()) {
        clearSessionTokens();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject
          });
        });
      }

      isRefreshing = true;

      return new Promise((resolve, reject) => {
        handleRefresh()
          .then((response) => {
            const session = response.data || {};
            setSessionTokens(session);
            originalRequest.headers.Authorization = `Bearer ${session.token}`;
            processQueue(null, session.token);
            resolve(api(originalRequest));
          })
          .catch((refreshError) => {
            clearSessionTokens();
            processQueue(refreshError, null);
            reject(refreshError);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    if (status === 401) {
      clearSessionTokens();
    }

    return Promise.reject(error);
  }
);

const performRefreshSession = async () => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const response = await refreshClient.post('/auth/refresh', { refreshToken });
  setSessionTokens(response.data || {});
  return response.data;
};

export const authService = {
  async login(credentials: any) {
    try {
      const response = await api.post('/auth/login', credentials);
      setSessionTokens(response.data);
      localStorage.removeItem('userDeletedProjects');
      return response.data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.errors?.[0]?.msg ||
        error.message ||
        'Login failed';

      console.error('Login error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: errorMessage
      });

      throw new Error(errorMessage);
    }
  },

  async googleLogin(credential: any) {
    try {
      const response = await api.post('/auth/google', { credential });
      setSessionTokens(response.data);
      localStorage.removeItem('userDeletedProjects');
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Google sign-in failed';
      console.error('Google login error:', errorMessage);
      throw new Error(errorMessage);
    }
  },

  async signup(userData: any) {
    try {
      const response = await api.post('/auth/signup', userData);
      localStorage.removeItem('userDeletedProjects');
      return response.data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.errors?.[0]?.msg ||
        error.message ||
        'Signup failed';

      console.error('Signup error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: errorMessage
      });

      throw new Error(errorMessage);
    }
  },

  async refreshSession() {
    return performRefreshSession();
  },

  async logout() {
    const refreshToken = getStoredRefreshToken();
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      clearSessionTokens();
    }
  },

  async verifyToken() {
    try {
      const response = await api.post('/auth/validate');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Invalid token');
    }
  },

  getStoredToken,
  getStoredRefreshToken,
  clearSession: clearSessionTokens,
};

export const adminService = {
  async getUsers() {
    try {
      const response = await api.get('/admin/users');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch users');
    }
  },

  async createUser(userData: any) {
    try {
      const response = await api.post('/admin/users', userData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to create user');
    }
  },

  async updateUser(userId: any, userData: any) {
    try {
      const response = await api.put(`/admin/users/${userId}`, userData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to update user');
    }
  }
};
