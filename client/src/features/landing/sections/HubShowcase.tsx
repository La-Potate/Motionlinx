import { ArrowRight, Check } from 'lucide-react';
import { Reveal } from '../shared/Reveal';
import { SectionEyebrow } from '../shared/SectionEyebrow';
import { Button } from '@/shared/ui/button';
import { HeatmapMockup } from '../mockups/HeatmapMockup';
import { SchemaJsonMockup } from '../mockups/SchemaJsonMockup';
import { LlmMatrixMockup } from '../mockups/LlmMatrixMockup';
import { PipelineMockup } from '../mockups/PipelineMockup';
import { cn } from '@/shared/lib/cn';

type Hub = 'local' | 'web' | 'ai' | 'content';

type Props = {
  id: string;
  hub: Hub;
  eyebrow: string;
  title: string;
  description: string;
  tools: string[];
  /** Position the mockup on the left (right-aligned) instead of the right. */
  flip?: boolean;
};

const MOCKUPS: Record<Hub, () => React.ReactElement> = {
  local: HeatmapMockup,
  web: SchemaJsonMockup,
  ai: LlmMatrixMockup,
  content: PipelineMockup,
};

export function HubShowcase({
  id,
  hub,
  eyebrow,
  title,
  description,
  tools,
  flip = false,
}: Props) {
  const Mockup = MOCKUPS[hub];

  return (
    <section id={id} className="relative py-24 sm:py-32 scroll-mt-24 overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div
          className={cn(
            'grid grid-cols-1 items-center gap-10 lg:gap-16',
            flip
              ? 'lg:grid-cols-[1fr_1.05fr]'
              : 'lg:grid-cols-[1.05fr_1fr]'
          )}
        >
          {/* Copy */}
          <Reveal className={cn('flex flex-col gap-6', flip && 'lg:order-2')}>
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
            <h3 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-[1.1]">
              {title}
            </h3>
            <p className="text-base text-foreground-muted leading-relaxed max-w-lg">
              {description}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
              {tools.map((tool, i) => (
                <Reveal
                  key={tool}
                  delay={0.05 + i * 0.04}
                  y={8}
                  className="flex items-start gap-2"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent-pressed shrink-0 mt-0.5">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-foreground">{tool}</span>
                </Reveal>
              ))}
            </ul>
            <div className="pt-2">
              <Button variant="outline" className="gap-1.5">
                Explore in console
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </Reveal>

          {/* Mockup — the SVG card carries the visual weight; depth comes
              from Tilt3D's perspective + cursor-driven rotation inside. */}
          <Reveal
            delay={0.1}
            className={cn(
              'relative w-full flex justify-center lg:justify-end',
              flip && 'lg:order-1 lg:justify-start'
            )}
          >
            <div className="relative">
              <Mockup />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
