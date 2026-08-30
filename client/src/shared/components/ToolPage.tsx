import { useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { ToolIntro } from './ToolIntro';
import { toolForPath } from '@/app/nav-config';
import { cn } from '@/shared/lib/cn';

type Props = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional icon — shared layoutId with the originating hub card. */
  icon?: LucideIcon;
  /** Override the back destination. */
  backTo?: string;
  /** Hide the back button (used on hub landings). */
  hideBack?: boolean;
  /** Two-column form/result layout. */
  twoColumn?: boolean;
  /** Opt out of the auto "what this does / what you need" block. */
  hideIntro?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function ToolPage({
  eyebrow,
  title,
  description,
  actions,
  icon,
  backTo,
  hideBack,
  twoColumn = false,
  hideIntro = false,
  children,
  className,
}: Props) {
  const location = useLocation();
  // Resolved from the route rather than passed in, so every tool page gets
  // the same intro without each one having to opt in and restate its copy.
  const tool = toolForPath(location.pathname);

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        icon={icon}
        backTo={backTo}
        hideBack={hideBack}
      />
      {tool && !hideIntro && <ToolIntro tool={tool} />}
      <div
        className={cn(
          twoColumn
            ? 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'
            : 'flex flex-col gap-6'
        )}
      >
        {children}
      </div>
    </div>
  );
}
