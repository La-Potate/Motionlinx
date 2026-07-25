import { useCallback, useRef, useState } from 'react';
import {
  Search,
  Brain,
  Target,
  FileText,
  Layout,
  Key,
  PenTool,
  Share2,
  Package,
  Loader2,
  Play,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import authenticatedFetch from '@/shared/api/httpClient';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/cn';

type StepDef = {
  id: number;
  title: string;
  description: string;
  icon: LucideIcon;
  requires?: number;
};

const STEPS: StepDef[] = [
  { id: 1, title: 'Search queries', description: 'Generate authentic search queries', icon: Search },
  { id: 2, title: 'Intent analysis', description: 'Group queries by psychological intent', icon: Brain, requires: 1 },
  { id: 3, title: 'Driver matrix', description: 'Map emotional and functional drivers', icon: Target, requires: 2 },
  { id: 4, title: 'Content pillars', description: 'Generate article title options', icon: FileText, requires: 3 },
  { id: 5, title: 'Outline', description: 'Build a structured outline', icon: Layout, requires: 4 },
  { id: 6, title: 'Semantic keywords', description: 'Surface adjacent semantic clusters', icon: Key, requires: 5 },
  { id: 7, title: 'Article', description: 'Write the draft article', icon: PenTool, requires: 6 },
  { id: 8, title: 'Social posts', description: 'Generate social content', icon: Share2, requires: 7 },
  { id: 9, title: 'Export', description: 'Download the full bundle', icon: Package, requires: 8 },
];

type StepStatus = 'idle' | 'running' | 'done' | 'error';
type StepState = { status: StepStatus; message: string; data?: any };

function stripJSON(text: string) {
  if (!text) return null;
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1].trim());
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const STEP1_SYSTEM = (keyword: string) => `You are a search behavior research analyst. Generate 50 authentic search queries for: "${keyword}".

Requirements:
- Real queries (typos, abbreviations, conversational)
- Mix short (2-3 words) and long queries
- Include comparisons, "near me", questions, commercial intent

Return JSON: { "queries": [{ "query": "...", "intent": "informational|navigational|commercial|transactional", "volume_estimate": "high|medium|low" }] }`;

const STEP_PROMPTS: Record<number, (prev: any, keyword: string) => { system: string; user: string }> = {
  1: (_, keyword) => ({
    system: STEP1_SYSTEM(keyword),
    user: `Generate 50 realistic search queries for "${keyword}". Return only JSON.`,
  }),
  2: (prev) => ({
    system: `You are a search intent psychologist. Analyze and group queries:\n${JSON.stringify(prev[1]?.data?.queries, null, 2)}\n\nGroup into 3-5 intent categories. Return JSON: { "intentCategories": [{ "categoryName", "hiddenMotivations", "associatedQueries", "psychologicalProfile" }] }`,
    user: 'Identify intent categories. Return only JSON.',
  }),
  3: (prev) => ({
    system: `You are a behavioral economist. Build a driver matrix for:\n${JSON.stringify(prev[2]?.data?.intentCategories, null, 2)}\n\nReturn JSON: { "driverMatrix": [{ "intentCategory", "emotionalDrivers", "functionalDrivers", "decisionHeuristics", "contentOpportunities" }] }`,
    user: 'Build the driver matrix. Return only JSON.',
  }),
  4: (prev) => ({
    system: `Generate 10 article title pillars based on:\n${JSON.stringify(prev[3]?.data?.driverMatrix, null, 2)}\n\nReturn JSON: { "pillars": [{ "title", "angle", "intentCategory", "targetReader" }] }`,
    user: 'Generate 10 pillar titles. Return only JSON.',
  }),
  5: (prev) => ({
    system: `Build an article outline using these pillars:\n${JSON.stringify(prev[4]?.data?.pillars, null, 2)}\n\nReturn JSON: { "outline": [{ "section": "...", "subsections": ["..."] }] }`,
    user: 'Generate the outline. Return only JSON.',
  }),
  6: (prev) => ({
    system: `Find 30 semantic keywords adjacent to this outline:\n${JSON.stringify(prev[5]?.data?.outline, null, 2)}\n\nReturn JSON: { "keywords": [{ "term", "cluster", "intent" }] }`,
    user: 'Return only JSON.',
  }),
  7: (prev) => ({
    system: `Write the article based on this outline:\n${JSON.stringify(prev[5]?.data?.outline, null, 2)}\n\nIncorporate semantic keywords:\n${JSON.stringify(prev[6]?.data?.keywords, null, 2)}\n\nReturn JSON: { "article": "markdown content" }`,
    user: 'Write the full article. Return only JSON.',
  }),
  8: (prev) => ({
    system: `Generate 5 LinkedIn posts and 5 Twitter posts referencing this article:\n${(prev[7]?.data?.article || '').slice(0, 4000)}\n\nReturn JSON: { "linkedin": [...], "twitter": [...] }`,
    user: 'Return only JSON.',
  }),
  9: () => ({ system: '', user: '' }),
};

