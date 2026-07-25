import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { cn } from '@/shared/lib/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Max rotation in degrees. Default 10. */
  max?: number;
  /** Perspective distance in px. Lower = stronger 3D effect. Default 1200. */
  perspective?: number;
  /** Hover scale. Default 1.015. */
  scale?: number;
};

/**
 * 3D-tilt container for any element. Sets `perspective` on the outer
 * wrapper and `transform-style: preserve-3d` on the inner, so children
 * with `translateZ(...)` actually render at different depths.
 *
 * Cursor moves rotate the inner element on X/Y axes. Skips automatically
 * on touch devices (CSS hover queries won't fire, motion still mounts
 * but stays idle).
 */
export function Tilt3D({
  children,
  className,
  max = 10,
  perspective = 1200,
  scale = 1.015,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 22, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 220, damping: 22, mass: 0.6 });

  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const onMouseLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ perspective: `${perspective}px` }}
      className={cn('will-change-transform', className)}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        whileHover={{ scale }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="relative size-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
