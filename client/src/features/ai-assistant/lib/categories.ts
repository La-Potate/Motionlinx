import type { LucideIcon } from 'lucide-react';
import { Wrench, FileText, Layout, Link as LinkIcon, Sparkles, TrendingUp } from 'lucide-react';

export type CategoryKey =
  | 'technical'
  | 'content'
  | 'onpage'
  | 'internal-linking'
  | 'geo'
  | 'opportunity';

export const CATEGORY_META: Record<CategoryKey, { label: string; icon: LucideIcon; accent: string }> = {
  technical: { label: 'Technical', icon: Wrench, accent: 'bg-rose/40 text-rose-ink' },
  content: { label: 'Content', icon: FileText, accent: 'bg-butter/40 text-butter-ink' },
  onpage: { label: 'On-page', icon: Layout, accent: 'bg-sky/40 text-sky-ink' },
  'internal-linking': { label: 'Internal links', icon: LinkIcon, accent: 'bg-mint/40 text-mint-ink' },
  geo: { label: 'GEO / AI', icon: Sparkles, accent: 'bg-lavender/40 text-lavender-ink' },
  opportunity: { label: 'Opportunity', icon: TrendingUp, accent: 'bg-accent-soft text-accent-pressed' },
};

export const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-rose-ink',
  high: 'text-rose-ink',
  medium: 'text-butter-ink',
  low: 'text-foreground-muted',
};

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-mint-ink';
  if (score >= 60) return 'text-butter-ink';
  if (score >= 40) return 'text-accent-pressed';
  return 'text-rose-ink';
}

export function scoreRingClass(score: number): string {
  if (score >= 80) return 'bg-mint';
  if (score >= 60) return 'bg-butter';
  if (score >= 40) return 'bg-accent-soft';
  return 'bg-rose';
}
