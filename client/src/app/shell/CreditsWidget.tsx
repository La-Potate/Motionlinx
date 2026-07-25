import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '@/contexts/AuthContext';
import { billingService } from '@/shared/api/billing';
import { toast } from '@/shared/ui/sonner';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { cn } from '@/shared/lib/cn';

export function CreditsWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const isMetered = user.role !== 'admin' && user.role !== 'trial';
  const remaining = typeof user.credits === 'number' ? Math.max(user.credits, 0) : 0;
  const limit = user.credit_limit || 0;
  const out = isMetered && remaining <= 0;

  const onTopUp = async () => {
    try {
      setLoading(true);
      const { url } = await billingService.startTopUp();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Unable to start top-up');
      setLoading(false);
    }
  };

  if (!isMetered) {
    return (
      <button
        type="button"
        onClick={() => navigate('/pricing')}
        className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground-muted hover:text-foreground hover:border-border-strong transition-colors"
      >
        <Zap className="size-3 text-accent" />
        {user.role === 'trial' ? 'Trial · Locked' : 'Unlimited'}
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={out ? () => navigate('/pricing') : onTopUp}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        out
          ? 'border-rose bg-rose/40 text-rose-ink hover:bg-rose/60'
          : 'border-border bg-surface text-foreground hover:border-border-strong'
      )}
    >
      <span className="flex size-1.5 rounded-full bg-accent" />
      <span className="tabular-nums">
        <AnimatedNumber value={remaining} />
        {limit > 0 && <span className="text-foreground-subtle">/{limit}</span>}
      </span>
      <span className="hidden sm:inline text-foreground-subtle">credits</span>
      {!out && <Plus className="size-3 text-foreground-subtle" />}
    </motion.button>
  );
}
