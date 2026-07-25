import { useState } from 'react';
import { Search, Loader2, Download, TrendingUp } from 'lucide-react';
import aiSeoService from '@/shared/api/aiSeo';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
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

const COUNTRIES = [
  { name: 'United States', code: 2840, lang: 'en' },
  { name: 'United Kingdom', code: 2826, lang: 'en' },
  { name: 'Canada', code: 2124, lang: 'en' },
  { name: 'Australia', code: 2036, lang: 'en' },
  { name: 'Germany', code: 2276, lang: 'de' },
  { name: 'France', code: 2250, lang: 'fr' },
  { name: 'Spain', code: 2724, lang: 'es' },
  { name: 'Mexico', code: 2484, lang: 'es' },
  { name: 'India', code: 2356, lang: 'en' },
];

export default function AiKeywordDataPage() {
  const [raw, setRaw] = useState('');
  const [countryIdx, setCountryIdx] = useState('0');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const onRun = async () => {
    const keywords = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      toast.error('Enter at least one keyword.');
      return;
    }
    if (keywords.length > 100) {
      toast.error('Up to 100 keywords per run.');
      return;
    }
    const country = COUNTRIES[parseInt(countryIdx, 10)];
    setBusy(true);
    try {
      const data: any = await aiSeoService.fetchKeywordData({
        keywords,
        location_code: country.code,
        language_code: country.lang,
      });
      setResults(Array.isArray(data?.items) ? data.items : data?.keywords || []);
    } catch (err: any) {
      toast.error(err?.message || 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!results.length) return;
    const headers = ['keyword', 'volume', 'cpc', 'competition', 'intent'];
    const rows = results.map((r) => [
      r.keyword || '',
      r.searchVolume ?? r.search_volume ?? '',
      r.cpc ?? '',
      r.competition ?? '',
      r.intent ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-keyword-data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      eyebrow="AI SEO"
      icon={Search}
      title="AI keyword data"
      description="Pull live search volume, CPC, and competition for any batch of keywords."
      twoColumn
    >
      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kw-input">Keywords (one per line)</Label>
            <Textarea
              id="kw-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`local seo audit\nschema markup generator\nai content optimization`}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <Select value={countryIdx} onValueChange={setCountryIdx}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c, i) => (
                  <SelectItem key={c.code} value={String(i)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="lg" onClick={onRun} disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Fetching…
              </>
            ) : (
              <>
                <Search className="size-4" /> Fetch keyword data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {results.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No keyword data yet"
            description="Paste keywords on the left, pick a location, and fetch volume, CPC and competition data."
          />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Results · {results.length}</CardTitle>
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
                    <TableHead>Intent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{r.keyword}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {(r.searchVolume ?? r.search_volume ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.cpc ? `$${Number(r.cpc).toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.competition != null ? (
                          <Badge variant="outline">
                            {(Number(r.competition) * 100).toFixed(0)}%
                          </Badge>
                        ) : (
                          <span className="text-foreground-subtle text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-foreground-muted">
                        {r.intent || '—'}
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
