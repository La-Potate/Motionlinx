import { useEffect, useRef, useState } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';

type Options = {
  /** Total duration of the scramble in ms. */
  duration?: number;
  /** Auto-play once on mount. */
  autoPlay?: boolean;
};

/**
 * Returns a string that scrambles into the target value.
 * Call .play() to retrigger.
 */
export function useScrambleText(target: string, options: Options = {}) {
  const { duration = 600, autoPlay = true } = options;
  const [value, setValue] = useState(autoPlay ? '' : target);
  const rafRef = useRef<number | null>(null);

  const play = () => {
    if (typeof window !== 'undefined') {
      const prefersReduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      if (prefersReduced) {
        setValue(target);
        return;
      }
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const revealCount = Math.floor(target.length * t);
      let next = '';
      for (let i = 0; i < target.length; i++) {
        if (i < revealCount || target[i] === ' ') {
          next += target[i];
        } else {
          next += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (autoPlay) play();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return { value, play };
}
