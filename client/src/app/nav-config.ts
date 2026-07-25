import {
  Home,
  Layout,
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
  { id: 'home', label: 'Home', path: '/seo-toolkit', icon: Home },
  { id: 'whiteboard', label: 'Whiteboard', path: '/whiteboard', icon: Layout },
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

export type ToolEntry = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  section: string;
  description?: string;
  keywords?: string[];
};

export const ALL_TOOLS: ToolEntry[] = [
  // Local Business
  {
    id: 'keyword-research',
    label: 'Keyword Research',
    path: '/local-business/keyword',
    icon: Search,
    section: 'Local Business',
    description: 'Discover local keyword opportunities',
    keywords: ['keywords', 'local', 'research'],
  },
  {
    id: 'gba',
    label: 'Google Business Audit',
    path: '/local-business/google-business-audit',
    icon: Sparkles,
    section: 'Local Business',
    description: 'Audit a Google Business profile',
  },
  {
    id: 'gba-compare',
    label: 'Compare Google Business',
    path: '/local-business/google-business-compare',
    icon: Sparkles,
    section: 'Local Business',
  },
  {
    id: 'heatmap',
    label: 'Heatmap',
    path: '/local-business/heatmap',
    icon: MapPin,
    section: 'Local Business',
  },
  {
    id: 'citations',
    label: 'Business Citations',
    path: '/local-business/citations',
    icon: FileText,
    section: 'Local Business',
  },
  // Web Search
  {
    id: 'site-marker',
    label: 'Site Marker',
    path: '/web-search/site-marker',
    icon: MapPin,
    section: 'Web Search',
  },
  {
    id: 'map-element',
    label: 'Map Element',
    path: '/web-search/map-element',
    icon: Map,
    section: 'Web Search',
  },
  {
    id: 'schema-generator',
    label: 'Schema Generator',
    path: '/web-search/schema-generator',
    icon: FileJson,
    section: 'Web Search',
  },
  {
    id: 'technical-audit',
    label: 'Technical Audit',
    path: '/web-search/technical-audit',
    icon: ShieldAlert,
    section: 'Web Search',
  },
  {
    id: 'bulk-index',
    label: 'Bulk Index Checker',
    path: '/web-search/bulk-index-checker',
    icon: ListChecks,
    section: 'Web Search',
  },
  {
    id: 'bulk-http',
    label: 'Bulk HTTP Checker',
    path: '/web-search/bulk-http-checker',
    icon: Link2,
    section: 'Web Search',
  },
  {
    id: 'site-tree',
    label: 'Site Tree Generator',
    path: '/web-search/site-tree',
    icon: GitBranch,
    section: 'Web Search',
  },
  // AI SEO
  {
    id: 'ai-keyword-data',
    label: 'AI Keyword Data',
    path: '/ai-seo/keyword-data',
    icon: Search,
    section: 'AI SEO',
  },
  {
    id: 'ai-optimization',
    label: 'AI Optimization',
    path: '/ai-seo/ai-optimization',
    icon: Sparkles,
    section: 'AI SEO',
  },
  {
    id: 'crawler-access',
    label: 'Crawler Access Checker',
    path: '/ai-seo/crawler-access-checker',
    icon: Shield,
    section: 'AI SEO',
  },
  {
    id: 'llms-validator',
    label: 'LLMS Validator',
    path: '/ai-seo/llms-validator',
    icon: Bot,
    section: 'AI SEO',
  },
  {
    id: 'answer-ai',
    label: 'Answer the AI',
    path: '/ai-seo/answer-ai',
    icon: HelpCircle,
    section: 'AI SEO',
  },
  // Content
  {
    id: 'beyond-intent',
    label: 'Generate Beyond Intent',
    path: '/content/beyond-intent',
    icon: Lightbulb,
    section: 'Content',
  },
  {
    id: 'press-release',
    label: 'Press Release',
    path: '/content/press-release',
    icon: Newspaper,
    section: 'Content',
  },
  {
    id: 'blog-post',
    label: 'Blog Post',
    path: '/content/blog-post',
    icon: PenSquare,
    section: 'Content',
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
