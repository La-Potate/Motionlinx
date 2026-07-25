import { Reveal } from '../shared/Reveal';

const ROW_A = [
  'DataForSEO',
  'Stripe',
  'Anthropic',
  'Google Maps',
  'Playwright',
  'Serper',
  'OpenStreetMap',
  'JWT',
];
const ROW_B = [
  'GPTBot',
  'ClaudeBot',
  'Perplexity',
  'Google-Extended',
  'MetaAI',
  'BingBot',
  'YandexBot',
  'CCBot',
];

/**
 * Two opposite-direction logo marquees. Pure CSS animation, no JS,
 * pauses on hover.
 */
export function LogoMarquee() {
  return (
    <section className="border-y border-border bg-surface-muted/40 py-10">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <Reveal>
          <p className="text-center text-[11px] uppercase tracking-[0.22em] text-foreground-subtle mb-6">
            Integrates with the stack you already trust
          </p>
        </Reveal>
        <div className="flex flex-col gap-4">
          <MarqueeRow items={ROW_A} direction="ltr" />
          <MarqueeRow items={ROW_B} direction="rtl" />
        </div>
      </div>

      <style>{`
        @keyframes marquee-ltr {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes marquee-rtl {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
        .marquee-track { animation-timing-function: linear; animation-iteration-count: infinite; }
        .marquee-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

function MarqueeRow({
  items,
  direction,
}: {
  items: string[];
  direction: 'ltr' | 'rtl';
}) {
  // Duplicate the list so the loop is seamless.
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div
        className="marquee-track flex gap-10 w-max"
        style={{
          animationName: direction === 'ltr' ? 'marquee-ltr' : 'marquee-rtl',
          animationDuration: '36s',
        }}
      >
        {doubled.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="text-xl font-semibold tracking-tight text-foreground-subtle hover:text-foreground transition-colors whitespace-nowrap"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
