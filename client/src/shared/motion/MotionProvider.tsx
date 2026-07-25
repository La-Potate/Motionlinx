import { LayoutGroup, MotionConfig, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { spring } from './presets';

type Props = { children: React.ReactNode };

/**
 * Site-wide motion provider.
 * - LayoutGroup means components with the same layoutId/layout prop can
 *   participate in shared FLIP transitions across the entire app.
 * - MotionConfig defaults every motion component to a soft spring used for
 *   layout / morph behavior unless they override locally.
 */
export function MotionProvider({ children }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <MotionConfig
      reducedMotion={prefersReducedMotion ? 'always' : 'user'}
      transition={mounted ? spring.layout : { duration: 0 }}
    >
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}
