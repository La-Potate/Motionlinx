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
  TrendingUp,
  MessageSquare,
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
  | 'Google Search'
  | 'Anthropic'
  | 'Google Analytics'
  | 'Search Console';

/** Section colour keys. Each maps to a themed token pair in globals.css. */
export type Accent = 'mint' | 'sky' | 'lavender' | 'butter';

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
  /** Concrete things the tool produces. Rendered on the tool page so the
   *  purpose is clear before anyone spends a credit finding out. */
  whatItDoes?: string[];
};

/**
 * Where a requirement is satisfied. Powers deep links that open Settings on
 * the right tab AND scroll to the exact field, rather than dropping someone
 * on the Settings page to hunt for it.
 */
export const REQUIREMENT_SETUP: Record<
  ToolRequirement,
  { tab: string; field: string; what: string; adminOnly: boolean }
> = {
  DataForSEO: {
    tab: 'apis',
    field: 'dataForSeoLogin',
    what: 'a DataForSEO login and password',
    adminOnly: true,
  },
  Serper: {
    tab: 'apis',
    field: 'serperApiKey',
    what: 'a Serper.dev API key',
    adminOnly: true,
  },
  'Google Places': {
    tab: 'apis',
    field: 'googleApiKey',
    what: 'a Google API key with the Places API enabled',
    adminOnly: true,
  },
  'Google Search': {
    tab: 'apis',
    field: 'googleCx',
    what: 'a Google API key and a Search Engine ID (CX)',
    adminOnly: true,
  },
  Anthropic: {
    tab: 'apis',
    field: 'claudeApiKey',
    what: 'an Anthropic API key',
    adminOnly: true,
  },
  'Google Analytics': {
    tab: 'apis',
    field: 'googleOauthClientId',
    what: 'a Google OAuth client, then connect your own Google account',
    adminOnly: true,
  },
  'Search Console': {
    tab: 'apis',
    field: 'googleOauthClientId',
    what: 'a Google OAuth client, then connect your own Google account',
    adminOnly: true,
  },
};

