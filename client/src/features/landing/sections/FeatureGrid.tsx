import { motion } from 'motion/react';
import { MapPin, Globe, Sparkles, FileText, type LucideIcon } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';
import { TiltCard } from '../effects/TiltCard';
import { cn } from '@/shared/lib/cn';

type Hub = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'mint' | 'sky' | 'lavender' | 'butter';
  tools: number;
  anchor: string;
};

const HUBS: Hub[] = [
  {
    id: 'local',
    title: 'Local Business',
    description:
      'Keyword research, profile audits, citation hygiene and ranking heatmaps for businesses with a service footprint.',
    icon: MapPin,
    tone: 'mint',
    tools: 5,
    anchor: '#hub-local',
  },
  {
    id: 'web',
    title: 'Web Search',
    description:
      'Technical audit, schema automation, site tree generation and bulk index/HTTP checks at scale.',
    icon: Globe,
    tone: 'sky',
    tools: 7,
    anchor: '#hub-web',
  },
  {
    id: 'ai',
    title: 'AI SEO',
    description:
      'Surface coverage across GPT, Claude, Perplexity and Google-Extended — with optimisation suggestions you can ship.',
    icon: Sparkles,
    tone: 'lavender',
    tools: 5,
    anchor: '#hub-ai',
  },
  {
    id: 'content',
    title: 'Content',
    description:
      'Press releases, long-form blog drafting, and a nine-step pipeline that takes a keyword to a publish-ready article.',
    icon: FileText,
    tone: 'butter',
    tools: 3,
    anchor: '#hub-content',
  },
];

const TONE_CLASS: Record<Hub['tone'], string> = {
  mint: 'bg-mint text-mint-ink',
  sky: 'bg-sky text-sky-ink',
  lavender: 'bg-lavender text-lavender-ink',
  butter: 'bg-butter text-butter-ink',
};

export function FeatureGrid() {
  return (
    <section
      id="features"
      className="relative py-28 sm:py-36 scroll-mt-24"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal className="flex flex-col gap-4 max-w-2xl mb-14">
          <SectionEyebrow>Four hubs</SectionEyebrow>
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em] text-foreground">
            Four hubs, one workflow.
          </h2>
          <p className="text-base text-foreground-muted leading-relaxed">
            Move from research to publish without juggling twelve tabs.
            Twenty production tools sharing the same auth, credit, and audit
            trail.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HUBS.map((hub, i) => (
            <Reveal key={hub.id} delay={i * 0.08}>
              <TiltCard max={5} className="h-full">
                <a
                  href={hub.anchor}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .querySelector(hub.anchor)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="group relative flex h-full flex-col gap-5 rounded-xl border border-border bg-surface p-6 transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-elevation-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                <motion.span
                  whileHover={{ scale: 1.04, rotate: -3 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-xl shadow-elevation-sm',
                    TONE_CLASS[hub.tone]
                  )}
                >
                  <hub.icon className="size-5" strokeWidth={1.75} />
                </motion.span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {hub.title}
                  </h3>
                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {hub.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2 text-xs">
                  <span className="text-foreground-subtle uppercase tracking-wider">
                    {hub.tools} tools
                  </span>
                  <span className="text-accent font-medium group-hover:translate-x-0.5 transition-transform">
                    Explore →
                  </span>
                </div>
                </a>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
