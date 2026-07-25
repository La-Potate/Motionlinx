import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Shield, Zap, Database } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { DashboardMockup } from '../mockups/DashboardMockup';
import { MagneticButton } from '../effects/MagneticButton';
import { AnimatedUnderline } from '../effects/AnimatedUnderline';

const HEADLINE_WORDS = ['Operate', 'your', 'growth', 'engine', 'from', 'one'];

export function Hero() {
  const navigate = useNavigate();

  const scrollToFeatures = () => {
    document
      .getElementById('features')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Subtle dot grid — masked to a soft ellipse for atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        {/* LEFT — copy */}
        <div className="flex flex-col gap-7 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/80 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-pressed"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
            </span>
            Production console · v0.6
          </motion.div>

          <h1 className="text-[44px] sm:text-[60px] lg:text-[72px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground">
            {HEADLINE_WORDS.map((word, i) => (
              <motion.span
                key={`${word}-${i}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.44,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.18 + i * 0.05,
                }}
                className="inline-block mr-[0.22em]"
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.44,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.18 + HEADLINE_WORDS.length * 0.05,
              }}
              className="inline-block"
            >
              <AnimatedUnderline delay={0.95}>workspace.</AnimatedUnderline>
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl text-[17px] leading-relaxed text-foreground-muted"
          >
            Research, local SEO, SERP intelligence, schema automation and
            content generation in one credit-metered console — with a clear
            audit trail for every run.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.68, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center gap-3"
          >
            <MagneticButton
              size="xl"
              onClick={() => navigate('/signup')}
              className="gap-2"
              magneticStrength={10}
            >
              Start free trial
              <motion.span
                animate={{ x: [0, 3, 0] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  repeatDelay: 1.5,
                }}
                className="inline-flex"
              >
                <ArrowRight className="size-4" />
              </motion.span>
            </MagneticButton>
            <Button
              size="xl"
              variant="outline"
              onClick={scrollToFeatures}
              className="gap-2"
            >
              See the tools
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.82 }}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 text-xs text-foreground-subtle"
          >
            <span className="inline-flex items-center gap-1.5">
              <Shield className="size-3.5" />
              JWT + bcrypt auth
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5" />
              Per-route rate limits
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Database className="size-3.5" />
              Per-user audit trail
            </span>
          </motion.div>
        </div>

        {/* RIGHT — animated dashboard mockup */}
        <div className="flex items-center justify-center lg:justify-end">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}
