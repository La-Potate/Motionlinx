import { motion } from 'motion/react';
import { Wordmark } from '@/shared/components/Wordmark';

export default function LoadingScreen({
  message = 'Loading your workspace…',
  subMessage = 'Hold tight while we prepare the latest data.',
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
      >
        <Wordmark size="lg" markOnly />
      </motion.div>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {subMessage && (
          <span className="text-xs text-foreground-muted">{subMessage}</span>
        )}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block size-1.5 rounded-full bg-accent"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.18,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}
