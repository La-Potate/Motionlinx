import {
  MapPin,
  Map,
  FileJson,
  ShieldAlert,
  ListChecks,
  Link2,
  GitBranch,
} from 'lucide-react';
import { HubLanding } from '@/shared/components/HubLanding';

export default function WebSearchLandingPage() {
  return (
    <HubLanding
      eyebrow="Web Search"
      title="SERP intelligence toolkit"
      description="Inspect the technical health, schema coverage, and indexability of any site at scale."
      tools={[
        {
          title: 'Site Marker',
          description: 'Annotate any URL with structured comments shared by token.',
          icon: MapPin,
          route: '/web-search/site-marker',
          badge: 'New',
          badgeTone: 'accent',
        },
        {
          title: 'Map Element',
          description: 'Render and inspect map blocks present in SERP and on-site.',
          icon: Map,
          route: '/web-search/map-element',
          badge: 'New',
          badgeTone: 'accent',
        },
        {
          title: 'Schema Generator',
          description: 'Auto-fill and emit JSON-LD across 20+ schema types.',
          icon: FileJson,
          route: '/web-search/schema-generator',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'Technical Audit',
          description: 'Deep technical audit covering crawl, render, meta, and Core Web Vitals.',
          icon: ShieldAlert,
          route: '/web-search/technical-audit',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Bulk Index Checker',
          description: 'Verify Google index coverage for thousands of URLs in one pass.',
          icon: ListChecks,
          route: '/web-search/bulk-index-checker',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'Bulk HTTP Checker',
          description: 'Status codes, redirects, and reachability at scale.',
          icon: Link2,
          route: '/web-search/bulk-http-checker',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Site Tree Generator',
          description: 'Crawl a domain and produce a structured site tree.',
          icon: GitBranch,
          route: '/web-search/site-tree',
          badge: 'Beta',
          badgeTone: 'sky',
        },
      ]}
    />
  );
}
