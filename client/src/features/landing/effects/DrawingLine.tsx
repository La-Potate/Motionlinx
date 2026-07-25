import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

/**
 * Thin SVG line that draws across the viewport as the user scrolls past.
 * Drop between sections as a subtle divider.
 */
export function DrawingLine() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 90%', 'end 10%'],
  });
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div ref={ref} className="relative w-full h-8 mx-auto max-w-[1280px] px-4 sm:px-6">
      <svg
        aria-hidden
        viewBox="0 0 1200 8"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full overflow-visible"
      >
        <motion.path
          d="M0 4 L1200 4"
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="1"
          strokeLinecap="round"
          style={{ pathLength }}
        />
        <motion.circle
          r="3"
          fill="var(--accent)"
          style={{
            offsetDistance: useTransform(scrollYProgress, [0, 1], ['0%', '100%']),
            offsetPath: 'path("M0 4 L1200 4")',
          } as any}
        />
      </svg>
    </div>
  );
}
