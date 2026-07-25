import { useEffect, useRef } from 'react';
import { animate, useMotionValue, useTransform, motion } from 'motion/react';

type Props = {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
};

const defaultFormat = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

export function AnimatedNumber({
  value,
  duration = 0.7,
  className,
  format = defaultFormat,
}: Props) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (latest) => format(Math.round(latest)));
  const previous = useRef(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return (
    <motion.span className={className} aria-label={String(value)}>
      {display}
    </motion.span>
  );
}
