import {
  LayoutDashboard,
  MapPin,
  Globe,
  Sparkles,
  FileText,
  Settings,
  Shield,
  Search,
  FileJson,
  ShieldAlert,
  GitBranch,
  Link2,
  Map,
  ListChecks,
  Bot,
  HelpCircle,
  LineChart,
  type LucideIcon,
  PenSquare,
  Newspaper,
  Lightbulb,
} from 'lucide-react';

export type NavTab = {
  id: string;
  label: string;
  path: string;
  icon?: LucideIcon;
};

export const PRIMARY_TABS: NavTab[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { id: 'local-business', label: 'Local Business', path: '/local-business', icon: MapPin },
  { id: 'web-search', label: 'Web Search', path: '/web-search', icon: Globe },
  { id: 'ai-seo', label: 'AI SEO', path: '/ai-seo', icon: Sparkles },
  { id: 'content', label: 'Content', path: '/content', icon: FileText },
];

export const SETTINGS_TAB: NavTab = {
  id: 'settings',
  label: 'Settings',
  path: '/settings',
  icon: Settings,
};

/**
 * External credential a tool depends on. Surfaced on the dashboard so it is
 * obvious up front which tools run immediately and which need a key in
 * Settings first — rather than finding out by opening one and hitting an error.
 */
export type ToolRequirement =
  | 'DataForSEO'
  | 'Serper'
  | 'Google Places'
  | 'Anthropic'
  | 'Google Analytics'
  | 'Search Console';

export type ToolEntry = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  section: string;
  description?: string;
  keywords?: string[];
  /** Omitted when the tool runs with no external credential. */
  requires?: ToolRequirement;
};

export const ALL_TOOLS: ToolEntry[] = [
  // ---- Local Business ----
  {
    id: 'keyword-research',
    label: 'Keyword Research',
    path: '/local-business/keyword',
    icon: Search,
    section: 'Local Business',
    description: 'Discover local keyword opportunities and search volume.',
    keywords: ['keywords', 'local', 'research', 'volume'],
    requires: 'DataForSEO',
  },
  {
    id: 'gba',
    label: 'Google Business Audit',
    path: '/local-business/google-business-audit',
    icon: Sparkles,
    section: 'Local Business',
    description: 'Audit a Google Business profile for completeness.',
    keywords: ['gbp', 'audit', 'profile'],
    requires: 'DataForSEO',
  },
  {
    id: 'gba-compare',
    label: 'Compare Profiles',
    path: '/local-business/google-business-compare',
    icon: Sparkles,
    section: 'Local Business',
    description: 'Put two Google Business profiles side by side.',
    keywords: ['compare', 'competitor', 'gbp'],
    requires: 'DataForSEO',
  },
  {
    id: 'heatmap',
    label: 'Rank Heatmap',
    path: '/local-business/heatmap',
    icon: MapPin,
    section: 'Local Business',
    description: 'Grid-scan local rankings across a geographic area.',
    keywords: ['grid', 'map', 'rank', 'geo'],
    requires: 'Google Places',
  },
  {
    id: 'citations',
    label: 'Business Citations',
    path: '/local-business/citations',
    icon: FileText,
    section: 'Local Business',
    description: 'Audit NAP consistency across 52 US and 38 UK directories.',
    keywords: ['nap', 'directory', 'listings', 'citation'],
    requires: 'Serper',
  },

  // ---- Web Search ----
  {
    id: 'site-marker',
    label: 'Site Marker',
    path: '/web-search/site-marker',
    icon: MapPin,
    section: 'Web Search',
    description: 'Capture a live page and annotate it with shareable markers.',
    keywords: ['annotate', 'capture', 'share', 'screenshot'],
  },
  {
    id: 'map-element',
    label: 'Map Element',
    path: '/web-search/map-element',
    icon: Map,
    section: 'Web Search',
    description: 'Build an embeddable map snippet for any address.',
    keywords: ['embed', 'iframe', 'map'],
  },
  {
    id: 'schema-generator',
    label: 'Schema Generator',
    path: '/web-search/schema-generator',
    icon: FileJson,
    section: 'Web Search',
    description: 'Autofill LocalBusiness, Article and FAQ JSON-LD from a URL.',
    keywords: ['json-ld', 'structured data', 'markup'],
  },
  {
    id: 'technical-audit',
    label: 'Technical Audit',
    path: '/web-search/technical-audit',
    icon: ShieldAlert,
    section: 'Web Search',
    description: 'Site-wide technical issue report.',
    keywords: ['audit', 'issues', 'technical'],
  },
  {
    id: 'bulk-index',
    label: 'Bulk Index Checker',
    path: '/web-search/bulk-index-checker',
    icon: ListChecks,
    section: 'Web Search',
    description: 'Check indexation status for many URLs at once.',
    keywords: ['index', 'google', 'bing', 'bulk'],
    requires: 'DataForSEO',
  },
  {
    id: 'bulk-http',
    label: 'Bulk HTTP Checker',
    path: '/web-search/bulk-http-checker',
    icon: Link2,
    section: 'Web Search',
    description: 'Resolve status codes and redirect chains in bulk.',
    keywords: ['redirect', 'status', '301', 'http'],
  },
  {
    id: 'site-tree',
    label: 'Site Tree Generator',
    path: '/web-search/site-tree',
    icon: GitBranch,
    section: 'Web Search',
    description: 'Build a full URL tree from a sitemap or crawl.',
    keywords: ['sitemap', 'crawl', 'structure', 'tree'],
  },

  // ---- AI SEO ----
  {
    id: 'ai-keyword-data',
    label: 'AI Keyword Data',
    path: '/ai-seo/keyword-data',
    icon: Search,
    section: 'AI SEO',
    description: 'Keyword metrics shaped for AI search surfaces.',
    keywords: ['keywords', 'ai', 'data'],
    requires: 'DataForSEO',
  },
  {
    id: 'ai-optimization',
    label: 'AI Optimization',
    path: '/ai-seo/ai-optimization',
    icon: Sparkles,
    section: 'AI SEO',
    description: 'Scrape how LLM-backed SERPs answer your queries.',
    keywords: ['llm', 'serp', 'optimize'],
    requires: 'DataForSEO',
  },
  {
    id: 'crawler-access',
    label: 'Crawler Access Checker',
    path: '/ai-seo/crawler-access-checker',
    icon: Shield,
    section: 'AI SEO',
    description: 'Evaluate robots.txt against 27 AI and search crawlers.',
    keywords: ['robots', 'crawler', 'bot', 'access'],
  },
  {
    id: 'llms-validator',
    label: 'LLMS.txt Validator',
    path: '/ai-seo/llms-validator',
    icon: Bot,
    section: 'AI SEO',
    description: 'Validate an existing llms.txt, or generate one from a sitemap.',
    keywords: ['llms.txt', 'validate', 'generate'],
  },
  {
    id: 'answer-ai',
    label: 'Answer the AI',
    path: '/ai-seo/answer-ai',
    icon: HelpCircle,
    section: 'AI SEO',
    description: 'Find People-Also-Ask gaps your content does not cover.',
    keywords: ['paa', 'questions', 'gap'],
    requires: 'Serper',
  },

  // ---- Content ----
  {
    id: 'beyond-intent',
    label: 'Beyond Intent',
    path: '/content/beyond-intent',
    icon: Lightbulb,
    section: 'Content',
    description: 'Expand a keyword into adjacent intent-driven angles.',
    keywords: ['intent', 'ideas', 'angles'],
    requires: 'Anthropic',
  },
  {
    id: 'press-release',
    label: 'Press Release',
    path: '/content/press-release',
    icon: Newspaper,
    section: 'Content',
    description: 'Draft a distribution-ready press release.',
    keywords: ['pr', 'press', 'announcement'],
    requires: 'Anthropic',
  },
  {
    id: 'blog-post',
    label: 'Blog Post',
    path: '/content/blog-post',
    icon: PenSquare,
    section: 'Content',
    description: 'Generate a long-form post from a brief.',
    keywords: ['blog', 'article', 'writing'],
    requires: 'Anthropic',
  },
];

