import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { PRIMARY_TABS } from '@/app/nav-config';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';

type Props = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** When provided, renders an icon tile that shares a layoutId with the
   *  originating ToolCard — the tile morphs from the hub card into the
   *  page header. */
  icon?: LucideIcon;
  /** Override the back destination. Defaults to the matching hub for the
   *  current route, or `/seo-toolkit` if none matches. */
  backTo?: string;
  /** Hide the back button entirely (e.g. on hub landings). */
  hideBack?: boolean;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
  backTo,
  hideBack = false,
  className,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const morphId = `tool-mark:${location.pathname}`;

  // Detect when this is a tool page vs a hub landing. Hub landings match a
  // PRIMARY_TAB path exactly; tool pages are descendants of one.
  const isToolPage = !PRIMARY_TABS.some((t) => t.path === location.pathname);
  // Default back: nearest hub (everything before the last path segment).
  const fallbackBack =
    backTo ||
    (location.pathname.split('/').length > 2
      ? location.pathname.split('/').slice(0, -1).join('/') || '/seo-toolkit'
      : '/seo-toolkit');

  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <motion.div
            layoutId={morphId}
            transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 1 }}
            className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-pressed shrink-0 shadow-elevation-sm"
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </motion.div>
        )}
        <div className="flex flex-col gap-1.5 pt-0.5 min-w-0">
          {!hideBack && isToolPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(fallbackBack)}
              className="h-7 -ml-2 self-start text-xs text-foreground-muted gap-1"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          )}
          {eyebrow && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {title}
          </h1>
          {description && (
            <div className="max-w-2xl text-sm text-foreground-muted">{description}</div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
