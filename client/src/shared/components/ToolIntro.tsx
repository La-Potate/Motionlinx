import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, KeyRound, Sparkles } from 'lucide-react';
import {
  REQUIREMENT_SETUP,
  settingsLinkFor,
  sectionForTool,
  type ToolEntry,
} from '@/app/nav-config';
import { accentSurface, accentText } from '@/shared/lib/accent';
import { cn } from '@/shared/lib/cn';

/**
 * The "what this is" block shown at the top of every tool page.
 *
 * Rendered automatically by ToolPage from the tool's nav-config entry, so a
 * tool describes itself in one place instead of each page hand-rolling its
 * own copy — and so the requirement notice can never drift from the key the
 * backend actually checks.
 */
export function ToolIntro({ tool }: { tool: ToolEntry }) {
  const navigate = useNavigate();
  const section = sectionForTool(tool);
  const accent = section?.accent ?? 'sky';
  const setup = tool.requires ? REQUIREMENT_SETUP[tool.requires] : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:gap-8',
          accentSurface(accent)
        )}
      >
        {/* What it does */}
        <div className="flex flex-1 flex-col gap-2.5 min-w-0">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]',
              accentText(accent)
            )}
          >
            <Sparkles className="size-3" />
            What this does
          </span>
          {tool.whatItDoes?.length ? (
            <ul className="flex flex-col gap-1.5">
              {tool.whatItDoes.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Check
                    className={cn('mt-0.5 size-3.5 shrink-0', accentText(accent))}
                    strokeWidth={2.5}
                  />
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">{tool.description}</p>
          )}
        </div>

        {/* What it needs */}
        <div className="flex flex-col gap-2.5 sm:w-[280px] sm:shrink-0 sm:border-l sm:border-border sm:pl-8">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
            <KeyRound className="size-3" />
            What you need
          </span>
          {setup ? (
            <>
              <p className="text-sm text-foreground leading-snug">
                <span className="font-medium">{tool.requires}</span> — {setup.what}.
              </p>
              <button
                type="button"
                onClick={() => navigate(settingsLinkFor(tool.requires!))}
                className={cn(
                  'group inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'border-border bg-surface text-foreground hover:border-border-strong'
                )}
              >
                Set it up
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </button>
              {setup.adminOnly && (
                <p className="text-[11px] text-foreground-subtle leading-snug">
                  Workspace-wide setting — an admin adds it once for everyone.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-foreground-muted leading-snug">
              Nothing. This tool runs on its own — no API key required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
