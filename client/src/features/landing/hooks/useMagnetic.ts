import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'motion/react';

type Options = {
  /** How far the element can shift (px). Default 8. */
  strength?: number;
  /** Distance (px) at which the magnetic pull kicks in. Default 80. */
  radius?: number;
};

/**
 * Returns x/y motion values that move the target element toward the
 * cursor when the pointer enters its proximity. Returns to centre on
 * leave. Spring-smoothed.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(
  options: Options = {}
) {
  const { strength = 8, radius = 80 } = options;
  const ref = useRef<T>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 240, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 240, damping: 18, mass: 0.4 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReduced) return;
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const pullRadius = Math.max(rect.width, rect.height) / 2 + radius;
      if (dist < pullRadius) {
        const factor = (1 - dist / pullRadius) * strength;
        x.set((dx / dist) * factor);
        y.set((dy / dist) * factor);
      } else {
        x.set(0);
        y.set(0);
      }
    };
    const onLeave = () => {
      x.set(0);
      y.set(0);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [strength, radius, x, y]);

  return { ref, x: sx, y: sy };
}
