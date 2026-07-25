import { useEffect, useState } from 'react';
import { useInView } from 'motion/react';
import { useRef } from 'react';
import { useScrambleText } from '../hooks/useScrambleText';

type Props = {
  text: string;
  className?: string;
  /** How long the scramble runs in ms. Default 550. */
  duration?: number;
};

/**
 * Headline that scrambles into the target string the first time it
 * enters the viewport. Stays static afterward.
 */
export function ScrambleHeadline({ text, className, duration = 550 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [armed, setArmed] = useState(false);
  const { value, play } = useScrambleText(text, {
    duration,
    autoPlay: false,
  });

  useEffect(() => {
    if (inView && !armed) {
      setArmed(true);
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, armed]);

  return (
    <span ref={ref} className={className}>
      {armed ? value : ' '.repeat(text.length)}
    </span>
  );
}
