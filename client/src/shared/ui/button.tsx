import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { motion } from 'motion/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md text-sm font-medium select-none',
    'transition-[background-color,color,border-color,box-shadow] duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform",
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-foreground hover:bg-accent-hover shadow-elevation-sm hover:shadow-elevation-md',
        secondary:
          'bg-surface-muted text-foreground hover:bg-surface-inset border border-border',
        outline:
          'bg-transparent text-foreground border border-border-strong hover:bg-surface-muted hover:border-border-strong',
        ghost: 'bg-transparent text-foreground hover:bg-surface-muted',
        destructive:
          'bg-rose text-rose-ink hover:bg-rose/80 border border-rose',
        link: 'text-accent underline-offset-4 hover:underline px-0',
        accent:
          'bg-accent-soft text-accent-pressed hover:bg-accent-soft/80 border border-transparent',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-5 text-[15px]',
        xl: 'h-12 px-6 text-base',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          ref={ref as any}
          className={cn(buttonVariants({ variant, size, className }))}
          {...(props as any)}
        />
      );
    }
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 480, damping: 32 }}
        className={cn(buttonVariants({ variant, size, className }))}
        {...(props as any)}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
