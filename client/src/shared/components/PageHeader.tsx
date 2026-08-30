import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { PRIMARY_TABS, accentForPath } from '@/app/nav-config';
import { Button } from '@/shared/ui/button';
import { accentTile } from '@/shared/lib/accent';
import { cn } from '@/shared/lib/cn';

type Props = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** When provided, renders an icon tile that shares a layoutId with the
   *  originating hub card — the tile morphs from the hub card into the
   *  page header. */
  icon?: LucideIcon;
  /** Override the back destination. Defaults to the matching hub for the
   *  current route, or `/dashboard` if none matches. */
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
  // Tint the header mark to the section, so a tool page reads as part of a
  // family instead of every page wearing the same orange tile.
  const accent = accentForPath(location.pathname);
  // Default back: nearest hub (everything before the last path segment).
  const fallbackBack =
    backTo ||
    (location.pathname.split('/').length > 2
      ? location.pathname.split('/').slice(0, -1).join('/') || '/dashboard'
      : '/dashboard');

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
            className={cn(
              'flex size-11 items-center justify-center rounded-xl shrink-0 shadow-elevation-sm',
              accentTile(accent)
            )}
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
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
