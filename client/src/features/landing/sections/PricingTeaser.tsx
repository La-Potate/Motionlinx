import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, ArrowRight } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';

const PLANS = [
  {
    id: 'personal',
    title: 'Personal',
    blurb: 'Solo operators validating ideas fast.',
    price: 50,
    credits: '250 credits / mo',
    features: ['1 seat', 'Full tool access', 'Weekly billing summary'],
  },
  {
    id: 'business',
    title: 'Business',
    blurb: 'Lean teams that need reliable monthly throughput.',
    price: 250,
    credits: '2,000 credits / mo',
    features: ['Starts at 3 seats', 'Priority crawl queues', 'Shared API vault'],
    recommended: true,
  },
  {
    id: 'agency',
    title: 'Agency',
    blurb: 'Agencies running multiple client workstreams.',
    price: 650,
    credits: '10,000 credits / mo',
    features: ['Starts at 10 seats', 'Audit trail export', 'White-label reports'],
  },
];

export function PricingTeaser() {
  const navigate = useNavigate();
  return (
    <section
      id="pricing"
      className="relative py-28 sm:py-36 bg-surface-muted/40 border-y border-border scroll-mt-24"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-14">
          <SectionEyebrow>Pricing</SectionEyebrow>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em]">
            Plans that scale with the work.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            Credits refill monthly. Top-ups always available. Cancel any time.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                className={cn(
                  'relative flex h-full flex-col gap-5 rounded-2xl border bg-surface p-7 transition-[border-color,box-shadow] duration-300',
                  plan.recommended
                    ? 'border-accent shadow-elevation-md'
                    : 'border-border hover:border-border-strong hover:shadow-elevation-md'
                )}
              >
                {plan.recommended && (
                  <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-foreground shadow-elevation-sm">
                    Recommended
                  </span>
                )}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-foreground-subtle">
                    {plan.title}
                  </span>
                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {plan.blurb}
                  </p>
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tabular-nums tracking-tight">
                      ${plan.price}
                    </span>
                    <span className="text-sm text-foreground-muted">/mo</span>
                  </div>
                  <div className="text-xs uppercase tracking-wider text-foreground-subtle mt-1">
                    {plan.credits}
                  </div>
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
                <Button
                  variant={plan.recommended ? 'default' : 'secondary'}
                  className="mt-auto gap-1.5"
                  onClick={() => navigate('/signup')}
                >
                  Start {plan.title}
                  <ArrowRight className="size-3.5" />
                </Button>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center">
          <a
            href="/pricing"
            onClick={(e) => {
              e.preventDefault();
              navigate('/pricing');
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-pressed transition-colors"
          >
            See full pricing details
            <ArrowRight className="size-3.5" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
