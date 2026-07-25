import { motion } from 'motion/react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/cn';

export type ToolCardProps = {
  title: string;
  description?: string;
  icon: LucideIcon;
  route: string;
  badge?: string;
  badgeTone?: 'mint' | 'sky' | 'butter' | 'lavender' | 'accent' | 'default';
  meta?: string;
};

export function ToolCard({
  title,
  description,
  icon: Icon,
  route,
  badge,
  badgeTone = 'default',
  meta,
}: ToolCardProps) {
  const navigate = useNavigate();
  // Shared layoutId with the destination tool page's PageHeader icon — when
  // this card is clicked, the icon tile morphs across pages instead of popping in.
  const morphId = `tool-mark:${route}`;
  return (
    <motion.button
      type="button"
      onClick={() => navigate(route)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.85 }}
      className={cn(
        'group relative flex h-full flex-col items-start gap-5 rounded-xl border border-border bg-surface p-5 text-left overflow-hidden',
        'transition-[border-color,box-shadow,background-color] duration-300',
        'hover:border-border-strong hover:shadow-elevation-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {/* Subtle accent glow that morphs in on hover */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-accent-soft opacity-0"
        initial={{ scale: 0.6 }}
        whileHover={{ opacity: 0.7, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      />

      <div className="flex w-full items-start justify-between relative">
        <motion.div
          layoutId={morphId}
          transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 1 }}
          className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed shadow-elevation-sm"
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </motion.div>
        {badge && <Badge variant={badgeTone}>{badge}</Badge>}
      </div>

      <div className="flex flex-col gap-1.5 relative">
        <h3 className="text-base font-semibold text-foreground tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-foreground-muted leading-relaxed">
            {description}
          </p>
        )}
      </div>

      <div className="mt-auto flex w-full items-center justify-between pt-1 relative">
        <span className="text-[11px] uppercase tracking-wider text-foreground-subtle">
          {meta ?? 'Open tool'}
        </span>
        <motion.span
          className="inline-flex size-7 items-center justify-center rounded-full bg-surface-muted text-foreground-muted"
          whileHover={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-foreground)',
            scale: 1.08,
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 24 }}
        >
          <motion.span
            className="inline-flex"
            whileHover={{ x: 1.5, y: -1.5 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <ArrowUpRight className="size-3.5" />
          </motion.span>
        </motion.span>
      </div>
    </motion.button>
  );
}
