import { useState } from 'react';
import {
  Sparkles,
  Loader2,
  Globe,
  Languages,
  Target,
  FileText,
} from 'lucide-react';
import aiSeoService from '@/shared/api/aiSeo';
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
import { toast } from '@/shared/ui/sonner';

const LOCATIONS = [
  { label: 'United States', location_code: 2840, language_code: 'en' },
  { label: 'United Kingdom', location_code: 2826, language_code: 'en' },
  { label: 'Canada', location_code: 2124, language_code: 'en' },
  { label: 'Australia', location_code: 2036, language_code: 'en' },
  { label: 'Germany', location_code: 2276, language_code: 'de' },
  { label: 'France', location_code: 2250, language_code: 'fr' },
  { label: 'Spain', location_code: 2724, language_code: 'es' },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
];

export default function AiOptimizationPage() {
  const [url, setUrl] = useState('');
  const [keywordsRaw, setKeywordsRaw] = useState('');
  const [locationIdx, setLocationIdx] = useState('0');
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const onRun = async () => {
    if (!url.trim()) {
      toast.error('Enter a landing page URL.');
      return;
    }
    const keywords = keywordsRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (keywords.length === 0) {
      toast.error('Enter at least one target keyword.');
      return;
    }
    const loc = LOCATIONS[parseInt(locationIdx, 10)];
    setBusy(true);
    try {
      const data: any = await aiSeoService.runAiOptimization({
        url: url.trim(),
        keywords,
        location_code: loc.location_code,
        language_code: language,
      });
      setResult(data);
    } catch (err: any) {
      toast.error(err?.message || 'Optimization failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage
      eyebrow="AI SEO"
      icon={Sparkles}
      title="AI optimization"
      description="Rewrite and structure a page so that LLM surfaces represent it accurately."
      twoColumn
    >
      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opt-url">Landing page URL</Label>
            <div className="relative">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
              <Input
                id="opt-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opt-kw">Target keywords (max 10)</Label>
            <Textarea
              id="opt-kw"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              placeholder={`one per line`}
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="flex items-center gap-1.5">
                <Target className="size-3.5" /> Location
              </Label>
              <Select value={locationIdx} onValueChange={setLocationIdx}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l, i) => (
                    <SelectItem key={l.location_code} value={String(i)}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="flex items-center gap-1.5">
                <Languages className="size-3.5" /> Language
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="lg" onClick={onRun} disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Run optimization
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {!result ? (
          <EmptyState
            icon={Sparkles}
            title="No analysis yet"
            description="Enter a URL and target keywords. We'll surface LLM-friendly rewrites and structural suggestions."
          />
        ) : (
          <>
            {result.queries?.map((q: any, i: number) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="accent">{q.keyword}</Badge>
                    {q.intent && <Badge variant="outline">{q.intent}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                    {q.suggestions || (
                      <span className="text-foreground-subtle">
                        No suggestions returned for this query.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {result.summary && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="size-4" /> Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {result.summary}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ToolPage>
  );
}
