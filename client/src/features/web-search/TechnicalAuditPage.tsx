import { useMemo, useState } from 'react';
import { Plus, BarChart2, Globe, ChevronUp, ChevronDown, AlertCircle, AlertTriangle, Info, Download, ShieldAlert } from 'lucide-react';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
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
import { cn } from '@/shared/lib/cn';

const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    name: 'Valyoufurniture',
    url: 'valyoufurniture.com',
    lastCrawl: '23 Nov 06:38 PM',
    status: 'Completed',
    health: 86,
    healthDelta: -2,
    crawled: 1057,
    errors: 1039,
    plan: 'Basic',
  },
  {
    id: 'proj-2',
    name: 'Notionhive',
    url: 'notionhive.ca',
    lastCrawl: '24 Nov 02:27 PM',
    status: 'Completed',
    health: 99,
    healthDelta: 2,
    crawled: 26,
    errors: 1,
    plan: 'Basic',
  },
  {
    id: 'proj-3',
    name: 'AlphaTradingIntl',
    url: 'alphatradingintl.com',
    lastCrawl: '9 Nov 08:05 PM',
    status: 'Completed',
    health: 99,
    healthDelta: 0,
    crawled: 1753,
    errors: 13,
    plan: 'Basic',
  },
];

const MOCK_OVERVIEW = {
  health: 86,
  issues: { errors: 1257, warnings: 2888, notices: 1732 },
  topIssues: [
    { sev: 'error', title: '404 page', crawled: 139, change: '+2' },
    { sev: 'warning', title: 'Missing alt text', crawled: 909, change: '+7' },
    { sev: 'notice', title: 'Indexable page became non-indexable', crawled: 1, change: '+1' },
  ],
};

const MOCK_GROUPS = [
  {
    label: 'Internal pages',
    items: [
      { sev: 'error', title: '404 page', crawled: 139, change: '+2' },
      { sev: 'error', title: '4XX page', crawled: 139, change: '+2' },
    ],
  },
  {
    label: 'Indexability',
    items: [
      { sev: 'warning', title: 'Noindex page', crawled: 2, change: '0' },
      { sev: 'notice', title: 'Indexable page became non-indexable', crawled: 1, change: '+1' },
    ],
  },
  {
    label: 'Links',
    items: [
      { sev: 'warning', title: 'Page has links to broken page', crawled: 587, change: '+2' },
      { sev: 'warning', title: 'Orphan page (no internal links)', crawled: 25, change: '0' },
    ],
  },
];

function healthTone(score: number) {
  if (score >= 95) return 'mint' as const;
  if (score >= 80) return 'butter' as const;
  return 'rose' as const;
}

function SevIcon({ sev }: { sev: string }) {
  if (sev === 'error') return <AlertCircle className="size-3.5 text-rose-ink" />;
  if (sev === 'warning') return <AlertTriangle className="size-3.5 text-butter-ink" />;
  return <Info className="size-3.5 text-sky-ink" />;
}

