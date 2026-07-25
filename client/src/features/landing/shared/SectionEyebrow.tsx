import { cn } from '@/shared/lib/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function SectionEyebrow({ children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent',
        className
      )}
    >
      <span className="inline-block size-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}
