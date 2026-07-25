import { useState } from 'react';
import { Search, Loader2, Download, TrendingUp } from 'lucide-react';
import localResearchService from '@/shared/api/localResearch';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { toast } from '@/shared/ui/sonner';

const LOCATIONS = [
  { name: 'United States', code: 2840, lang: 'en' },
  { name: 'United Kingdom', code: 2826, lang: 'en' },
  { name: 'Canada', code: 2124, lang: 'en' },
  { name: 'Australia', code: 2036, lang: 'en' },
  { name: 'India', code: 2356, lang: 'en' },
  { name: 'Germany', code: 2276, lang: 'de' },
  { name: 'France', code: 2250, lang: 'fr' },
  { name: 'Spain', code: 2724, lang: 'es' },
];

export default function LocalResearchPage() {
  const [seedsRaw, setSeedsRaw] = useState('');
  const [locationIdx, setLocationIdx] = useState('0');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const onRun = async () => {
    const seeds = seedsRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (seeds.length === 0) {
      toast.error('Add at least one seed keyword.');
      return;
    }
    if (seeds.length > 50) {
      toast.error('Up to 50 seeds per run.');
      return;
    }
    const loc = LOCATIONS[parseInt(locationIdx, 10)];
    setBusy(true);
    try {
      const data: any = await localResearchService.fetchKeywordIdeas({
        keywords: seeds,
        // Route reads `location` (object) or `locationKey`; sending the object
        // makes the location dropdown actually take effect.
        location: {
          location_code: loc.code,
          language_code: loc.lang,
          location_name: loc.name,
        },
      });
      // Backend returns { count, ideas, location }. Older/other shapes kept as fallbacks.
      const raw = Array.isArray(data?.ideas)
        ? data.ideas
        : Array.isArray(data?.items)
          ? data.items
          : data?.keywords || [];
      setItems(raw);
    } catch (err: any) {
      toast.error(err?.message || 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!items.length) return;
    const headers = ['keyword', 'volume', 'cpc', 'competition'];
    const rows = items.map((r) => [
      r.keyword || r.term || '',
      r.avgMonthlySearches ?? r.searchVolume ?? r.search_volume ?? '',
      r.cpc ?? '',
      r.competitionIndex != null ? `${r.competitionIndex}%` : (r.competition ?? ''),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'local-keywords.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      eyebrow="Local Business"
      icon={Search}
      title="Keyword Research"
      description="Pull local search demand grouped by intent and difficulty."
      twoColumn
    >
      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seeds">Seed keywords (one per line)</Label>
            <Textarea
              id="seeds"
              value={seedsRaw}
              onChange={(e) => setSeedsRaw(e.target.value)}
              placeholder={`lemon law attorney\npersonal injury lawyer`}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <Select value={locationIdx} onValueChange={setLocationIdx}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l, i) => (
                  <SelectItem key={l.code} value={String(i)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="lg" onClick={onRun} disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Working…
              </>
            ) : (
              <>
                <Search className="size-4" /> Run research
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div>
        {items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No ideas yet"
            description="Paste seed keywords, choose a location, and run the research to see expanded ideas with volume."
          />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Ideas · {items.length}</CardTitle>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="size-3.5" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead>Competition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">
                        {r.keyword || r.term}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {(
                          r.avgMonthlySearches ??
                          r.searchVolume ??
                          r.search_volume ??
                          0
                        ).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.cpc ? `$${Number(r.cpc).toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const idx = r.competitionIndex ?? r.competition_index;
                          if (typeof idx === 'number' && Number.isFinite(idx)) {
                            return <Badge variant="outline">{idx}%</Badge>;
                          }
                          if (r.competition != null && r.competition !== 'UNSPECIFIED') {
                            return <Badge variant="outline">{String(r.competition)}</Badge>;
                          }
                          return <span className="text-foreground-subtle text-sm">—</span>;
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ToolPage>
  );
}