export default function BeyondIntentPage() {
  const [keyword, setKeyword] = useState('');
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const abortRef = useRef<AbortController | null>(null);

  const runStep = useCallback(
    async (stepId: number) => {
      if (stepId === 1 && !keyword.trim()) {
        toast.error('Enter a keyword to begin.');
        return;
      }
      if (stepId === 9) {
        const dump = { keyword, steps };
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beyond-intent-${keyword || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setSteps((p) => ({ ...p, 9: { status: 'done', message: 'Exported' } }));
        toast.success('Bundle exported.');
        return;
      }

      const def = STEPS.find((s) => s.id === stepId)!;
      if (def.requires && steps[def.requires]?.status !== 'done') {
        toast.error(`Finish step ${def.requires} first.`);
        return;
      }

      setSteps((p) => ({ ...p, [stepId]: { status: 'running', message: 'Working…' } }));
      try {
        const { system, user } = STEP_PROMPTS[stepId](steps, keyword);
        abortRef.current = new AbortController();
        const res = await authenticatedFetch('/api/content/beyond-intent/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: system, userPrompt: user }),
          signal: abortRef.current.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'API failed');
        const parsed = stripJSON(json.content);
        if (!parsed) throw new Error('Invalid response from model');
        setSteps((p) => ({
          ...p,
          [stepId]: {
            status: 'done',
            message: summarize(stepId, parsed),
            data: parsed,
          },
        }));
        toast.success(`Step ${stepId} complete`);
      } catch (err: any) {
        setSteps((p) => ({
          ...p,
          [stepId]: { status: 'error', message: err?.message || 'Failed' },
        }));
        toast.error(`Step ${stepId} failed: ${err?.message || 'unknown error'}`);
      }
    },
    [keyword, steps]
  );

  const reset = () => {
    abortRef.current?.abort();
    setSteps({});
  };

  return (
    <ToolPage
      eyebrow="Content"
      icon={Lightbulb}
      title="Generate Beyond Intent"
      description="Multi-stage research-to-article pipeline. Start with a keyword and progress through nine generation steps."
      actions={
        <Button variant="outline" onClick={reset}>
          <RotateCcw className="size-4" /> Reset
        </Button>
      }
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label htmlFor="bi-keyword">Seed keyword</Label>
              <Input
                id="bi-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. lemon law attorney texas"
              />
            </div>
            <Button size="lg" onClick={() => runStep(1)} disabled={steps[1]?.status === 'running'}>
              {steps[1]?.status === 'running' ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Running step 1…
                </>
              ) : (
                <>
                  <Play className="size-4" /> Start
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {STEPS.map((def) => {
          const state = steps[def.id];
          return (
            <StepRow
              key={def.id}
              def={def}
              state={state}
              onRun={() => runStep(def.id)}
              disabled={
                !!def.requires && steps[def.requires]?.status !== 'done'
              }
            />
          );
        })}
      </div>
    </ToolPage>
  );
}

function summarize(stepId: number, parsed: any) {
  if (stepId === 1) return `${parsed.queries?.length || 0} queries`;
  if (stepId === 2) return `${parsed.intentCategories?.length || 0} intent categories`;
  if (stepId === 3) return `${parsed.driverMatrix?.length || 0} driver matrices`;
  if (stepId === 4) return `${parsed.pillars?.length || 0} content pillars`;
  if (stepId === 5) return `${parsed.outline?.length || 0} sections`;
  if (stepId === 6) return `${parsed.keywords?.length || 0} keywords`;
  if (stepId === 7) return `~${(parsed.article || '').split(/\s+/).length} word article`;
  if (stepId === 8)
    return `${(parsed.linkedin || []).length} LinkedIn · ${(parsed.twitter || []).length} Twitter`;
  return 'Done';
}

function StepRow({
  def,
  state,
  onRun,
  disabled,
}: {
  def: StepDef;
  state?: StepState;
  onRun: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = def.icon;
  const status = state?.status || 'idle';
  const tone =
    status === 'done'
      ? 'mint'
      : status === 'error'
        ? 'rose'
        : status === 'running'
          ? 'butter'
          : 'default';

  return (
    <Card className={cn(disabled && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-pressed shrink-0">
            <Icon className="size-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-foreground-subtle">
                Step {def.id}
              </span>
              <span className="text-sm font-semibold">{def.title}</span>
              <Badge variant={tone as any}>
                {status === 'done' && <Check className="size-3" />}
                {status === 'idle'
                  ? 'Idle'
                  : status === 'running'
                    ? 'Running'
                    : status === 'done'
                      ? 'Done'
                      : 'Error'}
              </Badge>
            </div>
            <p className="text-xs text-foreground-muted mt-0.5">
              {state?.message || def.description}
            </p>
          </div>
          {state?.data && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(JSON.stringify(state.data, null, 2))
                  .then(() => toast.success('Copied JSON'))
              }
              aria-label="Copy JSON"
            >
              <Copy className="size-3.5" />
            </Button>
          )}
          {state?.data && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setExpanded((v) => !v)}
              aria-label="Toggle preview"
            >
              <ChevronRight
                className={cn(
                  'size-3.5 transition-transform',
                  expanded && 'rotate-90'
                )}
              />
            </Button>
          )}
          <Button
            size="sm"
            variant={status === 'done' ? 'outline' : 'default'}
            onClick={onRun}
            disabled={disabled || status === 'running'}
          >
            {status === 'running' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : status === 'done' ? (
              'Re-run'
            ) : def.id === 9 ? (
              'Export'
            ) : (
              'Run'
            )}
          </Button>
        </div>
        <AnimatePresence>
          {expanded && state?.data && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <pre className="mt-3 rounded-md bg-surface-muted p-3 text-[11px] font-mono max-h-72 overflow-auto">
                {JSON.stringify(state.data, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
