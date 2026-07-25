import { motion } from 'motion/react';
import { Shield, Lock, FileCheck } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';

const PILLARS = [
  {
    icon: Lock,
    title: 'Auth',
    points: [
      'JWT + bcrypt(12)',
      'Refresh-token rotation',
      'Per-route rate limits',
      'Account lockout after 6 failures',
    ],
  },
  {
    icon: FileCheck,
    title: 'Data',
    points: [
      'Per-user filesystem isolation',
      'SQLite WAL journaling',
      'USERDATA_PATH archival',
      'Audit trail per credit charge',
    ],
  },
  {
    icon: Shield,
    title: 'Billing',
    points: [
      'Stripe webhook signature verified',
      'Fail-closed in production',
      'Credit reconciliation on every checkout',
      'Refunds via Stripe dashboard',
    ],
  },
];

export function SecurityBand() {
  return (
    <section className="py-28 sm:py-36">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-14">
          <SectionEyebrow>Security & data</SectionEyebrow>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em]">
            Boring where it counts.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            Auth, data, and billing follow the unglamorous best practices
            — so the interesting work lives in your tools, not your incident
            log.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                className="relative rounded-2xl border border-border bg-surface p-7 h-full overflow-hidden"
              >
                {/* Decorative orbit ring on hover */}
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-accent-soft/0 transition-colors"
                  whileHover={{ backgroundColor: 'var(--accent-soft)' }}
                />
                <div className="relative flex flex-col gap-5">
                  <motion.span
                    whileHover={{ rotate: -8, scale: 1.05 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-elevation-sm"
                  >
                    <pillar.icon className="size-5" strokeWidth={1.75} />
                  </motion.span>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {pillar.title}
                  </h3>
                  <ul className="flex flex-col gap-2.5 text-sm text-foreground-muted">
                    {pillar.points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <span className="mt-1.5 inline-block size-1 rounded-full bg-accent shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
