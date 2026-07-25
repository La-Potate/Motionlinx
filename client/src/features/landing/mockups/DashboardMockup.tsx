import { motion } from 'motion/react';
import {
  Sparkles,
  MapPin,
  TrendingUp,
  CheckCircle2,
  FileJson,
} from 'lucide-react';
import { Tilt3D } from '../effects/Tilt3D';

/**
 * Hero-side dashboard mockup. Three layered glass cards each sit at a
 * different translateZ depth — when the cursor tilts the composition,
 * the front card parallaxes more than the back, producing a real
 * stereoscopic feel. Pure SVG + CSS, no WebGL.
 */
export function DashboardMockup() {
  return (
    <Tilt3D max={9} perspective={1400} className="w-full max-w-[560px] aspect-[5/6]">
      <div className="relative size-full">
        {/* Soft orange accent ring behind the stack — flat, no gradient */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{ transform: 'translateZ(-120px)' }}
        >
          <div className="absolute left-1/2 top-1/2 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft/70" />
          <div className="absolute left-1/2 top-1/2 size-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft" />
        </div>

        {/* Back card — heatmap grid (sits deepest in Z) */}
        <motion.div
          initial={{ opacity: 0, y: 30, rotate: -3 }}
          animate={{ opacity: 1, y: 0, rotate: -3.5, z: -40 }}
          transition={{ delay: 0.75, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'bottom left', transformStyle: 'preserve-3d' }}
          className="absolute left-0 top-0 w-[80%] rounded-2xl border border-border bg-surface p-5 shadow-elevation-lg"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-mint text-mint-ink">
              <MapPin className="size-3.5" />
            </span>
            <span className="text-xs font-semibold">Heatmap · Austin TX</span>
            <span className="ml-auto text-[10px] text-foreground-subtle uppercase tracking-wider">
              5×5 grid
            </span>
          </div>
          <HeatmapGrid />
          <div className="mt-3 flex items-center justify-between text-[11px] text-foreground-muted">
            <span>Avg rank #4.2</span>
            <span className="text-mint-ink font-semibold">+12% MoM</span>
          </div>
        </motion.div>

        {/* Middle card — KPI tile (z 0, neutral plane) */}
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: 1, z: 30 }}
          transition={{ delay: 0.85, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
          className="absolute right-0 top-[28%] w-[55%] rounded-2xl border border-border bg-surface p-5 shadow-elevation-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-foreground-subtle">
              Schema coverage
            </span>
            <Sparkles className="size-3.5 text-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.4 }}
              className="text-3xl font-semibold tracking-tight tabular-nums"
            >
              12
            </motion.span>
            <span className="text-xs text-foreground-muted">/ 12 types</span>
          </div>
          <SchemaProgress />
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-mint-ink">
            <CheckCircle2 className="size-3" />
            <span>All schemas valid</span>
          </div>
        </motion.div>

        {/* Front card — schema JSON (closest to viewer) */}
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: -1 }}
          animate={{ opacity: 1, y: 0, rotate: 2.5, z: 70 }}
          transition={{ delay: 0.95, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
          className="absolute left-[10%] bottom-0 w-[78%] rounded-2xl border border-border bg-surface shadow-elevation-lg overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <FileJson className="size-3.5 text-accent" />
            <span className="text-xs font-mono text-foreground-muted">
              schema.org/LocalBusiness
            </span>
            <span className="ml-auto inline-flex gap-1">
              <span className="size-1.5 rounded-full bg-rose-ink/40" />
              <span className="size-1.5 rounded-full bg-butter-ink/40" />
              <span className="size-1.5 rounded-full bg-mint-ink/50" />
            </span>
          </div>
          <JsonBlock />
        </motion.div>

        {/* Floating metric pill — pops forward the most */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, z: 110 }}
          transition={{ delay: 1.15, type: 'spring', stiffness: 280, damping: 24 }}
          style={{ transformStyle: 'preserve-3d' }}
          className="absolute right-[-5%] top-[8%] z-10 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 shadow-elevation-md"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <TrendingUp className="size-3" strokeWidth={2.5} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-foreground-subtle">
              7-day rank
            </span>
            <span className="text-xs font-semibold tabular-nums">+38 spots</span>
          </div>
        </motion.div>
      </div>
    </Tilt3D>
  );
}

function HeatmapGrid() {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const tones = [
    'bg-mint', 'bg-mint/70', 'bg-butter', 'bg-rose/60', 'bg-sky',
    'bg-accent-soft', 'bg-mint', 'bg-mint', 'bg-butter', 'bg-rose',
    'bg-mint', 'bg-mint/80', 'bg-mint', 'bg-butter', 'bg-mint',
    'bg-sky/70', 'bg-mint', 'bg-mint', 'bg-butter', 'bg-mint/70',
    'bg-mint', 'bg-sky/60', 'bg-mint', 'bg-mint', 'bg-mint',
  ];
  const pulseAt = new Set([6, 12, 18]);

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cells.map((i) => (
        <motion.div
          key={i}
          className={`aspect-square rounded-md ${tones[i] ?? 'bg-surface-muted'}`}
          animate={pulseAt.has(i) ? { opacity: [0.6, 1, 0.6] } : undefined}
          transition={{
            duration: 2.2,
            repeat: pulseAt.has(i) ? Infinity : 0,
            delay: (i % 3) * 0.4,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function SchemaProgress() {
  return (
    <div className="mt-3 flex h-2 gap-0.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 1.2 + i * 0.04, duration: 0.32 }}
          style={{ transformOrigin: 'bottom' }}
          className="flex-1 rounded-sm bg-accent"
        />
      ))}
    </div>
  );
}

function JsonBlock() {
  const lines = [
    { indent: 0, k: '{', v: '' },
    { indent: 1, k: '"@context"', v: '"https://schema.org"' },
    { indent: 1, k: '"@type"', v: '"LocalBusiness"' },
    { indent: 1, k: '"name"', v: '"Acme Coffee"' },
    { indent: 1, k: '"telephone"', v: '"+1-512-555-0100"' },
    { indent: 1, k: '"priceRange"', v: '"$$"' },
    { indent: 1, k: '"aggregateRating"', v: '{ ... }' },
    { indent: 0, k: '}', v: '' },
  ];
  return (
    <div className="bg-surface-muted/60 p-4 font-mono text-[11px] leading-relaxed">
      {lines.map((l, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.05 + i * 0.05, duration: 0.25 }}
          className="whitespace-pre"
        >
          <span style={{ paddingLeft: `${l.indent * 14}px` }}>
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
  );
}
