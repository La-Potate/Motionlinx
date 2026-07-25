import { useState } from 'react';
import { format, subDays, startOfMonth, subMonths } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

type Props = {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
};

const ISO = (d: Date) => format(d, 'yyyy-MM-dd');

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Last 7 days', range: () => [ISO(subDays(new Date(), 6)), ISO(new Date())] },
  { label: 'Last 30 days', range: () => [ISO(subDays(new Date(), 29)), ISO(new Date())] },
  { label: 'Last 90 days', range: () => [ISO(subDays(new Date(), 89)), ISO(new Date())] },
  {
    label: 'This month',
    range: () => [ISO(startOfMonth(new Date())), ISO(new Date())],
  },
  {
    label: 'Last month',
    range: () => {
      const lastMonth = subMonths(new Date(), 1);
      const start = startOfMonth(lastMonth);
      const end = subDays(startOfMonth(new Date()), 1);
      return [ISO(start), ISO(end)];
    },
  },
];

export function DateRangeSelector({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const label = `${format(new Date(`${startDate}T00:00:00`), 'MMM d')} – ${format(new Date(`${endDate}T00:00:00`), 'MMM d, yyyy')}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarDays className="size-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="grid gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const [s, e] = p.range();
                onChange(s, e);
                setOpen(false);
              }}
              className="rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
            Custom
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="start" className="text-xs">
                Start
              </Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => onChange(e.target.value, endDate)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="end" className="text-xs">
                End
              </Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                min={startDate}
                max={ISO(new Date())}
                onChange={(e) => onChange(startDate, e.target.value)}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
