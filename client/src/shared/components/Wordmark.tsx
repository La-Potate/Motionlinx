import { motion } from 'motion/react';
import { cn } from '@/shared/lib/cn';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  size?: Size;
  className?: string;
  /** Render only the brand-mark glyph, no text. */
  markOnly?: boolean;
  /** Animate the mark on mount. */
  animate?: boolean;
};

const sizeMap = {
  sm: { mark: 'size-5', dot: 'size-1.5', text: 'text-sm', gap: 'gap-2' },
  md: { mark: 'size-7', dot: 'size-2', text: 'text-[15px]', gap: 'gap-2.5' },
  lg: { mark: 'size-9', dot: 'size-2.5', text: 'text-lg', gap: 'gap-3' },
};

/**
 * Motionlinx wordmark — flat orange brand-mark + typographic logotype.
 * Replaces the legacy logo.png everywhere in the app.
 */
export function Wordmark({
  size = 'md',
  className,
  markOnly = false,
  animate = false,
}: Props) {
  const s = sizeMap[size];

  const mark = (
    <span
      className={cn(
        'relative flex items-center justify-center rounded-[7px] bg-accent shrink-0',
        'shadow-elevation-sm',
        s.mark
      )}
      aria-hidden="true"
    >
      {/* inner cut-out gives the mark depth without using a gradient */}
      <span
        className={cn(
          'rounded-[3px] bg-accent-foreground/95',
          s.dot
        )}
      />
    </span>
  );

  if (markOnly) {
    return animate ? (
      <motion.span
        initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        className={cn('inline-flex', className)}
      >
        {mark}
      </motion.span>
    ) : (
      <span className={cn('inline-flex', className)}>{mark}</span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center', s.gap, className)}
      aria-label="Motionlinx"
    >
      {animate ? (
        <motion.span
          initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="inline-flex"
        >
          {mark}
        </motion.span>
      ) : (
        mark
      )}
      <span
        className={cn(
          'font-semibold tracking-[0.02em] leading-none select-none uppercase',
          s.text
        )}
      >
        <span className="text-foreground">MOTION</span>
        <span className="text-accent ml-px">LINX</span>
      </span>
    </span>
  );
}
