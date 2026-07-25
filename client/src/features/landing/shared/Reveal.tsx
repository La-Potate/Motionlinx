import { motion, type MotionProps } from 'motion/react';
import { cn } from '@/shared/lib/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in seconds applied to this element. */
  delay?: number;
  /** Distance to slide in vertically. Default 24px. */
  y?: number;
  /** Disable viewport gate for above-the-fold elements (animates on mount). */
  asMount?: boolean;
} & Omit<MotionProps, 'initial' | 'whileInView' | 'viewport' | 'animate' | 'transition'>;

/**
 * Scroll-triggered reveal wrapper. Fades up once when 20% into view,
 * never re-animates. Used across the landing page.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  asMount = false,
  ...rest
}: Props) {
  const animation = asMount
    ? {
        initial: { opacity: 0, y },
        animate: { opacity: 1, y: 0 },
      }
    : {
        initial: { opacity: 0, y },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-80px' },
      };

  return (
    <motion.div
      {...animation}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay,
      }}
      className={cn(className)}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  );
}
