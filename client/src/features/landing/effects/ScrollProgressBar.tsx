import { motion, useScroll, useSpring } from 'motion/react';

/**
 * Fixed 2px progress bar at the very top of the viewport. Width tracks
 * page scroll. Smoothed via spring so it doesn't feel jittery.
 */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX, transformOrigin: '0 0' }}
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-[2px] bg-accent"
    />
  );
}
