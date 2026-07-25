import { motion } from 'motion/react';

type Props = {
  children: React.ReactNode;
  /** Animation start delay in seconds. */
  delay?: number;
};

/**
 * Hand-drawn underline below inline text. Stroke `pathLength` animates
 * from 0 to 1 after mount. Used to accent a hero word.
 */
export function AnimatedUnderline({ children, delay = 0.9 }: Props) {
  return (
    <span className="relative inline-block">
      <span className="text-accent">{children}</span>
      <svg
        aria-hidden
        className="absolute left-0 -bottom-2 w-full h-[10px] overflow-visible"
        viewBox="0 0 200 10"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M2 6 Q60 -2 100 5 T198 6"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { delay, duration: 0.9, ease: [0.22, 1, 0.36, 1] },
            opacity: { delay, duration: 0.2 },
          }}
        />
      </svg>
    </span>
  );
}
