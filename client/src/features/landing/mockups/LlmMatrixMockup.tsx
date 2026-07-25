import { motion } from 'motion/react';
import { Bot, CheckCircle2, XCircle } from 'lucide-react';
import { Tilt3D } from '../effects/Tilt3D';

const CRAWLERS = [
  { name: 'GPTBot', allowed: true },
  { name: 'ClaudeBot', allowed: true },
  { name: 'Google-Extended', allowed: true },
  { name: 'PerplexityBot', allowed: false },
  { name: 'CCBot', allowed: false },
  { name: 'YandexBot', allowed: true },
];

export function LlmMatrixMockup() {
  return (
    <Tilt3D max={8} className="w-full max-w-[440px]">
      <div
        className="relative rounded-2xl border border-border bg-surface p-6 shadow-elevation-lg"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          aria-hidden
          className="absolute inset-x-6 -bottom-3 h-6 rounded-full bg-foreground/15 blur-xl -z-10"
          style={{ transform: 'translateZ(-40px)' }}
        />
        <div
          className="mb-4 flex items-center gap-2"
          style={{ transform: 'translateZ(30px)' }}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-lavender text-lavender-ink">
            <Bot className="size-4" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-foreground-subtle">
              Crawler access · robots.txt
            </p>
            <h4 className="text-sm font-semibold">acme.co</h4>
          </div>
          <span className="ml-auto rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-foreground-muted">
            HTTP 200
          </span>
        </div>
        <div
          className="flex flex-col gap-2"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {CRAWLERS.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.32 }}
              className="flex items-center justify-between rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm"
              // Stagger Z depth across rows — front rows pop more
              style={{ transform: `translateZ(${(CRAWLERS.length - i) * 4}px)` }}
            >
              <span className="font-medium">{c.name}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  c.allowed
                    ? 'bg-mint text-mint-ink'
                    : 'bg-rose text-rose-ink'
                }`}
              >
                {c.allowed ? (
                  <CheckCircle2 className="size-3" />
                ) : (
                  <XCircle className="size-3" />
                )}
                {c.allowed ? 'Allowed' : 'Blocked'}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-foreground-muted">
          <span>5 LLM crawlers tracked</span>
          <span className="text-mint-ink">4 of 5 allowed</span>
        </div>
      </div>
    </Tilt3D>
  );
}