export default function TechnicalAuditPage() {
  const [selectedId, setSelectedId] = useState(MOCK_PROJECTS[0].id);
  const [creating, setCreating] = useState(false);
  const selected = useMemo(() => MOCK_PROJECTS.find((p) => p.id === selectedId), [selectedId]);

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={ShieldAlert}
      title="Technical audit"
      description="Crawl-driven site health, issue tracking, and indexability inspection."
      actions={
        <>
          <Badge variant="butter">Demo data</Badge>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New project
          </Button>
        </>
      }
    >
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Last crawl</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">URLs crawled</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead>Plan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_PROJECTS.map((p) => {
              const tone = healthTone(p.health);
              return (
                <TableRow
                  key={p.id}
                  data-state={p.id === selectedId ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(p.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="size-7 rounded-md bg-surface-muted flex items-center justify-center">
                        <Globe className="size-3.5 text-foreground-subtle" />
                      </span>
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-foreground-subtle">{p.url}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-foreground-muted">{p.lastCrawl}</TableCell>
                  <TableCell>
                    <Badge variant="mint">{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={tone}>{p.health}%</Badge>
                      {p.healthDelta !== 0 && (
                        <span
                          className={cn(
                            'text-[11px] flex items-center gap-0.5',
                            p.healthDelta > 0 ? 'text-mint-ink' : 'text-rose-ink'
                          )}
                        >
                          {p.healthDelta > 0 ? (
                            <ChevronUp className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          )}
                          {Math.abs(p.healthDelta)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {p.crawled.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {p.errors.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.plan}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {selected && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">All issues</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    Health score <BarChart2 className="size-3.5 text-foreground-subtle" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3 py-6">
                  <div
                    className={cn(
                      'flex size-24 items-center justify-center rounded-full text-3xl font-semibold tabular-nums',
                      healthTone(MOCK_OVERVIEW.health) === 'mint' && 'bg-mint text-mint-ink',
                      healthTone(MOCK_OVERVIEW.health) === 'butter' && 'bg-butter text-butter-ink',
                      healthTone(MOCK_OVERVIEW.health) === 'rose' && 'bg-rose text-rose-ink'
                    )}
                  >
                    {MOCK_OVERVIEW.health}
                  </div>
                  <Badge variant={healthTone(MOCK_OVERVIEW.health)}>Good</Badge>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Issues distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <BarRow
                    label="Errors"
                    count={MOCK_OVERVIEW.issues.errors}
                    pct={60}
                    tone="rose"
                  />
                  <BarRow
                    label="Warnings"
                    count={MOCK_OVERVIEW.issues.warnings}
                    pct={80}
                    tone="butter"
                  />
                  <BarRow
                    label="Notices"
                    count={MOCK_OVERVIEW.issues.notices}
                    pct={40}
                    tone="sky"
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm">Top issues</CardTitle>
                    <Button variant="outline" size="sm">
                      <Download className="size-3.5" /> Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead className="text-right">Crawled</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_OVERVIEW.topIssues.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span className="flex items-center gap-2 text-sm">
                              <SevIcon sev={it.sev} />
                              {it.title}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{it.crawled}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground-muted">
                            {it.change}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="issues">
            <div className="flex flex-col gap-4">
              {MOCK_GROUPS.map((g) => (
                <Card key={g.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{g.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Issue</TableHead>
                          <TableHead className="text-right">Crawled</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.items.map((it, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <span className="flex items-center gap-2 text-sm">
                                <SevIcon sev={it.sev} />
                                {it.title}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{it.crawled}</TableCell>
                            <TableCell className="text-right tabular-nums text-foreground-muted">
                              {it.change}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New audit project</DialogTitle>
            <DialogDescription>
              Define the domain and crawl ceiling. Live crawl scheduling is in development.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ta-domain">Domain</Label>
              <Input id="ta-domain" placeholder="https://example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Crawl limit</Label>
              <Select defaultValue="1000">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 pages</SelectItem>
                  <SelectItem value="500">500 pages</SelectItem>
                  <SelectItem value="1000">1,000 pages</SelectItem>
                  <SelectItem value="5000">5,000 pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => setCreating(false)}>Start crawl</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPage>
  );
}

function BarRow({
  label,
  count,
  pct,
  tone,
}: {
  label: string;
  count: number;
  pct: number;
  tone: 'rose' | 'butter' | 'sky';
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 text-foreground-muted">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-inset overflow-hidden">
        <div
          className={cn(
            'h-full transition-[width] duration-500',
            tone === 'rose' && 'bg-rose-ink/70',
            tone === 'butter' && 'bg-butter-ink/70',
            tone === 'sky' && 'bg-sky-ink/70'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm tabular-nums w-16 text-right">{count.toLocaleString()}</span>
    </div>
  );
}
