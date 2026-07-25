import { motion } from 'motion/react';
import { FileJson } from 'lucide-react';
import { Tilt3D } from '../effects/Tilt3D';

export function SchemaJsonMockup() {
  const lines = [
    { i: 0, k: '{', v: '' },
    { i: 1, k: '"@context"', v: '"https://schema.org"' },
    { i: 1, k: '"@type"', v: '"Article"' },
    { i: 1, k: '"headline"', v: '"How to rank in local 3-pack"' },
    { i: 1, k: '"author"', v: '{ "@type": "Person", "name": "..." }' },
    { i: 1, k: '"datePublished"', v: '"2026-05-27"' },
    { i: 1, k: '"image"', v: '"https://acme.co/cover.jpg"' },
    { i: 0, k: '}', v: '' },
  ];

  return (
    <Tilt3D max={8} className="w-full max-w-[460px]">
      <div
        className="relative rounded-2xl border border-border bg-surface shadow-elevation-lg overflow-hidden"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          aria-hidden
          className="absolute inset-x-6 -bottom-3 h-6 rounded-full bg-foreground/15 blur-xl -z-10"
          style={{ transform: 'translateZ(-40px)' }}
        />
        <div
          className="flex items-center gap-2 border-b border-border bg-surface-muted/60 px-4 py-2.5"
          style={{ transform: 'translateZ(20px)' }}
        >
          <FileJson className="size-3.5 text-accent" />
          <span className="text-xs font-mono text-foreground-muted">
            Article.schema.json
          </span>
          <span className="ml-auto rounded-full bg-mint px-2 py-0.5 text-[10px] font-medium text-mint-ink">
            Valid
          </span>
        </div>
        <div
          className="p-5 font-mono text-[12px] leading-relaxed"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {lines.map((l, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="whitespace-pre"
              // Inner JSON keys pop forward subtly — gives the code block
              // a sense of layered depth without breaking readability
              style={{ transform: `translateZ(${l.i * 8}px)` }}
            >
              <span style={{ paddingLeft: `${l.i * 14}px` }}>
                <span className="text-accent-pressed">{l.k}</span>
                {l.v && (
                  <>
                    <span className="text-foreground-subtle">: </span>
                    <span className="text-mint-ink">{l.v}</span>
                  </>
                )}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </Tilt3D>
  );
}
