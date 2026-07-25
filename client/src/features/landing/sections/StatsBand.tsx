import { useInView } from 'motion/react';
import { useRef } from 'react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';

const STATS = [
  { value: 27, suffix: '', label: 'Production tools' },
  { value: 70, suffix: '+', label: 'Citation publishers' },
  { value: 12, suffix: '', label: 'Schema types' },
  { value: 5, suffix: '', label: 'LLM crawlers tracked' },
];

export function StatsBand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });

  return (
    <section ref={ref} className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-12">
          <SectionEyebrow>By the numbers</SectionEyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            Calibrated, not marketing fluff.
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div className="rounded-2xl border border-border bg-surface p-7 h-full">
                <div className="text-5xl sm:text-6xl font-semibold tracking-tight text-foreground tabular-nums">
                  {inView ? <AnimatedNumber value={stat.value} /> : 0}
                  <span className="text-accent">{stat.suffix}</span>
                </div>
                <div className="text-sm text-foreground-muted mt-3 leading-snug">
                  {stat.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
