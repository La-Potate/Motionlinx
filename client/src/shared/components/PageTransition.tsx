import { motion } from 'motion/react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Page transition — opacity-only fade. Intentionally minimal so the
 * shared-element morphs (icons / titles flying between routes) take
 * centre stage instead of competing with a slide.
 */
export function PageTransition({ children, className }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.22, ease: 'easeOut' } }}
      exit={{ opacity: 0, transition: { duration: 0.14, ease: 'easeIn' } }}
    >
      {children}
    </motion.div>
  );
}
