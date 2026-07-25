import { forwardRef } from 'react';
import { motion } from 'motion/react';
import { useMagnetic } from '../hooks/useMagnetic';
import { Button, type ButtonProps } from '@/shared/ui/button';

/**
 * Drop-in replacement for <Button /> that adds a magnetic cursor pull.
 * Wraps Button inside a motion.span that translates toward the cursor.
 */
export const MagneticButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { magneticStrength?: number; magneticRadius?: number }
>(({ magneticStrength = 8, magneticRadius = 80, ...props }, _ref) => {
  const { ref, x, y } = useMagnetic<HTMLDivElement>({
    strength: magneticStrength,
    radius: magneticRadius,
  });

  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-flex' }}
    >
      <Button {...props} />
    </motion.div>
  );
});
MagneticButton.displayName = 'MagneticButton';
