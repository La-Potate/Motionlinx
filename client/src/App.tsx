import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Providers } from './app/providers';
import { AppRoutes } from './app/routes';
import { ALL_TOOLS, PRIMARY_TABS } from './app/nav-config';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function TitleManager() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname || '/';
    const tool = ALL_TOOLS.find((t) => t.path === path);
    const primary = PRIMARY_TABS.find(
      (t) => path === t.path || path.startsWith(`${t.path}/`)
    );
    let label = 'Motionlinx';
    if (path === '/') label = 'Motionlinx';
    else if (path === '/signin') label = 'Sign in';
    else if (path === '/signup') label = 'Sign up';
    else if (path === '/dashboard') label = 'Dashboard';
    else if (path === '/trial') label = 'Trial';
    else if (path === '/pricing') label = 'Pricing';
    else if (path === '/admin') label = 'Admin Panel';
    else if (path === '/settings') label = 'Settings';
    else if (tool) label = tool.label;
    else if (primary) label = primary.label;
    document.title = path === '/' ? 'Motionlinx' : `${label} · Motionlinx`;
  }, [location.pathname]);
  return null;
}

function AppTree() {
  return (
    <Providers>
      <Router>
        <TitleManager />
        <AppRoutes />
      </Router>
    </Providers>
  );
}

export default function App() {
  if (!GOOGLE_CLIENT_ID) {
    if (import.meta.env.DEV) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google login is disabled.');
    }
    return <AppTree />;
  }
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppTree />
    </GoogleOAuthProvider>
  );
}
