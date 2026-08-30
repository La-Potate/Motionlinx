import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, ArrowRight, Plus, Shield, Sparkles, ArrowLeft } from 'lucide-react';
import { billingService } from '@/shared/api/billing';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Wordmark } from '@/shared/components/Wordmark';
import { toast } from '@/shared/ui/sonner';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

type Plan = {
  id: 'personal' | 'business' | 'agency';
  title: string;
  blurb: string;
  price: number;
  credits: number;
  seatsAllowed: boolean;
  recommended?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: 'personal',
    title: 'Personal',
    blurb: 'For solo operators and founders validating ideas fast.',
    price: 50,
    credits: 250,
    seatsAllowed: false,
    features: [
      '1 seat included',
      'Full access to SERP & Local tools',
      'Schema + Technical Audit',
      'Weekly billing health summary',
    ],
  },
  {
    id: 'business',
    title: 'Business',
    blurb: 'For lean teams that need reliable monthly throughput.',
    price: 250,
    credits: 2000,
    seatsAllowed: true,
    recommended: true,
    features: [
      'Starts with 3 seats',
      '2K monthly credits auto-refill',
      'Priority queues for crawls',
      'Shared API key vault',
    ],
  },
  {
    id: 'agency',
    title: 'Agency',
    blurb: 'For agencies running multiple client workstreams.',
    price: 650,
    credits: 10000,
    seatsAllowed: true,
    features: [
      'Starts with 10 seats',
      '10K monthly credits auto-refill',
      'Activity & audit trail export',
      'White-label reports',
    ],
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [seats, setSeats] = useState<Record<string, number>>({
    personal: 1,
    business: 3,
    agency: 10,
  });
  const [loadingPlan, setLoadingPlan] = useState('');
  const [stripeReady, setStripeReady] = useState(true);

  useEffect(() => {
    billingService
      .getPlans()
      .then((data: any) => setStripeReady(data?.stripeConfigured !== false))
      .catch(() => setStripeReady(false));
  }, []);

  const onCheckout = async (planId: Plan['id']) => {
    setLoadingPlan(planId);
    try {
      const plan = PLANS.find((p) => p.id === planId)!;
      const s = plan.seatsAllowed ? Math.max(1, parseInt(String(seats[planId]), 10) || 1) : 1;
      const { url } = await billingService.startCheckout(planId, s);
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Unable to start checkout');
    } finally {
      setLoadingPlan('');
    }
  };

  const onTopUp = async () => {
    setLoadingPlan('topup');
    try {
      const { url } = await billingService.startTopUp();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Unable to start top-up');
      setLoadingPlan('');
    }
  };

  const isTrial = user?.role === 'trial';

  return (
    <div className="min-h-screen bg-background">
      {/* Slim header with back navigation. Trial users can't go back to the
         SEO Toolkit console (they get redirected), so we route them to logout instead. */}
      <motion.header
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <motion.div whileTap={{ scale: 0.96 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(isTrial ? '/trial' : '/dashboard')}
              className="gap-1.5 -ml-2"
            >
              <ArrowLeft className="size-4" />
              <span>{isTrial ? 'Back to trial' : 'Back to console'}</span>
            </Button>
          </motion.div>
          <Wordmark size="sm" />
        </div>
      </motion.header>

      <div className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Choose your workspace capacity
            </span>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-2xl">
              Credits and seats that scale with your roadmap.
            </h1>
            <p className="max-w-xl text-sm text-foreground-muted leading-relaxed">
              Every subscription refills credits monthly. Add seats on Business and Agency.
              Top-ups are always available if you spike usage.
            </p>
            <div className="flex items-center gap-4 text-xs text-foreground-subtle flex-wrap mt-2">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="size-3.5" />
                Secure Stripe checkout
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Cancel anytime
              </span>
            </div>
          </motion.div>

          {!stripeReady && (
            <Card className="border-butter">
              <CardContent className="flex items-start gap-3 p-4">
                <Shield className="size-4 text-butter-ink mt-0.5 shrink-0" />
                <div>
                  <strong className="text-butter-ink">Stripe not configured</strong>
                  <p className="text-sm text-foreground mt-1">
                    The workspace owner hasn't connected Stripe yet. Plans are visible but
                    checkout is disabled.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <motion.div
            variants={stagger.container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {PLANS.map((plan) => {
              const active = user?.plan === plan.id;
              return (
                <motion.div
                  key={plan.id}
                  variants={stagger.item}
                  whileHover={{ y: -3 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  layout
                >
                  <Card
                    className={cn(
                      'h-full transition-[border-color,box-shadow] duration-300 relative',
                      plan.recommended
                        ? 'border-accent shadow-elevation-md'
                        : 'hover:border-border-strong hover:shadow-elevation-md'
                    )}
                  >
                    {plan.recommended && (
                      <Badge
                        variant="accent"
                        className="absolute -top-3 right-5 shadow-elevation-sm"
                      >
                        Recommended
                      </Badge>
                    )}
                    <CardContent className="flex flex-col gap-5 p-6 h-full">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                          {plan.title}
                        </span>
                        <p className="text-sm text-foreground-muted leading-relaxed">
                          {plan.blurb}
                        </p>
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tabular-nums tracking-tight">
                          ${plan.price}
                        </span>
                        <span className="text-sm text-foreground-muted">/mo</span>
                      </div>
                      <div className="text-xs text-foreground-subtle uppercase tracking-wider">
                        {plan.credits.toLocaleString()} credits / month
                      </div>

                      <ul className="flex flex-col gap-2 text-sm">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <span className="flex size-4 items-center justify-center rounded-full bg-mint text-mint-ink shrink-0 mt-0.5">
                              <Check className="size-2.5" strokeWidth={3} />
                            </span>
                            <span className="text-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>

                      {plan.seatsAllowed && (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`seats-${plan.id}`} className="text-xs">
                            Seats
                          </Label>
                          <Input
                            id={`seats-${plan.id}`}
                            type="number"
                            min={plan.id === 'business' ? 3 : 10}
                            value={seats[plan.id]}
                            onChange={(e) =>
                              setSeats((s) => ({
                                ...s,
                                [plan.id]: parseInt(e.target.value, 10) || 1,
                              }))
                            }
                            className="h-8 w-24"
                          />
                        </div>
                      )}

                      <Button
                        size="lg"
                        variant={plan.recommended ? 'default' : 'secondary'}
                        onClick={() => onCheckout(plan.id)}
                        disabled={!stripeReady || loadingPlan === plan.id || active}
                        className="mt-auto"
                      >
                        {active ? (
                          'Current plan'
                        ) : loadingPlan === plan.id ? (
                          'Starting…'
                        ) : (
                          <>
                            Start {plan.title}
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          <Card>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6">
              <div>
                <h3 className="text-base font-semibold tracking-tight">Need a quick refill?</h3>
                <p className="text-sm text-foreground-muted mt-1">
                  Add 1,000 credits to any active subscription for $79. Credits don't expire.
                </p>
              </div>
              <Button
                size="lg"
                variant="accent"
                onClick={onTopUp}
                disabled={!stripeReady || loadingPlan === 'topup'}
              >
                <Plus className="size-4" />
                {loadingPlan === 'topup' ? 'Starting…' : 'Buy 1,000 credits'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
