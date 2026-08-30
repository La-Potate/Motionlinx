import { useEffect } from 'react';
import { LandingSmoothScroll } from './LandingProviders';
import { LandingNav } from './nav/LandingNav';
import { ScrollProgressBar } from './effects/ScrollProgressBar';
import { CursorSpotlight } from './effects/CursorSpotlight';
import { Hero } from './sections/Hero';
import { LogoMarquee } from './sections/LogoMarquee';
import { FeatureGrid } from './sections/FeatureGrid';
import { HubShowcase } from './sections/HubShowcase';
import { TechStack } from './sections/TechStack';
import { SecurityBand } from './sections/SecurityBand';
import { HowItWorks } from './sections/HowItWorks';
import { StatsBand } from './sections/StatsBand';
import { PricingTeaser } from './sections/PricingTeaser';
import { FaqAccordion } from './sections/FaqAccordion';
import { CtaBand } from './sections/CtaBand';
import { LandingFooter } from './sections/LandingFooter';

export default function LandingPage() {
  useEffect(() => {
    const prev = document.title;
    document.title =
      'Motionlinx — One workspace for every growth toolkit';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <LandingSmoothScroll>
      <div className="relative bg-background text-foreground overflow-x-clip">
        <ScrollProgressBar />
        <CursorSpotlight />

        <LandingNav />
        <main>
          <Hero />
          <LogoMarquee />
          <FeatureGrid />

          <HubShowcase
            id="hub-local"
            hub="local"
            eyebrow="Local Business"
            title="Map intelligence that ships, not just slides."
            description="Discover local demand, audit Google Business profiles, fix citation gaps and visualise ranking density across a service area."
            tools={[
              'Keyword Research',
              'Google Business Audit',
              'Compare Profiles',
              'Heatmap (5×5 to 21×21)',
              '70+ citation publishers',
              'Per-publisher status',
            ]}
          />
          <HubShowcase
            id="hub-web"
            hub="web"
            eyebrow="Web Search"
            title="SERP intelligence at the speed of paste."
            description="Inspect technical health, generate schema, fan out bulk checks, and turn a sitemap into a navigable tree without leaving the dashboard."
            tools={[
              'Schema Generator (12+ types)',
              'Technical Audit',
              'Site Marker + share links',
              'Bulk Index Checker',
              'Bulk HTTP Checker',
              'Site Tree Generator',
            ]}
            flip
          />
          <HubShowcase
            id="hub-ai"
            hub="ai"
            eyebrow="AI SEO"
            title="See how language models read you."
            description="Confirm crawler access, validate llms.txt, and surface intent gaps with optimisation suggestions you can ship the same hour."
            tools={[
              'AI Keyword Data',
              'AI Optimization',
              'Crawler Access Checker',
              'LLMS Validator + generator',
              'Answer the AI audit',
              '5 LLM crawlers tracked',
            ]}
          />
          <HubShowcase
            id="hub-content"
            hub="content"
            eyebrow="Content"
            title="From seed keyword to publish-ready in nine steps."
            description="The Beyond Intent pipeline runs queries through intent grouping, driver mapping, outlining, semantic keywords, and a draft you can edit inline."
            tools={[
              'Press Release generator',
              'Long-form Blog Post',
              'Nine-step pipeline',
              'Shared system prompt',
              'Inline edit + save',
              'Mark-as-done routing',
            ]}
            flip
          />

          <TechStack />
          <SecurityBand />
          <HowItWorks />
          <StatsBand />
          <PricingTeaser />
          <FaqAccordion />
          <CtaBand />
        </main>
        <LandingFooter />
      </div>
    </LandingSmoothScroll>
  );
}
