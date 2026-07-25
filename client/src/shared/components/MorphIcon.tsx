import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Menu, Moon, Sun, X, ChevronDown, ChevronUp } from 'lucide-react';

type Variants = Record<string, React.ComponentType<{ className?: string }>>;

const REGISTRY: Record<string, Variants> = {
  theme: { light: Sun, dark: Moon },
  menu: { closed: Menu, open: X },
  copy: { idle: Copy, done: Check },
  collapse: { collapsed: ChevronDown, expanded: ChevronUp },
};

type MorphIconProps = {
  name: keyof typeof REGISTRY;
  state: string;
  className?: string;
  size?: number;
};

export function MorphIcon({ name, state, className, size = 16 }: MorphIconProps) {
  const set = REGISTRY[name];
  const Icon = set?.[state] ?? Object.values(set ?? {})[0];
  if (!Icon) return null;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', width: size, height: size }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'inline-flex' }}
        >
          <Icon className={`size-[${size}px]`} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
