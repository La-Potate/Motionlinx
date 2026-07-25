import * as React from 'react';
import { cn } from '@/shared/lib/cn';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm',
      'placeholder:text-foreground-subtle text-foreground',
      'transition-[border-color,box-shadow] duration-150',
      'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30',
      'resize-y',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
