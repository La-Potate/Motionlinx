import * as React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/shared/lib/cn';

/**
 * Card primitive — supports motion layout animations out of the box.
 * Pass `layout` to enable FLIP transitions when the card's size or
 * position changes, or `layoutId` to morph between mounted instances.
 */
type CardProps = HTMLMotionProps<'div'> & {
  asMotion?: boolean;
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, asMotion = false, layout, layoutId, ...props }, ref) => {
    const Tag = asMotion || layout || layoutId ? motion.div : 'div';
    const motionProps = Tag === motion.div ? { layout, layoutId } : {};
    return (
      <Tag
        ref={ref as any}
        className={cn(
          'rounded-lg border border-border bg-card text-card-foreground',
          'transition-[border-color,box-shadow,background-color] duration-300',
          className
        )}
        {...motionProps}
        {...(props as any)}
      />
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col gap-1.5 p-5', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-base font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm text-foreground-muted', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-3 p-5 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';
