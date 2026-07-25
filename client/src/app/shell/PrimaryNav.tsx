import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { PRIMARY_TABS } from '@/app/nav-config';
import { cn } from '@/shared/lib/cn';

export function PrimaryNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const active = PRIMARY_TABS.find(
    (t) => path === t.path || path.startsWith(`${t.path}/`)
  );

  return (
    <div className="hidden md:flex items-center gap-0.5 rounded-full border border-border bg-surface/70 p-1 backdrop-blur-sm shadow-elevation-sm">
      {PRIMARY_TABS.map((tab) => {
        const isActive = active?.id === tab.id;
        return (
          <motion.button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.path)}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn(
              'relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'text-foreground'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="primary-nav-pill"
                className="absolute inset-0 rounded-full bg-surface-muted shadow-elevation-sm"
                transition={{
                  type: 'spring',
                  stiffness: 360,
                  damping: 32,
                  mass: 0.9,
                }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