/**
 * Section metadata in the order the dashboard renders them. `id` matches the
 * PRIMARY_TABS id so a section heading can link straight to its hub.
 */
export type ToolSection = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  blurb: string;
};

export const TOOL_SECTIONS: ToolSection[] = [
  {
    id: 'local-business',
    label: 'Local Business',
    path: '/local-business',
    icon: MapPin,
    blurb: 'Map presence, local keywords and citation hygiene.',
  },
  {
    id: 'web-search',
    label: 'Web Search',
    path: '/web-search',
    icon: Globe,
    blurb: 'Technical health, schema coverage and indexability.',
  },
  {
    id: 'ai-seo',
    label: 'AI SEO',
    path: '/ai-seo',
    icon: Sparkles,
    blurb: 'How language models reach, read and cite your content.',
  },
  {
    id: 'content',
    label: 'Content',
    path: '/content',
    icon: FileText,
    blurb: 'Briefs to publish-ready drafts.',
  },
];

/** Tools belonging to a section, in declaration order. */
export function toolsForSection(sectionLabel: string): ToolEntry[] {
  return ALL_TOOLS.filter((t) => t.section === sectionLabel);
}

/**
 * Standalone apps — these are whole workspaces rather than single-purpose
 * tools, so the dashboard gives them their own row above the tool grid.
 */
export type AppEntry = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
  requires?: ToolRequirement;
};

export const STANDALONE_APPS: AppEntry[] = [
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    path: '/AI-Assistant',
    icon: Bot,
    description:
      'Runs a full technical, content and internal-linking audit per project, with run-over-run diffing and prioritised tasks.',
    requires: 'Search Console',
  },
  {
    id: 'ai-traffic-report',
    label: 'AI Traffic Report',
    path: '/ai-traffic-report',
    icon: LineChart,
    description:
      'Breaks your analytics traffic down by AI engine — ChatGPT, Gemini, Perplexity, Claude and more.',
    requires: 'Google Analytics',
  },
];

export const HUB_DEFS = {
  'local-business': {
    eyebrow: 'Local Business',
    title: 'Local presence toolkit',
    description: 'Map intelligence, keyword discovery and citation hygiene for businesses with a service footprint.',
    accent: 'mint' as const,
  },
  'web-search': {
    eyebrow: 'Web Search',
    title: 'SERP intelligence toolkit',
    description: 'Inspect the technical health, schema coverage, and indexability of any site.',
    accent: 'sky' as const,
  },
  'ai-seo': {
    eyebrow: 'AI SEO',
    title: 'AI surface intelligence',
    description: 'Understand how language models reach, read, and represent your content.',
    accent: 'lavender' as const,
  },
  content: {
    eyebrow: 'Content',
    title: 'Content production',
    description: 'Generate, edit, and route long-form content from brief to publish-ready.',
    accent: 'butter' as const,
  },
};
