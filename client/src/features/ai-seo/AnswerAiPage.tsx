import { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Globe, Search, MapPin, Sparkles, HelpCircle } from 'lucide-react';
import aiSeoService from '@/shared/api/aiSeo';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/sonner';
import { stagger } from '@/shared/motion/presets';

type Result = {
  peopleAlsoAsk?: any[];
  relatedSearches?: any[];
  topDomains?: { domain: string; count: number }[];
  headings?: string[];
  gaps?: string[];
  recommendations?: string[];
};

export default function AnswerAiPage() {
  const [keyword, setKeyword] = useState('');
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !url.trim()) {
      toast.error('Enter a keyword and landing page URL.');
      return;
    }
    setBusy(true);
    try {
      const data = await aiSeoService.answerAi({ keyword, url, location });
      setResult(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to run the audit.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage
      eyebrow="AI SEO"
      icon={HelpCircle}
      title="Answer the AI"
      description="See how people search around your keyword, who is surfacing, and what gaps to close on your landing page."
      twoColumn
    >
      <Card>
        <CardHeader>
          <CardTitle>Audit inputs</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              id="keyword"
              label="Keyword"
              icon={<Search className="size-4 text-foreground-subtle" />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. lemon law attorney texas"
            />
            <Field
              id="url"
              label="Landing page URL"
              icon={<Globe className="size-4 text-foreground-subtle" />}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourdomain.com/page"
            />
            <Field
              id="location"
              label={
                <span className="flex items-baseline gap-2">
                  Location <span className="text-foreground-subtle text-xs">optional</span>
                </span>
              }
              icon={<MapPin className="size-4 text-foreground-subtle" />}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Austin, TX"
            />
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Auditing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Run audit
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        {!result ? (
          <EmptyState
            icon={Sparkles}
            title="No audit yet"
            description="Run an audit on the left to see People-Also-Ask, related searches, top domains, on-page coverage, and recommendations."
          />
        ) : (
          <motion.div
            variants={stagger.container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <ResultPanel title="People also ask">
              {renderList(result.peopleAlsoAsk, (i: any) => i.question || i.title || i)}
            </ResultPanel>
            <ResultPanel title="Related searches">
              {renderList(result.relatedSearches, (i: any) => i.query || i.title || i)}
            </ResultPanel>
            <ResultPanel title="Top domains">
              {renderList(result.topDomains, (i: any) => `${i.domain} · ${i.count}`)}
            </ResultPanel>
            <ResultPanel title="Page headings">
              {renderList(result.headings, (t: string) => t)}
            </ResultPanel>
            <ResultPanel title="Content gaps" tone="rose">
              {renderList(result.gaps, (g: string) => g)}
            </ResultPanel>
            <ResultPanel title="Recommendations" tone="mint">
              {renderList(result.recommendations, (r: string) => r)}
            </ResultPanel>
          </motion.div>
        )}
      </div>
    </ToolPage>
  );
}

function Field({
  id,
  label,
  icon,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{icon}</span>
        )}
        <Input id={id} className={icon ? 'pl-8' : ''} {...input} />
      </div>
    </div>
  );
}

function ResultPanel({
  title,
  tone = 'default',
  children,
}: {
  title: string;
  tone?: 'default' | 'mint' | 'rose';
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={stagger.item}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span
              className={
                tone === 'mint'
                  ? 'size-1.5 rounded-full bg-mint-ink'
                  : tone === 'rose'
                    ? 'size-1.5 rounded-full bg-rose-ink'
                    : 'size-1.5 rounded-full bg-accent'
              }
            />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

function renderList(items: any[] | undefined, render: (item: any) => React.ReactNode) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-foreground-subtle">No data.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-foreground">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-baseline gap-2 leading-snug"
        >
          <span className="mt-1 size-1 rounded-full bg-border-strong shrink-0" />
          <span>{render(item)}</span>
        </li>
      ))}
    </ul>
  );
}
