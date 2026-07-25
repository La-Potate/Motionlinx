import type { LucideIcon } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { cn } from '@/shared/lib/cn';

type Props = {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional icon — shared layoutId with the originating hub ToolCard. */
  icon?: LucideIcon;
  /** Override the back destination. */
  backTo?: string;
  /** Hide the back button (used on hub landings). */
  hideBack?: boolean;
  /** Two-column form/result layout. */
  twoColumn?: boolean;
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
  children,
  className,
}: Props) {
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
