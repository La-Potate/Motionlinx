import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Sparkles,
  type LucideIcon,
  BarChart3,
  Bot,
  LineChart,
  PencilRuler,
  Megaphone,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Wordmark } from '@/shared/components/Wordmark';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

type AppCard = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: 'orange' | 'mint' | 'sky' | 'lavender' | 'butter';
  /** Internal route to open. */
  to: string;
  /** Available now vs. teaser. */
  status: 'live' | 'soon';
};

const APPS: AppCard[] = [
  {
    id: 'seo-toolkit',
    name: 'SEO Toolkit',
    tagline: 'Research, audit, optimise.',
    description:
      'Local Business, Web Search, AI SEO and Content — every SEO surface from one credit-metered console.',
    icon: Sparkles,
    accent: 'orange',
    to: '/seo-toolkit',
    status: 'live',
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    tagline: 'Full SEO analysis, per project.',
    description:
      'Connects to Google Search Console and runs a complete audit — technical, content, internal linking, and AI-search readiness — with prioritised tasks and run-over-run diffing.',
    icon: Bot,
    accent: 'lavender',
    to: '/AI-Assistant',
    status: 'live',
  },
  {
    id: 'ai-traffic-report',
    name: 'AI Traffic Report',
    tagline: 'See which AI is sending you visitors.',
    description:
      'Connects to Google Analytics and breaks down AI traffic by engine — ChatGPT, Gemini, Perplexity, Claude and more — across every property you have access to.',
    icon: LineChart,
    accent: 'sky',
    to: '/ai-traffic-report',
    status: 'live',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    tagline: 'One pane for every channel.',
    description:
      'Unified GA4, Ads, and CRM dashboards with anomaly alerts. Lands in the next wave.',
    icon: BarChart3,
    accent: 'mint',
    to: '/seo-toolkit',
    status: 'soon',
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'Brand-safe creative.',
    description:
      'Asset generation, on-brand variants and approvals — designed to plug into the SEO Toolkit briefs.',
    icon: PencilRuler,
    accent: 'lavender',
    to: '/seo-toolkit',
    status: 'soon',
  },
  {
    id: 'outreach',
    name: 'Outreach',
    tagline: 'Pitch, follow up, close.',
    description:
      'Cold outreach sequences, link-building workflows and reply tracking — built for SEO teams.',
    icon: Megaphone,
    accent: 'mint',
    to: '/seo-toolkit',
    status: 'soon',
  },
  {
    id: 'automations',
    name: 'Automations',
    tagline: 'Wire tools together.',
    description:
      'Triggered workflows across Motionlinx apps — schedule audits, route alerts, sync to your stack.',
    icon: Workflow,
    accent: 'butter',
    to: '/seo-toolkit',
    status: 'soon',
  },
];

const accentTile: Record<AppCard['accent'], string> = {
  orange: 'bg-accent-soft text-accent-pressed',
  mint: 'bg-mint/40 text-mint-ink',
  sky: 'bg-sky/40 text-sky-ink',
  lavender: 'bg-lavender/40 text-lavender-ink',
  butter: 'bg-butter/50 text-butter-ink',
};

export default function ToolkitHubPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Toolkit · Motionlinx';
    return () => {
      document.title = prev;
    };
  }, []);

  const openApp = (app: AppCard) => {
    if (app.status === 'soon') return;
    if (loading) return;
    if (user) {
      navigate(app.to);
    } else {
      navigate(`/signin?next=${encodeURIComponent(app.to)}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,theme(colors.accent-soft/60),transparent_70%)]"
      />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 sm:px-6 py-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity hover:opacity-80"
          aria-label="Motionlinx home"
        >
          <Wordmark size="md" />
        </button>

        {!loading && (
          user ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-foreground-muted">
                Signed in as <span className="text-foreground">{user.username}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => navigate('/seo-toolkit')}>
                Console
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => navigate('/signin')}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => navigate('/signup')}>
                Sign up
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          )
        )}
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1280px] px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3 pt-10 pb-12 max-w-2xl"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            Motionlinx Toolkit
          </span>
          <h1 className="text-3xl sm:text-[40px] font-semibold tracking-tight leading-[1.1]">
            Pick a toolkit.
          </h1>
          <p className="text-[15px] text-foreground-muted leading-relaxed">
            Every Motionlinx app shares one account, one credit balance, and
            one workspace. Open the SEO Toolkit today — the rest light up as
            we ship them.
          </p>
        </motion.div>

        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {APPS.map((app) => {
            const Icon = app.icon;
            const isLive = app.status === 'live';
            return (
              <motion.div key={app.id} variants={stagger.item}>
                <Card
                  role={isLive ? 'button' : undefined}
                  tabIndex={isLive ? 0 : -1}
                  onClick={() => openApp(app)}
                  onKeyDown={(e) => {
                    if (isLive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      openApp(app);
                    }
                  }}
                  className={cn(
                    'group relative flex h-full flex-col gap-4 p-6 transition-all duration-200',
                    isLive
                      ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-elevation-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      : 'opacity-70 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={cn(
                        'flex size-11 items-center justify-center rounded-xl shadow-elevation-sm shrink-0',
                        accentTile[app.accent]
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    {!isLive && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle rounded-full border border-border px-2 py-0.5">
                        Soon
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {app.name}
                    </h2>
                    <p className="text-xs text-accent font-medium">{app.tagline}</p>
                  </div>

                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {app.description}
                  </p>

                  {isLive && (
                    <div className="mt-auto pt-2 flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                      {user ? 'Open' : 'Sign in to open'}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="mt-12 text-center text-xs text-foreground-subtle">
          More apps land regularly. Have a request?{' '}
          <a
            href="mailto:hello@motionlinx.app"
            className="text-foreground-muted hover:text-foreground transition-colors underline underline-offset-2"
          >
            hello@motionlinx.app
          </a>
        </div>
      </main>
    </div>
  );
}
