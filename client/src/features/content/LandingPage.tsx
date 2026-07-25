import { Lightbulb, Newspaper, PenSquare } from 'lucide-react';
import { HubLanding } from '@/shared/components/HubLanding';

export default function ContentLandingPage() {
  return (
    <HubLanding
      eyebrow="Content"
      title="Content production"
      description="Generate, edit, and route long-form content from brief to publish-ready."
      tools={[
        {
          title: 'Generate Beyond Intent',
          description: 'Plan content that targets intent beyond the literal query.',
          icon: Lightbulb,
          route: '/content/beyond-intent',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Press Release',
          description: 'Draft and route press releases with structured metadata.',
          icon: Newspaper,
          route: '/content/press-release',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'Blog Post',
          description: 'Long-form blog drafting with style and tone controls.',
          icon: PenSquare,
          route: '/content/blog-post',
          badge: 'Stable',
          badgeTone: 'mint',
        },
      ]}
    />
  );
}
