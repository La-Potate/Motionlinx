import { motion } from 'motion/react';
import { useTilt } from '../hooks/useTilt';
import { cn } from '@/shared/lib/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt angle in degrees. Default 6. */
  max?: number;
  /** Hover scale. Default 1.015. */
  scale?: number;
  /** Tag override (default div). */
  as?: 'div' | 'button' | 'a';
};

export function TiltCard({
  children,
  className,
  max = 6,
  scale = 1.015,
  as = 'div',
}: Props) {
  const { ref, handlers, style } = useTilt<HTMLDivElement>({ max, scale });
  const MotionTag = as === 'button' ? motion.button : as === 'a' ? motion.a : motion.div;
  // useTilt returns handlers typed for HTMLDivElement; the polymorphic `as`
  // prop spreads them onto a union of button/a/div motion components.
  // React event handlers are bivariant via the @types/react bivarianceHack,
  // but the *generic parameter* still differs across the union, which TS
  // strict mode rejects. Cast to bypass — runtime semantics are identical
  // (the underlying MouseEvent shape works for any HTML element).
  const polymorphicHandlers = handlers as unknown as Record<string, unknown>;
  return (
    <MotionTag
      ref={ref as any}
      {...polymorphicHandlers}
      style={style}
      className={cn('will-change-transform', className)}
    >
      {children}
    </MotionTag>
  );
}
