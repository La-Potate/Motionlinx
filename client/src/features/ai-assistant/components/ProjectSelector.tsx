import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { SeoProject } from '@/shared/api/aiAssistant';

type Props = {
  projects: SeoProject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function ProjectSelector({ projects, selectedId, onSelect }: Props) {
  return (
    <Select value={selectedId ? String(selectedId) : ''} onValueChange={(v) => onSelect(Number(v))}>
      <SelectTrigger className="min-w-[240px] w-auto">
        <SelectValue placeholder="Pick a project…" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.name}
            {p.primaryDomain && <span className="text-foreground-subtle ml-2">· {p.primaryDomain}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
