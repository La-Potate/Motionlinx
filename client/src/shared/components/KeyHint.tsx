import { cn } from '@/shared/lib/cn';

type Props = {
  keys: string[];
  className?: string;
};

export function KeyHint({ keys, className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-surface-muted px-1 font-mono text-[10px] font-medium text-foreground-muted"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
