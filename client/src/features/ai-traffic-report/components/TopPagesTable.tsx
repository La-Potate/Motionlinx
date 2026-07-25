import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/shared/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import type { TopPage } from '@/shared/api/ga4';
import { formatNumber } from '../lib/ai-engines';

type Props = {
  pages: TopPage[];
};

export function TopPagesTable({ pages }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const engineIds = Array.from(new Set(pages.map((p) => p.engineId)));
  const filtered = filter === 'all' ? pages : pages.filter((p) => p.engineId === filter);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Top landing pages</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All engines</SelectItem>
            {engineIds.map((id) => {
              const page = pages.find((p) => p.engineId === id);
              return (
                <SelectItem key={id} value={id}>
                  {page?.engineName ?? id}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-foreground-subtle">No pages in this slice.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 25).map((p, i) => (
                <TableRow key={`${p.engineId}-${p.page}-${i}`}>
                  <TableCell className="font-mono text-xs text-foreground">{p.page}</TableCell>
                  <TableCell className="text-foreground-muted">{p.engineName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.sessions)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
