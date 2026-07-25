import { motion } from 'motion/react';
import { Tilt3D } from '../effects/Tilt3D';

/** 7×7 heatmap grid with continuously-shifting tone cycle. Wrapped in
 *  Tilt3D so the card responds to cursor with a soft 3D rotation. */
export function HeatmapMockup() {
  const cells = Array.from({ length: 49 });
  const cycle = ['bg-mint', 'bg-mint/80', 'bg-butter', 'bg-rose/70', 'bg-mint'];
  return (
    <Tilt3D max={8} className="w-full max-w-[440px]">
      <div className="relative rounded-2xl border border-border bg-surface p-6 shadow-elevation-lg">
        {/* Bottom shadow that pops when the card tilts forward */}
        <div
          aria-hidden
          className="absolute inset-x-6 -bottom-3 h-6 rounded-full bg-foreground/15 blur-xl -z-10"
          style={{ transform: 'translateZ(-40px)' }}
        />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-foreground-subtle">
              Local heatmap
            </p>
            <h4 className="text-sm font-semibold mt-0.5">Austin · "best tacos"</h4>
          </div>
          <span
            className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-medium text-mint-ink"
            style={{ transform: 'translateZ(30px)' }}
          >
            Rank #3.8
          </span>
        </div>
        <div
          className="grid grid-cols-7 gap-1.5 aspect-square"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {cells.map((_, i) => (
            <motion.div
              key={i}
              className={`rounded-md ${cycle[(i * 3) % cycle.length]}`}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{
                duration: 3.6,
                repeat: Infinity,
                delay: (i % 7) * 0.2 + Math.floor(i / 7) * 0.15,
                ease: 'easeInOut',
              }}
              style={{ transform: `translateZ(${((i * 7) % 5) * 4}px)` }}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-foreground-muted">
          <span>49 grid pings · 0.8mi radius</span>
          <span className="text-mint-ink">+12 spots MoM</span>
        </div>
      </div>
    </Tilt3D>
  );
}
