import { useMemo, useState } from 'react';
import {
  FileJson,
  Loader2,
  Copy,
  Check,
  Download,
  Wand2,
  Globe,
} from 'lucide-react';
import authenticatedFetch from '@/shared/api/httpClient';
import { ToolPage } from '@/shared/components/ToolPage';
import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/sonner';

const SCHEMA_TYPES = [
  { value: 'Organization', label: 'Organization', fields: ['name', 'url', 'logo', 'description', 'sameAs'] },
  {
    value: 'LocalBusiness',
    label: 'Local Business',
    fields: ['name', 'url', 'telephone', 'address', 'priceRange', 'openingHours'],
  },
  { value: 'Product', label: 'Product', fields: ['name', 'image', 'description', 'sku', 'brand', 'price', 'priceCurrency'] },
  { value: 'Article', label: 'Article', fields: ['headline', 'image', 'datePublished', 'author', 'description'] },
  { value: 'BlogPosting', label: 'Blog Posting', fields: ['headline', 'image', 'datePublished', 'author', 'description'] },
  { value: 'BreadcrumbList', label: 'Breadcrumb', fields: ['items'] },
  { value: 'FAQPage', label: 'FAQ', fields: ['questions'] },
  { value: 'Event', label: 'Event', fields: ['name', 'startDate', 'endDate', 'location', 'description'] },
  { value: 'Recipe', label: 'Recipe', fields: ['name', 'image', 'description', 'recipeIngredient', 'recipeInstructions'] },
  { value: 'Course', label: 'Course', fields: ['name', 'description', 'provider'] },
  { value: 'Person', label: 'Person', fields: ['name', 'url', 'image', 'jobTitle', 'sameAs'] },
  { value: 'WebPage', label: 'Web Page', fields: ['name', 'url', 'description'] },
];

function buildSchema(type: string, fields: Record<string, string>) {
  const base: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': type,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    if (k === 'sameAs') {
      base[k] = v
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (k === 'items' && type === 'BreadcrumbList') {
      base.itemListElement = v
        .split('\n')
        .map((line, i) => {
          const [name, url] = line.split('|').map((s) => s.trim());
          if (!name) return null;
          return {
            '@type': 'ListItem',
            position: i + 1,
            name,
            item: url || undefined,
          };
        })
        .filter(Boolean);
    } else if (k === 'questions' && type === 'FAQPage') {
      base.mainEntity = v
        .split('\n\n')
        .map((block) => {
          const [q, ...rest] = block.split('\n');
          return q && rest.length
            ? {
                '@type': 'Question',
                name: q.trim(),
                acceptedAnswer: { '@type': 'Answer', text: rest.join('\n').trim() },
              }
            : null;
        })
        .filter(Boolean);
    } else if (k === 'address' && type === 'LocalBusiness') {
      base.address = { '@type': 'PostalAddress', streetAddress: v };
    } else if (k === 'recipeIngredient' || k === 'recipeInstructions') {
      base[k] = v.split('\n').map((s) => s.trim()).filter(Boolean);
    } else if (k === 'price') {
      base.offers = {
        '@type': 'Offer',
        price: v,
        priceCurrency: fields.priceCurrency || 'USD',
      };
    } else if (k === 'priceCurrency') {
      // handled with price
    } else {
      base[k] = v;
    }
  }
  return base;
}

export default function SchemaGeneratorPage() {
  const [type, setType] = useState('Organization');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [autofillUrl, setAutofillUrl] = useState('');
  const [autofilling, setAutofilling] = useState(false);
  const [copied, setCopied] = useState(false);

  const def = SCHEMA_TYPES.find((s) => s.value === type)!;
  const schema = useMemo(() => buildSchema(type, fields), [type, fields]);
  const json = JSON.stringify(schema, null, 2);
  const html = `<script type="application/ld+json">\n${json}\n</script>`;

  const onAutofill = async () => {
    if (!autofillUrl.trim()) {
      toast.error('Enter a URL to autofill from.');
      return;
    }
    setAutofilling(true);
    try {
      const res = await authenticatedFetch('/api/schema/autofill', {
        method: 'POST',
        body: JSON.stringify({ url: autofillUrl.trim(), schemaType: type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Autofill failed');
      const next: Record<string, string> = { ...fields };
      for (const k of def.fields) {
        const v = data?.fields?.[k];
        if (v) next[k] = Array.isArray(v) ? v.join(', ') : String(v);
      }
      setFields(next);
      toast.success('Fields filled from URL');
    } catch (err: any) {
      toast.error(err?.message || 'Autofill failed');
    } finally {
      setAutofilling(false);
    }
  };

  const onCopy = () => {
    navigator.clipboard.writeText(html);
    setCopied(true);
    toast.success('Snippet copied');
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.schema.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={FileJson}
      title="Schema Generator"
      description="Generate valid JSON-LD snippets for 12+ schema types, with optional URL autofill."
      twoColumn
    >
      <Card>
        <CardHeader>
          <CardTitle>Configure schema</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setFields({}); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEMA_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="autofill">Autofill from URL (optional)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-foreground-subtle" />
                <Input
                  id="autofill"
                  value={autofillUrl}
                  onChange={(e) => setAutofillUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="pl-8"
                />
              </div>
              <Button onClick={onAutofill} disabled={autofilling}>
                {autofilling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Autofill
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {def.fields.map((field) => {
              const isLong =
                field === 'description' ||
                field === 'items' ||
                field === 'questions' ||
                field === 'recipeIngredient' ||
                field === 'recipeInstructions' ||
                field === 'sameAs';
              return (
                <div key={field} className="flex flex-col gap-1.5">
                  <Label htmlFor={`f-${field}`} className="capitalize">
                    {field.replace(/([A-Z])/g, ' $1')}
                  </Label>
                  {isLong ? (
                    <Textarea
                      id={`f-${field}`}
                      value={fields[field] || ''}
                      onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                      rows={4}
                      placeholder={
                        field === 'items'
                          ? 'Name | URL (one per line)'
                          : field === 'questions'
                            ? 'Question on line 1\nAnswer on line 2\n\nNext question…'
                            : field === 'sameAs'
                              ? 'one URL per line'
                              : ''
                      }
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      id={`f-${field}`}
                      value={fields[field] || ''}
                      onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <FileJson className="size-4" /> Output
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy snippet'}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="size-3.5" /> Download
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="snippet">
            <TabsList>
              <TabsTrigger value="snippet">HTML snippet</TabsTrigger>
              <TabsTrigger value="json">JSON-LD</TabsTrigger>
            </TabsList>
            <TabsContent value="snippet">
              <pre className="rounded-md bg-surface-muted p-4 text-xs font-mono whitespace-pre-wrap max-h-[600px] overflow-auto">
                {html}
              </pre>
            </TabsContent>
            <TabsContent value="json">
              <pre className="rounded-md bg-surface-muted p-4 text-xs font-mono whitespace-pre-wrap max-h-[600px] overflow-auto">
                {json}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ToolPage>
  );
}
