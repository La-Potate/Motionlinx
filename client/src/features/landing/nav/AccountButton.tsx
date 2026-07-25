import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/shared/ui/button';

/**
 * Auth-aware button shown in the LandingNav.
 * - Loading:        skeleton
 * - Trial user:     "Open Trial" → /trial
 * - Anyone else:    "Open Toolkit" → /toolkit (the hub decides per-app
 *                   whether to require sign-in)
 */
export function AccountButton() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="size-3.5 animate-spin" />
        Loading
      </Button>
    );
  }

  if (user?.role === 'trial') {
    return (
      <Button onClick={() => navigate('/trial')} className="gap-1.5">
        Open Trial
        <ArrowRight className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button onClick={() => navigate('/toolkit')} className="gap-1.5">
      Open Toolkit
      <ArrowRight className="size-3.5" />
    </Button>
  );
}
