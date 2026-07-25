import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@/shared/ui/select';
import type { Ga4Property } from '@/shared/api/ga4';

type Props = {
  properties: Ga4Property[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  error: string | null;
  loading?: boolean;
};

export function PropertySelector({ properties, selectedId, onSelect, error, loading }: Props) {
  if (error) {
    return (
      <div className="rounded-md border border-rose bg-rose/30 px-3 py-1.5 text-xs text-rose-ink">
        Failed to load GA4 properties: {error}
      </div>
    );
  }
  if (loading || !properties) {
    return (
      <div className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground-subtle">
        Loading GA4 properties…
      </div>
    );
  }
  if (properties.length === 0) {
    return (
      <div className="rounded-md border border-butter bg-butter/30 px-3 py-1.5 text-xs text-butter-ink">
        No GA4 properties found on this Google account.
      </div>
    );
  }

  const grouped = new Map<string, Ga4Property[]>();
  for (const p of properties) {
    const list = grouped.get(p.accountName) ?? [];
    list.push(p);
    grouped.set(p.accountName, list);
  }

  return (
    <Select value={selectedId ?? ''} onValueChange={onSelect}>
      <SelectTrigger className="min-w-[240px] w-auto">
        <SelectValue placeholder="Pick a property…" />
      </SelectTrigger>
      <SelectContent>
        {Array.from(grouped.entries()).map(([accountName, props]) => (
          <SelectGroup key={accountName}>
            <SelectLabel>{accountName || 'Account'}</SelectLabel>
            {props.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
