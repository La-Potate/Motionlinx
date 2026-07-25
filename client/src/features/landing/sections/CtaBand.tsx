import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { Button } from '@/shared/ui/button';

export function CtaBand() {
  const navigate = useNavigate();
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Decorative concentric rings — slow breathing pulse */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="size-[800px] rounded-full bg-accent-soft/40" />
        <div className="absolute size-[560px] rounded-full bg-accent-soft/70" />
        <div className="absolute size-[320px] rounded-full bg-accent-soft" />
      </motion.div>

      <div className="relative mx-auto max-w-[800px] px-4 sm:px-6 text-center">
        <Reveal className="flex flex-col items-center gap-6">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            Ready when you are
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.02em] leading-[1.05]">
            Pick a plan or start a{' '}
            <motion.span
              className="text-accent inline-block"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.18 }}
            >
              trial.
            </motion.span>
            <br />
            Your workspace stays.
          </h2>
          <p className="text-base text-foreground-muted max-w-xl">
            Sign up in under five minutes. Cancel any time. Credits never
            expire. Your projects, notes and audit history survive plan
            changes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <Button size="xl" onClick={() => navigate('/signup')} className="gap-2">
              Start free trial
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="xl"
              variant="outline"
              onClick={() => navigate('/pricing')}
            >
              View pricing
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
