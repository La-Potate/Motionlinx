import { motion } from 'motion/react';
import { Search, Brain, Target, FileText, Layout, Key, PenTool, Share2, Package } from 'lucide-react';
import { Tilt3D } from '../effects/Tilt3D';

const STEPS = [
  { label: 'Queries', icon: Search },
  { label: 'Intent', icon: Brain },
  { label: 'Drivers', icon: Target },
  { label: 'Pillars', icon: FileText },
  { label: 'Outline', icon: Layout },
  { label: 'Keywords', icon: Key },
  { label: 'Article', icon: PenTool },
  { label: 'Social', icon: Share2 },
  { label: 'Export', icon: Package },
];

export function PipelineMockup() {
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
          className="mb-5 flex items-center justify-between"
          style={{ transform: 'translateZ(30px)' }}
        >
          <div>
            <p className="text-[11px] uppercase tracking-wider text-foreground-subtle">
              Beyond-intent pipeline
            </p>
            <h4 className="text-sm font-semibold mt-0.5">Seed: "local seo audit"</h4>
          </div>
          <span className="rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-medium text-butter-ink">
            Step 6 / 9
          </span>
        </div>

        <div
          className="flex flex-col gap-2"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {STEPS.map((s, i) => {
            const done = i < 6;
            const active = i === 6;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.28 }}
                className="flex items-center gap-3"
                style={{
                  transform: `translateZ(${active ? 24 : done ? 4 : -4}px)`,
                }}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-md shrink-0 ${
                    done
                      ? 'bg-mint text-mint-ink'
                      : active
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-surface-muted text-foreground-subtle'
                  }`}
                >
                  <s.icon className="size-3.5" strokeWidth={2} />
                </span>
                <span
                  className={`text-sm flex-1 ${
                    done
                      ? 'text-foreground line-through decoration-foreground-subtle'
                      : active
                        ? 'text-foreground font-medium'
                        : 'text-foreground-subtle'
                  }`}
                >
                  {s.label}
                </span>
                {active && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] uppercase tracking-wider text-accent font-semibold"
                  >
                    Running
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-5 h-1.5 rounded-full bg-surface-inset overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '66%' }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-full bg-accent"
          />
        </div>
      </div>
    </Tilt3D>
  );
}
