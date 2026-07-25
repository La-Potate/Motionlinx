import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Clock, Calendar, Sun, Moon, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { ToolCard } from '@/shared/components/ToolCard';
import { PRIMARY_TABS } from '@/app/nav-config';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [is24, setIs24] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  const isDay = now.getHours() >= 6 && now.getHours() < 18;

  const time = now.toLocaleTimeString('en-US', {
    hour12: !is24,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const hubs = PRIMARY_TABS.filter((t) => !['home', 'whiteboard'].includes(t.id));

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting / clock band */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <Card className="lg:col-span-2 p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Console
              </span>
              <h1 className="text-3xl sm:text-[34px] font-semibold tracking-tight text-foreground">
                {greeting}
                {user?.username && (
                  <>
                    , <span className="text-accent">{user.username}</span>
                  </>
                )}
                .
              </h1>
              <p className="text-sm text-foreground-muted max-w-md">
                Pick up where you left off, or open the command palette
                <kbd className="mx-1.5 inline-flex h-5 items-center rounded border border-border bg-surface-muted px-1.5 font-mono text-[10px] font-medium text-foreground-muted align-baseline">
                  ⌘K
                </kbd>
                to jump anywhere.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <div className="flex items-center gap-2 text-foreground">
                {isDay ? (
                  <Sun className="size-4 text-accent" />
                ) : (
                  <Moon className="size-4 text-accent" />
                )}
                <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
                  {time}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground-muted">
                <Calendar className="size-3" />
                {date}
              </div>
              <div className="mt-2 inline-flex rounded-full border border-border p-0.5">
                <FormatToggle on={is24} onClick={() => setIs24(true)} label="24h" />
                <FormatToggle on={!is24} onClick={() => setIs24(false)} label="12h" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 flex flex-col gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Workspace
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Whiteboard</h2>
          <p className="text-sm text-foreground-muted leading-relaxed">
            A free-form canvas for diagrams, screenshots and quick notes — saved per user.
          </p>
          <Button
            variant="accent"
            className="self-start mt-auto"
            onClick={() => navigate('/whiteboard')}
          >
            Open whiteboard
            <ArrowRight className="size-4" />
          </Button>
        </Card>
      </motion.div>

      {/* Quick-access hubs */}
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
              Browse
            </span>
            <h2 className="text-lg font-semibold tracking-tight">Open a hub</h2>
          </div>
        </div>
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {hubs.map((tab) => {
            const Icon = tab.icon!;
            return (
              <motion.div key={tab.id} variants={stagger.item}>
                <ToolCard
                  title={tab.label}
                  icon={Icon}
                  route={tab.path}
                  description={describeHub(tab.id)}
                  meta="Hub"
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

function describeHub(id: string) {
  switch (id) {
    case 'local-business':
      return 'Keyword research, audits, citations, heatmap.';
    case 'web-search':
      return 'Technical audit, schema, bulk checkers, site tree.';
    case 'ai-seo':
      return 'AI surface coverage and crawler access.';
    case 'content':
      return 'Press release, blog post, beyond-intent.';
    default:
      return '';
  }
}

function FormatToggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-colors',
        on ? 'text-foreground' : 'text-foreground-subtle hover:text-foreground'
      )}
    >
      {on && (
        <motion.span
          layoutId="format-toggle"
          className="absolute inset-0 rounded-full bg-surface-muted"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}
