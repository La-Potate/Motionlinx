import { motion } from 'motion/react';
import {
  Server,
  Database,
  CreditCard,
  Sparkles,
  Search,
  Globe,
  Lock,
} from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';

const STACK = [
  { icon: Server, name: 'Node 20', detail: 'Express API monolith' },
  { icon: Database, name: 'SQLite + WAL', detail: 'Per-user filesystem' },
  { icon: Lock, name: 'JWT + bcrypt', detail: 'Refresh-token rotation' },
  { icon: CreditCard, name: 'Stripe', detail: 'Webhook signature checks' },
  { icon: Sparkles, name: 'Anthropic Claude', detail: 'Content generation' },
  { icon: Search, name: 'DataForSEO', detail: 'Keyword + SERP data' },
  { icon: Globe, name: 'Playwright', detail: 'Pooled browser scraping' },
];

export function TechStack() {
  return (
    <section className="py-24 sm:py-28 border-y border-border bg-surface-muted/40">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-12">
          <SectionEyebrow>Under the hood</SectionEyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            Engineered on a stack you can audit.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            No black boxes. Open-source primitives, signed webhooks,
            per-user filesystem isolation, and a clear audit trail across
            every credit-priced API call.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {STACK.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.05} y={12}>
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="flex flex-col items-start gap-2.5 rounded-xl border border-border bg-surface p-4 h-full"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed">
                  <item.icon className="size-4" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tracking-tight">
                    {item.name}
                  </span>
                  <span className="text-[11px] text-foreground-muted leading-snug">
                    {item.detail}
                  </span>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
