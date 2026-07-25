import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Search, Sparkles, PenTool } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';

const STEPS = [
  {
    n: '01',
    icon: Search,
    title: 'Research',
    desc: 'Query intent, volume, competitor citation gaps and crawler accessibility — in one pass.',
  },
  {
    n: '02',
    icon: Sparkles,
    title: 'Optimize',
    desc: 'Schema markup, technical audit, on-page rewrites for LLM surfaces and ranking heatmaps.',
  },
  {
    n: '03',
    icon: PenTool,
    title: 'Generate',
    desc: 'Long-form drafts using your shared system prompt, with a nine-step pipeline you can drive.',
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 70%', 'end 30%'],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      id="how"
      ref={ref}
      className="relative py-28 sm:py-36 bg-surface-muted/40 border-y border-border scroll-mt-24"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-16">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em]">
            From brief to publish in one session.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            Three phases. Each artifact persists per user — research notes,
            schema drafts, audit reports, generated articles. Nothing lives
            in a stray tab.
          </p>
        </Reveal>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Connecting line — draws as user scrolls past the section */}
          <motion.div
            aria-hidden
            style={{ scaleX: lineScale }}
            className="hidden md:block absolute left-[8%] right-[8%] top-[44px] h-px bg-accent origin-left"
          />

          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.12}>
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-7 h-full relative">
                <div className="flex items-center justify-between">
                  <motion.span
                    className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-elevation-sm"
                    whileHover={{ rotate: -4, scale: 1.05 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  >
                    <step.icon className="size-5" strokeWidth={1.75} />
                  </motion.span>
                  <span className="text-3xl font-semibold tracking-tight text-foreground-subtle tabular-nums">
                    {step.n}
                  </span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
