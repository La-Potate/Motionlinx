import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/cn';

export type Marker = {
  id: string;
  text: string;
  /** Fractions of the captured page, 0–1. Matches the server contract. */
  x: number;
  y: number;
};

type Props = {
  html: string;
  markers: Marker[];
  saving?: boolean;
  onSave: (markers: Marker[]) => void;
  /** Read-only mode for the public share view. */
  readOnly?: boolean;
};

const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Annotate a captured page.
 *
 * The capture is rendered from stored HTML rather than by framing the live
 * URL. That matters for three reasons: the whole point of capturing is that
 * the page is frozen, most sites refuse to be framed at all
 * (X-Frame-Options), and a cross-origin frame cannot be measured, so pins
 * could never line up with it.
 *
 * Positions are stored as fractions of the rendered page, so a pin stays on
 * the same element whatever width the viewer's screen is.
 *
 * The frame is sandboxed WITHOUT allow-scripts: captured pages are
 * third-party HTML, and their scripts must never run here. `allow-same-origin`
 * is granted only so the content height can be measured — with scripts
 * disabled it grants no meaningful capability to the captured page.
 */
export function SiteMarkerAnnotator({ html, markers, saving, onSave, readOnly }: Props) {
  const [local, setLocal] = useState<Marker[]>(markers);
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [frameHeight, setFrameHeight] = useState(900);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);

  useEffect(() => {
    setLocal(markers);
    setDirty(false);
  }, [markers]);

  // Grow the frame to its full content height so the OUTER container scrolls.
  // If the frame scrolled internally the overlay would drift out of alignment
  // with the page beneath it.
  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(
      doc.body.scrollHeight,
      doc.documentElement?.scrollHeight ?? 0,
      600
    );
    setFrameHeight(h);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(measure, 250);
    return () => window.clearTimeout(t);
  }, [html, measure]);

  const toFraction = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1),
    };
  };

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (!adding || readOnly) return;
    const pos = toFraction(e.clientX, e.clientY);
    if (!pos) return;
    const marker: Marker = { id: newId(), text: '', x: +pos.x.toFixed(4), y: +pos.y.toFixed(4) };
    setLocal((prev) => [...prev, marker]);
    setActive(marker.id);
    setAdding(false);
    setDirty(true);
  };

  // Drag is tracked on the window so the pointer can leave the pin without
  // dropping the gesture.
  useEffect(() => {
    if (readOnly) return;
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const pos = toFraction(e.clientX, e.clientY);
      if (!pos) return;
      setLocal((prev) =>
        prev.map((m) =>
          m.id === dragRef.current!.id
            ? { ...m, x: +pos.x.toFixed(4), y: +pos.y.toFixed(4) }
            : m
        )
      );
      setDirty(true);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [readOnly]);

  const update = (id: string, patch: Partial<Marker>) => {
    setLocal((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setDirty(true);
  };

  const remove = (id: string) => {
    setLocal((prev) => prev.filter((m) => m.id !== id));
    if (active === id) setActive(null);
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={adding ? 'default' : 'outline'}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {adding ? 'Cancel' : 'Add marker'}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(local);
              setDirty(false);
            }}
            disabled={!dirty || saving}
          >
            <Save className="size-3.5" />
            {saving ? 'Saving…' : dirty ? 'Save markers' : 'Saved'}
          </Button>
          <span className="text-xs text-foreground-muted">
            {adding
              ? 'Click anywhere on the page to drop a marker.'
              : `${local.length} marker${local.length === 1 ? '' : 's'} · drag a pin to move it`}
          </span>
        </div>
      )}

      <div className="max-h-[640px] overflow-auto rounded-lg border border-border bg-white">
        <div
          ref={surfaceRef}
          onClick={onSurfaceClick}
          className={cn('relative w-full', adding && 'cursor-crosshair')}
          style={{ height: frameHeight }}
        >
          <iframe
            ref={frameRef}
            title="Captured page"
            srcDoc={html}
            onLoad={measure}
            sandbox="allow-same-origin"
            scrolling="no"
            className="pointer-events-none h-full w-full border-0"
          />

          {local.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onPointerDown={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                dragRef.current = { id: m.id };
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActive(active === m.id ? null : m.id);
              }}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-full',
                'flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold shadow-elevation-md',
                'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                readOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                active === m.id
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-accent bg-surface text-accent'
              )}
              title={m.text || `Marker ${i + 1}`}
            >
              <MapPin className="size-3" />
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Notes list — also the only way to read a marker on a touch device. */}
      <div className="flex flex-col gap-2">
        {local.length === 0 ? (
          <p className="text-xs text-foreground-muted">
            {readOnly
              ? 'No markers on this page.'
              : 'No markers yet. Choose “Add marker”, then click the page.'}
          </p>
        ) : (
          local.map((m, i) => (
            <div
              key={m.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border p-2.5 transition-colors',
                active === m.id ? 'border-accent bg-accent-soft/40' : 'border-border'
              )}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {i + 1}
              </span>
              {readOnly ? (
                <p className="flex-1 text-sm text-foreground">
                  {m.text || <span className="text-foreground-subtle">No note</span>}
                </p>
              ) : (
                <>
                  <Textarea
                    value={m.text}
                    onChange={(e) => update(m.id, { text: e.target.value })}
                    onFocus={() => setActive(m.id)}
                    rows={2}
                    placeholder="What should someone notice here?"
                    className="flex-1 text-sm"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(m.id)}
                    aria-label={`Delete marker ${i + 1}`}
                  >
                    <Trash2 className="size-3.5 text-rose-ink" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
