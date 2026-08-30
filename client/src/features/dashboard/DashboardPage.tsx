import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, KeyRound, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ga4Service } from '@/shared/api/ga4';
import { gscService } from '@/shared/api/gsc';
import {
  ALL_TOOLS,
  STANDALONE_APPS,
  TOOL_SECTIONS,
  toolsForSection,
  type ToolEntry,
} from '@/app/nav-config';
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
          hint={connectedCount === 2 ? 'Analytics + Search Console' : 'Connect in Settings'}
          tone={connectedCount === 0 ? 'warn' : 'default'}
          onClick={() => navigate('/settings')}
        />
        <StatTile
          label="Tools ready"
          value={`${readyCount}/${ALL_TOOLS.length}`}
          hint="Rest need an API key"
          onClick={() => navigate('/settings')}
        />
      </section>

      {/* ---- Standalone apps ---- */}
      <section className="flex flex-col gap-4">
        <SectionHeading title="Apps" caption="Connected workspaces that run continuously." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STANDALONE_APPS.map((app) => {
            const Icon = app.icon;
            const conn = app.id === 'ai-assistant' ? gsc : ga4;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => navigate(app.path)}
                className={cn(
                  'group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-left',
                  'transition-[border-color,box-shadow] duration-200',
                  'hover:border-border-strong hover:shadow-elevation-md',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
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
                <span className="mt-auto pt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                  Open
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
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
                <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted text-foreground-muted shrink-0">
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
                  <ToolRow tool={tool} onOpen={() => navigate(tool.path)} />
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

function ToolRow({ tool, onOpen }: { tool: ToolEntry; onOpen: () => void }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex h-full w-full items-start gap-3 rounded-lg border border-border bg-surface p-3.5 text-left',
        'transition-[border-color,box-shadow,background-color] duration-200',
        'hover:border-border-strong hover:shadow-elevation-sm hover:bg-surface',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-foreground-muted group-hover:bg-accent-soft group-hover:text-accent-pressed transition-colors">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{tool.label}</span>
          {tool.requires && (
            <span
              title={`Needs a ${tool.requires} key`}
              className="shrink-0 rounded border border-border px-1 py-px text-[9px] font-medium uppercase tracking-wide text-foreground-subtle"
            >
              Key
            </span>
          )}
        </span>
        {tool.description && (
          <span className="text-xs text-foreground-muted leading-snug line-clamp-2">
            {tool.description}
          </span>
        )}
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </button>
  );
}
