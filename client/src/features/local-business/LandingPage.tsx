import { Search, Sparkles, MapPin, FileText } from 'lucide-react';
import { HubLanding } from '@/shared/components/HubLanding';

export default function LocalBusinessLandingPage() {
  return (
    <HubLanding
      eyebrow="Local Business"
      title="Local presence toolkit"
      description="Map intelligence, keyword discovery, and citation hygiene for businesses with a physical service footprint."
      tools={[
        {
          title: 'Keyword Research',
          description: 'Discover local search demand grouped by intent and difficulty.',
          icon: Search,
          route: '/local-business/keyword',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'Google Business Audit',
          description: 'Inspect a Google Business profile for completeness, accuracy, and risk.',
          icon: Sparkles,
          route: '/local-business/google-business-audit',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Compare Google Business',
          description: 'Side-by-side comparison of competing profiles in a single shared market.',
          icon: Sparkles,
          route: '/local-business/google-business-compare',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Google Business Heatmap',
          description: 'Visualise ranking density across a service area on a real map.',
          icon: MapPin,
          route: '/local-business/heatmap',
          badge: 'WIP',
          badgeTone: 'butter',
        },
        {
          title: 'Business Citations',
          description: 'Track presence across the 70+ citation publishers that influence local rank.',
          icon: FileText,
          route: '/local-business/citations',
          badge: 'WIP',
          badgeTone: 'butter',
        },
      ]}
    />
  );
}
