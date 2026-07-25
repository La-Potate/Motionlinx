import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-surface-muted text-foreground-muted',
        accent: 'border-transparent bg-accent-soft text-accent-pressed',
        mint: 'border-transparent bg-mint text-mint-ink',
        rose: 'border-transparent bg-rose text-rose-ink',
        sky: 'border-transparent bg-sky text-sky-ink',
        lavender: 'border-transparent bg-lavender text-lavender-ink',
        butter: 'border-transparent bg-butter text-butter-ink',
        outline: 'border-border-strong text-foreground-muted bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