/** Deep link that opens Settings focused on the field a requirement needs. */
export function settingsLinkFor(requirement: ToolRequirement): string {
  const setup = REQUIREMENT_SETUP[requirement];
  return `/settings?tab=${setup.tab}&highlight=${setup.field}`;
}

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
    whatItDoes: [
      'Pull search volume, difficulty and CPC for a seed keyword',
      'Expand into related local variations',
      'Filter by country and language',
    ],
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
    whatItDoes: [
      'Score a Google Business profile on completeness',
      'Flag missing categories, hours, photos and attributes',
      'Keep a per-user history of past audits',
    ],
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
    whatItDoes: [
      'Diff two Google Business profiles field by field',
      'Spot categories and attributes a competitor uses',
      'Save the comparison for later reference',
    ],
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
    whatItDoes: [
      'Scan rankings across a geographic grid around a location',
      'Show position drop-off as distance increases',
      'Save reports and regenerate them over time',
    ],
  },
  {
    id: 'rank-tracker',
    label: 'Rank Tracker',
    path: '/local-business/rank-tracker',
    icon: TrendingUp,
    section: 'Local Business',
    description: 'Track keyword positions for a business over time.',
    keywords: ['rank', 'position', 'tracking', 'keywords', 'serp'],
    requires: 'Google Search',
    whatItDoes: [
      'Track keyword positions per business, with best and worst seen',
      'Record positions by hand, or refresh them automatically',
      'Keep competitors, backlinks and traffic alongside them',
    ],
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
    whatItDoes: [
      'Check 52 US or 38 UK directories for your listing',
      'Compare found name, address, phone and site against yours',
      'Export the full result set as CSV',
    ],
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
    whatItDoes: [
      'Capture a live page exactly as it renders',
      'Drop positioned annotations anywhere on it',
      'Share a read-only link that needs no account',
    ],
  },
  {
    id: 'page-commenter',
    label: 'Page Commenter',
    path: '/web-search/page-commenter',
    icon: MessageSquare,
    section: 'Web Search',
    description: 'Capture a page and leave positioned comments for review.',
    keywords: ['comment', 'review', 'feedback', 'annotate', 'capture'],
    whatItDoes: [
      'Freeze a page with its styles inlined so it cannot drift',
      'Drop comments anywhere on it and drag them to reposition',
      'Download the page with the comments baked into the HTML',
    ],
  },
  {
    id: 'map-element',
    label: 'Map Element',
    path: '/web-search/map-element',
    icon: Map,
    section: 'Web Search',
    description: 'Build an embeddable map snippet for any address.',
    keywords: ['embed', 'iframe', 'map'],
    whatItDoes: [
      'Generate an embeddable map for any address',
      'Tune size, zoom and style before copying',
      'Copy ready-to-paste embed code',
    ],
  },
  {
    id: 'schema-generator',
    label: 'Schema Generator',
    path: '/web-search/schema-generator',
    icon: FileJson,
    section: 'Web Search',
    description: 'Autofill LocalBusiness, Article and FAQ JSON-LD from a URL.',
    keywords: ['json-ld', 'structured data', 'markup'],
    whatItDoes: [
      'Read a page and autofill JSON-LD from what it finds',
      'Cover LocalBusiness, Article and FAQ types',
      'Output validated markup ready to paste',
    ],
  },
  {
    id: 'technical-audit',
    label: 'Technical Audit',
    path: '/web-search/technical-audit',
    icon: ShieldAlert,
    section: 'Web Search',
    description: 'Crawl a site and report response, redirect and metadata problems.',
    keywords: ['audit', 'issues', 'technical', 'broken', 'redirect'],
    whatItDoes: [
      'Find pages from the sitemap, or by crawling when there is none',
      'Flag error responses, redirect chains and slow pages',
      'Report missing or duplicate titles and meta descriptions',
    ],
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
    whatItDoes: [
      'Check many URLs for index status at once',
      'Query Google and Bing together',
      'Highlight pages missing from the index',
    ],
  },
  {
    id: 'bulk-http',
    label: 'Bulk HTTP Checker',
    path: '/web-search/bulk-http-checker',
    icon: Link2,
    section: 'Web Search',
    description: 'Resolve status codes and redirect chains in bulk.',
    keywords: ['redirect', 'status', '301', 'http'],
    whatItDoes: [
      'Resolve status codes for a list of URLs',
      'Follow and display the full redirect chain',
      'Flag broken links and redirect loops',
    ],
  },
  {
    id: 'site-tree',
    label: 'Site Tree Generator',
    path: '/web-search/site-tree',
    icon: GitBranch,
    section: 'Web Search',
    description: 'Build a full URL tree from a sitemap or crawl.',
    keywords: ['sitemap', 'crawl', 'structure', 'tree'],
    whatItDoes: [
      'Read a sitemap or crawl a domain',
      'Build a navigable tree of every URL found',
      'Pull titles and meta for the discovered pages',
    ],
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
    whatItDoes: [
      'Fetch keyword metrics oriented to AI answer surfaces',
      'Compare traditional and AI-era search demand',
      'Export the dataset',
    ],
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
    whatItDoes: [
      'Scrape how LLM-backed SERPs answer a query',
      'Show which sources those answers cite',
      'Reveal where you are missing from the answer',
    ],
  },
  {
    id: 'crawler-access',
    label: 'Crawler Access Checker',
    path: '/ai-seo/crawler-access-checker',
    icon: Shield,
    section: 'AI SEO',
    description: 'Evaluate robots.txt against 27 AI and search crawlers.',
    keywords: ['robots', 'crawler', 'bot', 'access'],
    whatItDoes: [
      'Fetch and parse the robots.txt of a site',
      'Evaluate it against 27 AI and search crawlers',
      'Show exactly which bots are blocked and by which rule',
    ],
  },
  {
    id: 'llms-validator',
    label: 'LLMS.txt Validator',
    path: '/ai-seo/llms-validator',
    icon: Bot,
    section: 'AI SEO',
    description: 'Validate an existing llms.txt, or generate one from a sitemap.',
    keywords: ['llms.txt', 'validate', 'generate'],
    whatItDoes: [
      'Validate an existing llms.txt against the spec',
      'Generate a fresh one from your sitemap',
      'Report what is missing or malformed',
    ],
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
    whatItDoes: [
      'Collect People-Also-Ask questions for a topic',
      'Match them against your existing content',
      'List the questions you do not yet answer',
    ],
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
    whatItDoes: [
      'Expand one keyword into adjacent intent angles',
      'Suggest content directions past the obvious query',
      'Draft outlines for the strongest angles',
    ],
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
    whatItDoes: [
      'Turn a brief into a structured press release',
      'Follow standard PR formatting conventions',
      'Edit and save drafts to your history',
    ],
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
    whatItDoes: [
      'Generate long-form posts from a brief',
      'Produce headings, intro and body in one pass',
      'Keep every draft in your history',
    ],
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
  accent: Accent;
};

export const TOOL_SECTIONS: ToolSection[] = [
  {
    id: 'local-business',
    label: 'Local Business',
    path: '/local-business',
    icon: MapPin,
    blurb: 'Map presence, local keywords and citation hygiene.',
    accent: 'mint',
  },
  {
    id: 'web-search',
    label: 'Web Search',
    path: '/web-search',
    icon: Globe,
    blurb: 'Technical health, schema coverage and indexability.',
    accent: 'sky',
  },
  {
    id: 'ai-seo',
    label: 'AI SEO',
    path: '/ai-seo',
    icon: Sparkles,
    blurb: 'How language models reach, read and cite your content.',
    accent: 'lavender',
  },
  {
    id: 'content',
    label: 'Content',
    path: '/content',
    icon: FileText,
    blurb: 'Briefs to publish-ready drafts.',
    accent: 'butter',
  },
];

/** Tools belonging to a section, in declaration order. */
export function toolsForSection(sectionLabel: string): ToolEntry[] {
  return ALL_TOOLS.filter((t) => t.section === sectionLabel);
}

/** The section a tool belongs to — used for its colour and hub link. */
export function sectionForTool(tool: ToolEntry): ToolSection | undefined {
  return TOOL_SECTIONS.find((s) => s.label === tool.section);
}

/** Colour key for any route, so a page can tint itself to its section. */
export function accentForPath(pathname: string): Accent {
  const tool = ALL_TOOLS.find((t) => t.path === pathname);
  if (tool) return sectionForTool(tool)?.accent ?? 'sky';
  return TOOL_SECTIONS.find((s) => pathname.startsWith(s.path))?.accent ?? 'sky';
}

export function toolForPath(pathname: string): ToolEntry | undefined {
  return ALL_TOOLS.find((t) => t.path === pathname);
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
