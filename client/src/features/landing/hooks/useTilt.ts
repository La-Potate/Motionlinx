import { useRef } from 'react';
import { useMotionValue, useSpring, useTransform } from 'motion/react';

type Options = {
  max?: number; // max rotation in degrees
  scale?: number; // hover scale
  perspective?: number; // px
};

/**
 * Mouse-tracked 3D tilt for a card-like element. Returns ref + style
 * helpers that apply perspective + rotateX/Y based on cursor position.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(
  options: Options = {}
) {
  const { max = 6, scale = 1.015, perspective = 800 } = options;

  const ref = useRef<T>(null);
  const mx = useMotionValue(0); // -0.5 .. 0.5
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 240, damping: 22 });
  const sy = useSpring(my, { stiffness: 240, damping: 22 });
  const s = useSpring(1, { stiffness: 280, damping: 24 });

  const rotateY = useTransform(sx, (v) => v * max * 2);
  const rotateX = useTransform(sy, (v) => -v * max * 2);

  const onMouseMove: React.MouseEventHandler<T> = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    mx.set(px);
    my.set(py);
  };
  const onMouseEnter = () => s.set(scale);
  const onMouseLeave = () => {
    mx.set(0);
    my.set(0);
    s.set(1);
  };

  return {
    ref,
    handlers: { onMouseMove, onMouseEnter, onMouseLeave },
    style: {
      perspective: `${perspective}px`,
      transformStyle: 'preserve-3d' as const,
      rotateX,
      rotateY,
      scale: s,
    },
  };
}
