import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUpRight, Check, KeyRound } from 'lucide-react';
import {
  HUB_DEFS,
  REQUIREMENT_SETUP,
  TOOL_SECTIONS,
  settingsLinkFor,
  toolsForSection,
  type ToolEntry,
  type ToolSection,
} from '@/app/nav-config';
import { PageHeader } from './PageHeader';
import {
  accentBorderHover,
  accentEdge,
  accentText,
  accentTile,
} from '@/shared/lib/accent';
import { cn } from '@/shared/lib/cn';

type Props = {
  /** Section id — must match a TOOL_SECTIONS / HUB_DEFS key. */
  sectionId: keyof typeof HUB_DEFS;
};

/**
 * Section hub. Everything on it is derived from nav-config, so a tool's
 * name, description and credential requirement are written once and cannot
 * drift between the dashboard, the hub and the tool page — which is exactly
 * what had happened before (the hubs still advertised "70+ citation
 * publishers" against an actual list of 52 US / 38 UK).
 */
export function HubLanding({ sectionId }: Props) {
  const def = HUB_DEFS[sectionId];
  const section = TOOL_SECTIONS.find((s) => s.id === sectionId) as ToolSection;
  const tools = toolsForSection(section.label);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={def.eyebrow}
        title={def.title}
        description={def.description}
        icon={section.icon}
        hideBack
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <HubToolCard key={tool.id} tool={tool} section={section} />
        ))}
      </div>
    </div>
  );
}

function HubToolCard({ tool, section }: { tool: ToolEntry; section: ToolSection }) {
  const navigate = useNavigate();
  const Icon = tool.icon;
  const accent = section.accent;
  const setup = tool.requires ? REQUIREMENT_SETUP[tool.requires] : null;

  return (
    <div
      className={cn(
        'group relative flex h-full overflow-hidden rounded-xl border border-border bg-surface',
        'transition-[border-color,box-shadow] duration-200 hover:shadow-elevation-md',
        accentBorderHover(accent)
      )}
    >
      <span aria-hidden className={cn('w-1 shrink-0', accentEdge(accent))} />
      <div className="flex flex-1 flex-col gap-4 p-5 min-w-0">
        <button
          type="button"
          onClick={() => navigate(tool.path)}
          className="flex flex-col gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <span className="flex w-full items-start justify-between">
            {/* Shares a layoutId with the destination page's PageHeader mark,
                so the tile morphs across the navigation instead of popping in. */}
            <motion.span
              layoutId={`tool-mark:${tool.path}`}
              transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 1 }}
              className={cn(
                'flex size-10 items-center justify-center rounded-lg shadow-elevation-sm',
                accentTile(accent)
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} />
            </motion.span>
            <ArrowUpRight className="size-4 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="text-base font-semibold tracking-tight text-foreground">
              {tool.label}
            </span>
            {tool.description && (
              <span className="text-sm text-foreground-muted leading-relaxed">
                {tool.description}
              </span>
            )}
          </span>
        </button>

        {tool.whatItDoes?.length ? (
          <ul className="flex flex-col gap-1">
            {tool.whatItDoes.slice(0, 2).map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 text-xs text-foreground-muted"
              >
                <Check
                  className={cn('mt-0.5 size-3 shrink-0', accentText(accent))}
                  strokeWidth={3}
                />
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto pt-1">
          {setup ? (
            <button
              type="button"
              onClick={() => navigate(settingsLinkFor(tool.requires!))}
              title={`Add ${setup.what} in Settings`}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground-subtle transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KeyRound className="size-2.5" />
              Needs {tool.requires}
            </button>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium',
                accentText(accent)
              )}
            >
              <Check className="size-2.5" strokeWidth={3} />
              Ready to use
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
