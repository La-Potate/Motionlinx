import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  StopCircle,
  AlertCircle,
} from 'lucide-react';
import aiSeoService from '@/shared/api/aiSeo';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import { toast } from '@/shared/ui/sonner';

type LlmsResult = {
  body?: string;
  llmsUrl?: string;
  status?: number;
  fetchedVia?: string;
};

type Generated = {
  llmsText?: string;
  urls?: string[];
  sitemap?: { url?: string };
  stats?: { detected?: number; processed?: number };
};

export default function LlmValidatorPage() {
  const [domain, setDomain] = useState('');
  const [llms, setLlms] = useState<LlmsResult | null>(null);
  const [busyVal, setBusyVal] = useState(false);

  const [generated, setGenerated] = useState<Generated | null>(null);
  const [busyGen, setBusyGen] = useState(false);
  const [progress, setProgress] = useState({ detected: 0, processed: 0 });
  const [exportedOnce, setExportedOnce] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasUnsavedWork = useMemo(
    () => busyGen || (!!generated && !exportedOnce),
    [busyGen, generated, exportedOnce]
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWork) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  const resetGen = () => {
    setGenerated(null);
    setProgress({ detected: 0, processed: 0 });
    setExportedOnce(false);
  };

  const onValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = domain.trim();
    if (!v) {
      toast.error('Enter a domain to fetch llms.txt.');
      return;
    }
    resetGen();
    setBusyVal(true);
    try {
      const data = await aiSeoService.validateLlms(v);
      setLlms(data);
    } catch (err: any) {
      setLlms(null);
      toast.error(err?.message || 'Unable to fetch llms.txt');
    } finally {
      setBusyVal(false);
    }
  };

  const startProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((p) => ({
        detected: Math.max(p.detected, p.processed + 3),
        processed: Math.min(p.detected + 1, p.processed + 5),
      }));
    }, 400);
  };

  const stopProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const onGenerate = async () => {
    const v = domain.trim();
    if (!v) {
      toast.error('Enter a domain to generate llms.txt');
      return;
    }
    setBusyGen(true);
    setGenerated(null);
    setExportedOnce(false);
    setProgress({ detected: 0, processed: 0 });
    const controller = new AbortController();
    controllerRef.current = controller;
    startProgress();
    try {
      const data = await aiSeoService.generateLlms(v, { signal: controller.signal });
      setGenerated(data);
      setProgress({
        detected: data?.stats?.detected || data?.urls?.length || 0,
        processed: data?.stats?.processed || data?.urls?.length || 0,
      });
    } catch (err: any) {
      if (controller.signal.aborted) {
        toast.info?.('Generation stopped. Showing latest progress.');
      } else {
        toast.error(err?.message || 'Failed to generate llms.txt');
      }
    } finally {
      stopProgress();
      setBusyGen(false);
    }
  };

  const onStop = () => {
    controllerRef.current?.abort();
    stopProgress();
    setBusyGen(false);
  };

  const onExport = () => {
    if (!generated?.llmsText) return;
    const blob = new Blob([generated.llmsText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(domain || 'llms').replace(/[^a-z0-9.-]/gi, '_')}-llms.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportedOnce(true);
    toast.success('llms.txt downloaded');
  };

  const llmsBody = llms?.body || '';
  const isMissing = llms !== null && !llmsBody;
  const pct = progress.detected
    ? Math.min(100, (progress.processed / Math.max(progress.detected, 1)) * 100)
    : 0;

  return (
    <ToolPage
      eyebrow="AI SEO"
      icon={Bot}
      title="LLMs validator & generator"
      description={
        <span>
          Validate your <code className="px-1 rounded bg-surface-muted text-foreground">llms.txt</code>{' '}
          and scaffold a fresh one from your sitemap.
        </span>
      }
    >
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onValidate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="llm-domain">Domain</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle text-xs">
                  https://
                </span>
                <Input
                  id="llm-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="pl-16"
                />
              </div>
            </div>
            <Button type="submit" disabled={busyVal} size="lg">
              {busyVal ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Validate
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {llms && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot className="size-4" />
                {llms.llmsUrl || 'URL unavailable'}
              </CardTitle>
              <div className="flex gap-2">
                {typeof llms.status === 'number' && (
                  <Badge variant="outline">HTTP {llms.status}</Badge>
                )}
                {llms.fetchedVia && (
                  <Badge variant="outline">via {String(llms.fetchedVia).toUpperCase()}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isMissing ? (
              <div className="flex items-center gap-2 rounded-md bg-rose/30 border border-rose px-3 py-2 text-sm text-rose-ink">
                <AlertCircle className="size-4" />
                llms.txt not found. Generate one below.
              </div>
            ) : (
              <pre className="rounded-md bg-surface-muted p-4 text-xs font-mono whitespace-pre-wrap max-h-[400px] overflow-auto">
                {llmsBody}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Generate a fresh llms.txt</CardTitle>
              <p className="text-sm text-foreground-muted mt-1">
                Crawl the sitemap and assemble a compliant file.
              </p>
            </div>
            <Button onClick={onGenerate} disabled={busyGen} variant="accent">
              {busyGen ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <RefreshCcw className="size-4" /> Generate
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-4">
          {busyGen && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-foreground-muted">
                <span>
                  <strong className="text-foreground tabular-nums">{progress.processed}</strong>{' '}
                  / {progress.detected} URLs processed
                </span>
                <Button variant="ghost" size="sm" onClick={onStop}>
                  <StopCircle className="size-3.5" /> Stop
                </Button>
              </div>
              <Progress value={pct} />
            </div>
          )}

          {generated && (
            <>
              <div className="flex items-center flex-wrap gap-2">
                <Badge variant="mint">
                  <CheckCircle2 className="size-3" /> Generated
                </Badge>
                <Badge variant="outline">
                  {generated.stats?.processed || generated.urls?.length || 0} URLs
                </Badge>
                {generated.sitemap?.url && (
                  <a
                    href={generated.sitemap.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    View sitemap
                  </a>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  className="ml-auto"
                >
                  <Download className="size-3.5" /> Export
                </Button>
              </div>
              <pre className="rounded-md bg-surface-muted p-4 text-xs font-mono whitespace-pre-wrap max-h-[400px] overflow-auto">
                {generated.llmsText}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </ToolPage>
  );
}
