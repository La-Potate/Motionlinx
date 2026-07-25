import { Search, Sparkles, Shield, Bot, HelpCircle } from 'lucide-react';
import { HubLanding } from '@/shared/components/HubLanding';

export default function AiSeoLandingPage() {
  return (
    <HubLanding
      eyebrow="AI SEO"
      title="AI surface intelligence"
      description="Understand how language models reach, read, and represent your content."
      tools={[
        {
          title: 'AI Keyword Data',
          description: 'Pull live keyword volumes and intent classification.',
          icon: Search,
          route: '/ai-seo/keyword-data',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'AI Optimization',
          description: 'Rewrite and structure content for higher AI surface coverage.',
          icon: Sparkles,
          route: '/ai-seo/ai-optimization',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Crawler Access Checker',
          description: 'Confirm whether crawlers (Google, GPT, Claude, Perplexity) can reach you.',
          icon: Shield,
          route: '/ai-seo/crawler-access-checker',
          badge: 'Stable',
          badgeTone: 'mint',
        },
        {
          title: 'LLMS Validator',
          description: 'Validate your llms.txt against the latest spec.',
          icon: Bot,
          route: '/ai-seo/llms-validator',
          badge: 'Beta',
          badgeTone: 'sky',
        },
        {
          title: 'Answer the AI',
          description: 'See how leading assistants answer prompts about your brand.',
          icon: HelpCircle,
          route: '/ai-seo/answer-ai',
          badge: 'Beta',
          badgeTone: 'sky',
        },
      ]}
    />
  );
}
