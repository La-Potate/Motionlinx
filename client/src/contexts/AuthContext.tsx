import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '@/shared/api/auth';
import serpService from '@/shared/api/serp';

type AuthUser = any;
type SessionResponse = { token?: string; user?: AuthUser } | null | undefined;

type AuthContextType = {
  user: AuthUser;
  loading: boolean;
  login: (credentials: any) => Promise<any>;
  loginWithGoogle: (credential: any) => Promise<any>;
  signup: (userData: any) => Promise<any>;
  logout: () => Promise<void> | void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearSessionState = useCallback(() => {
    authService.clearSession();
    serpService.resetCache();
    setUser(null);
    clearRefreshTimer();
  }, [clearRefreshTimer]);

  const handleLogout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error', error);
    } finally {
      clearSessionState();
    }
  }, [clearSessionState]);

  const scheduleRefresh = useCallback(
    (token: string | null | undefined) => {
      if (!token) {
        return;
      }
      clearRefreshTimer();
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAtMs = payload.exp * 1000;
        const refreshDelay = Math.max(expiresAtMs - Date.now() - 2 * 60 * 1000, 30 * 1000);
        refreshTimerRef.current = setTimeout(async () => {
          try {
            const session = await authService.refreshSession();
            if (session?.token && session?.user) {
              serpService.resetCache();
              setUser(session.user);
              scheduleRefresh(session.token);
            }
          } catch (error) {
            console.error('Session refresh failed', error);
            await handleLogout();
          }
        }, refreshDelay);
      } catch (error) {
        console.error('Failed to schedule token refresh', error);
      }
    },
    [clearRefreshTimer, handleLogout]
  );

  const persistSession = useCallback(
    (session: SessionResponse) => {
      if (!session?.user || !session?.token) {
        return;
      }
      serpService.resetCache();
      setUser(session.user);
      scheduleRefresh(session.token);
    },
    [scheduleRefresh]
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const token = authService.getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await authService.verifyToken();
        if (isMounted) {
          setUser(userData);
          scheduleRefresh(token);
        }
      } catch (error) {
        try {
          const session = await authService.refreshSession();
          if (isMounted && session?.user && session?.token) {
            persistSession(session);
          }
        } catch (refreshError) {
          console.error('Failed to restore session', refreshError);
          clearSessionState();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
      clearRefreshTimer();
    };
  }, [persistSession, clearSessionState, scheduleRefresh, clearRefreshTimer]);

  const login = async (credentials: any) => {
    const response = await authService.login(credentials);
    persistSession(response);
    return response;
  };

  const loginWithGoogle = async (credential: any) => {
    const response = await authService.googleLogin(credential);
    persistSession(response);
    return response;
  };

  const signup = async (userData: any) => {
    const response = await authService.signup(userData);
    return response;
  };

  const logout = () => handleLogout();

  const value = {
    user,
    login,
    loginWithGoogle,
    signup,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}


