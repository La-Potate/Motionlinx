import { useState } from 'react';
import { ShieldAlert, Send } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/sonner';
import { aiAssistantService } from '@/shared/api/aiAssistant';

type Props = {
  projectId: number;
  siteUrls: string[];
  onSubmitted?: () => void;
};

export function SitemapGate({ projectId, siteUrls, onSubmitted }: Props) {
  const [siteUrl, setSiteUrl] = useState(siteUrls[0] || '');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!siteUrl || !sitemapUrl) return;
    setBusy(true);
    try {
      await aiAssistantService.submitSitemap(projectId, siteUrl, sitemapUrl);
      toast.success('Sitemap submitted');
      onSubmitted?.();
    } catch (err: any) {
      if (err?.code === 'gsc_forbidden') {
        toast.error('GSC rejected the submission — your account may not have write access. Try submitting it inside GSC instead.');
      } else {
        toast.error(err?.message || 'Failed to submit sitemap');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 flex flex-col gap-4 border-rose bg-rose/20">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-md bg-rose text-rose-ink shrink-0">
          <ShieldAlert className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold tracking-tight text-rose-ink">
            No sitemap submitted
          </h3>
          <p className="text-sm text-foreground-muted">
            Search Console reports no sitemap for the mapped propert
            {siteUrls.length === 1 ? 'y' : 'ies'}. Submit one to unlock the full
            analysis — without it we can only score what GSC sees on its own.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-3">
        <select
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-mono"
        >
          {siteUrls.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          placeholder="https://example.com/sitemap.xml"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
        />
      </div>

      <div>
        <Button onClick={submit} disabled={busy || !sitemapUrl}>
          <Send className="size-4" />
          {busy ? 'Submitting…' : 'Submit sitemap'}
        </Button>
      </div>
    </Card>
  );
}
