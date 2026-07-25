import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Card with layout animations enabled. Use anywhere a Card might change
 * size, position, or order — FLIP transitions keep movement smooth.
 *
 * Pass `layoutId` to share the card with another mounted instance and
 * morph between the two.
 */
type Props = HTMLMotionProps<'div'> & {
  /** Adds hover lift + press feedback. Defaults to true. */
  interactive?: boolean;
};

export const MorphCard = forwardRef<HTMLDivElement, Props>(
  ({ className, interactive = false, ...props }, ref) => (
    <motion.div
      ref={ref}
      layout
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.995 } : undefined}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground',
        'transition-[border-color,box-shadow] duration-200',
        interactive &&
          'cursor-pointer hover:border-border-strong hover:shadow-elevation-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  )
);
MorphCard.displayName = 'MorphCard';
