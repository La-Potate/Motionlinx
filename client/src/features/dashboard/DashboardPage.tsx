import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, KeyRound, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ga4Service } from '@/shared/api/ga4';
import { gscService } from '@/shared/api/gsc';
import {
  ALL_TOOLS,
  REQUIREMENT_SETUP,
  STANDALONE_APPS,
  TOOL_SECTIONS,
  settingsLinkFor,
  toolsForSection,
  type Accent,
  type ToolEntry,
} from '@/app/nav-config';
import { accentBorderHover, accentText, accentTile } from '@/shared/lib/accent';
import { stagger } from '@/shared/motion/presets';
import { cn } from '@/shared/lib/cn';

type Connection = { connected: boolean; email?: string | null };

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ga4, setGa4] = useState<Connection | null>(null);
  const [gsc, setGsc] = useState<Connection | null>(null);

  // Both status endpoints are credit-exempt and cheap. Failures are
  // non-fatal — the dashboard still renders, the tile just reads "unknown".
  useEffect(() => {
    let alive = true;
    ga4Service
      .status()
      .then((s: any) => alive && setGa4({ connected: !!s?.connected, email: s?.email }))
      .catch(() => alive && setGa4({ connected: false }));
    gscService
      .status()
      .then((s: any) => alive && setGsc({ connected: !!s?.connected, email: s?.email }))
      .catch(() => alive && setGsc({ connected: false }));
    return () => {
      alive = false;
    };
  }, []);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const isMetered = user?.role !== 'admin' && user?.role !== 'trial';
  const credits = typeof user?.credits === 'number' ? Math.max(user.credits, 0) : 0;
  const creditLimit = user?.credit_limit || 0;
  const readyCount = ALL_TOOLS.filter((t) => !t.requires).length;
  const connectedCount = [ga4?.connected, gsc?.connected].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-10">
      {/* ---- Header ---- */}
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-2"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Dashboard
        </span>
        <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-foreground">
          {greeting}
          {user?.username && (
            <>
              , <span className="text-accent">{user.username}</span>
            </>
          )}
          .
        </h1>
        <p className="text-sm text-foreground-muted max-w-xl">
          Every tool is one click from here. Press
          <kbd className="mx-1.5 inline-flex h-5 items-center rounded border border-border bg-surface-muted px-1.5 font-mono text-[10px] font-medium text-foreground-muted align-baseline">
            ⌘K
          </kbd>
          to jump straight to one.
        </p>
      </motion.header>

      {/* ---- Overview ---- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={isMetered ? 'Credits left' : 'Credits'}
          value={isMetered ? credits.toLocaleString() : 'Unmetered'}
          hint={
            isMetered && creditLimit
              ? `of ${creditLimit.toLocaleString()} this month`
              : user?.role === 'admin'
                ? 'Admin account'
                : 'Trial account'
          }
          tone={isMetered && credits <= 0 ? 'warn' : 'default'}
          icon={Zap}
          onClick={isMetered ? () => navigate('/pricing') : undefined}
        />
        <StatTile
          label="Plan"
          value={user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : '—'}
          hint="Change in Pricing"
          onClick={() => navigate('/pricing')}
        />
        <StatTile
          label="Integrations"
          value={`${connectedCount}/2`}
          hint={connectedCount === 2 ? 'Analytics + Search Console' : 'Set up Google OAuth'}
          tone={connectedCount === 0 ? 'warn' : 'default'}
          onClick={() => navigate(settingsLinkFor('Search Console'))}
        />
        <StatTile
          label="Tools ready"
          value={`${readyCount}/${ALL_TOOLS.length}`}
          hint={`${ALL_TOOLS.length - readyCount} need an API key`}
          onClick={() => navigate('/settings?tab=apis')}
        />
      </section>

      {/* ---- Standalone apps ---- */}
      <section className="flex flex-col gap-4">
        <SectionHeading title="Apps" caption="Connected workspaces that run continuously." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STANDALONE_APPS.map((app) => {
            const Icon = app.icon;
            // Only apps that actually depend on a Google connection show a
            // connection badge. Keyed off the app's own requirement rather
            // than its position, so adding an app with no requirement (e.g.
            // Projects) does not inherit someone else's status.
            const conn =
              app.requires === 'Search Console'
                ? gsc
                : app.requires === 'Google Analytics'
                  ? ga4
                  : null;
            return (
              <div
                key={app.id}
                className={cn(
                  'group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-left',
                  'transition-[border-color,box-shadow] duration-200',
                  'hover:border-border-strong hover:shadow-elevation-md'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed shadow-elevation-sm shrink-0">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  {conn && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        conn.connected
                          ? 'border-mint text-mint-ink bg-mint/25'
                          : 'border-border text-foreground-subtle'
                      )}
                    >
                      {conn.connected ? (
                        <>
                          <Check className="size-3" /> Connected
                        </>
                      ) : (
                        <>
                          <KeyRound className="size-3" /> Not connected
                        </>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold tracking-tight">{app.label}</h3>
                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {app.description}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => navigate(app.path)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    Open
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  {conn && !conn.connected && app.requires && (
                    // Straight to the OAuth fields rather than Settings at large.
                    <button
                      type="button"
                      onClick={() => navigate(settingsLinkFor(app.requires!))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      <KeyRound className="size-3" />
                      Set up {app.requires}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- All tools, grouped ---- */}
      {TOOL_SECTIONS.map((section) => {
        const tools = toolsForSection(section.label);
        if (!tools.length) return null;
        const SectionIcon = section.icon;
        return (
          <section key={section.id} className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg shrink-0',
                    accentTile(section.accent)
                  )}
                >
                  <SectionIcon className="size-4" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-base font-semibold tracking-tight">
                    {section.label}
                  </h2>
                  <p className="text-xs text-foreground-muted truncate">{section.blurb}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(section.path)}
                className="hidden sm:inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Open hub
                <ArrowRight className="size-3" />
              </button>
            </div>

            <motion.div
              variants={stagger.container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
            >
              {tools.map((tool) => (
                <motion.div key={tool.id} variants={stagger.item}>
                  <ToolRow
                    tool={tool}
                    accent={section.accent}
                    onOpen={() => navigate(tool.path)}
                    onSetup={(req) => navigate(settingsLinkFor(req))}
                  />
                </motion.div>
              ))}
            </motion.div>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-foreground-muted">{caption}</p>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: typeof Zap;
  tone?: 'default' | 'warn';
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-left',
        onClick &&
          'transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-elevation-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
        {Icon && <Icon className="size-3" />}
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'warn' ? 'text-accent' : 'text-foreground'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[11px] text-foreground-muted">{hint}</span>}
    </Wrapper>
  );
}

function ToolRow({
  tool,
  accent,
  onOpen,
  onSetup,
}: {
  tool: ToolEntry;
  accent: Accent;
  onOpen: () => void;
  onSetup: (req: NonNullable<ToolEntry['requires']>) => void;
}) {
  const Icon = tool.icon;
  const setup = tool.requires ? REQUIREMENT_SETUP[tool.requires] : null;
  return (
    <div
      className={cn(
        'group flex h-full flex-col gap-2.5 rounded-lg border border-border bg-surface p-4',
        'transition-[border-color,box-shadow] duration-200 hover:shadow-elevation-sm',
        accentBorderHover(accent)
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-start gap-3 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The icon carries the section colour. One tinted element per card
            keeps the grid scannable without banding or outlining anything. */}
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            accentTile(accent)
          )}
        >
          <Icon className="size-4.5" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <span className="text-sm font-medium text-foreground">{tool.label}</span>
          {tool.description && (
            <span className="text-xs text-foreground-muted leading-snug line-clamp-2">
              {tool.description}
            </span>
          )}
        </span>
        <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <div className="mt-auto pl-12">
        {setup ? (
          <button
            type="button"
            onClick={() => onSetup(tool.requires!)}
            title={`Add ${setup.what} in Settings`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <KeyRound className="size-2.5" />
            Needs {tool.requires}
          </button>
        ) : (
          <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', accentText(accent))}>
            <Check className="size-2.5" strokeWidth={3} />
            Ready to use
          </span>
        )}
      </div>
    </div>
  );
}
