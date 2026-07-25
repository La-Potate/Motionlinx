import type { Transition, Variants } from 'motion/react';

/* =========================================================================
   Spring physics tuned for organic morphing. Stiffness/damping pairs are
   selected so motion settles in ~0.32–0.45s without overshoot bouncing.
   ========================================================================= */
export const spring = {
  morph: { type: 'spring', stiffness: 280, damping: 30, mass: 0.9 },
  snappy: { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 },
  soft: { type: 'spring', stiffness: 220, damping: 28 },
  bouncy: { type: 'spring', stiffness: 500, damping: 24 },
  // Use for layout transitions (FLIP). Slightly softer so reflow is gentle.
  layout: { type: 'spring', stiffness: 320, damping: 34, mass: 0.85 },
} satisfies Record<string, Transition>;

export const easing = {
  outExpo: [0.16, 1, 0.3, 1] as const,
  inOutQuart: [0.65, 0, 0.35, 1] as const,
  outQuint: [0.22, 1, 0.36, 1] as const,
};

export const tween = {
  swift: { duration: 0.18, ease: easing.outExpo },
  smooth: { duration: 0.32, ease: easing.outExpo },
  morph: { duration: 0.42, ease: easing.outQuint },
  slow: { duration: 0.5, ease: easing.outExpo },
} satisfies Record<string, Transition>;

/* Variants =========================================================== */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tween.smooth },
  exit: { opacity: 0, y: -4, transition: tween.swift },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween.smooth },
  exit: { opacity: 0, transition: tween.swift },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.98, transition: tween.swift },
};

export const morphIn: Variants = {
  hidden: { opacity: 0, scale: 0.97, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: spring.morph,
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    filter: 'blur(2px)',
    transition: { ...tween.swift, duration: 0.16 },
  },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: spring.snappy },
  exit: { opacity: 0, x: -8, transition: tween.swift },
};

export const stagger = {
  container: {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.04,
      },
    },
  } satisfies Variants,
  item: morphIn,
};

export const pagePresence: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.995 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.36, ease: easing.outQuint },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.998,
    transition: { duration: 0.18, ease: easing.outExpo },
  },
};

/* Helpers ============================================================ */

/** Standard hover lift for interactive cards. */
export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.99 },
  transition: spring.snappy,
};

/** Standard "press" feedback for buttons. */
export const pressScale = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
};
