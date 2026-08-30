import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import authenticatedFetch from '@/shared/api/httpClient';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/cn';

export type GeoHit = { displayName: string; lat: string; lng: string; type?: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called when a result is picked — address plus resolved coordinates. */
  onPick: (hit: GeoHit) => void;
  placeholder?: string;
  id?: string;
};

/**
 * Address lookup backed by /api/geocode (OpenStreetMap Nominatim).
 *
 * The endpoint needs no API key, which is why this could be added without any
 * new configuration — previously you had to know a location's latitude and
 * longitude before the map tools were usable at all.
 *
 * Search runs on submit rather than on every keystroke: Nominatim's usage
 * policy asks for at most one request per second, and per-keystroke lookups
 * would blow through that on a normal address.
 */
export function AddressSearch({ value, onChange, onPick, placeholder, id }: Props) {
  const [hits, setHits] = useState<GeoHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the result list on an outside click.
  useEffect(() => {
    if (!hits) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setHits(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [hits]);

  const search = async () => {
    const q = value.trim();
    if (q.length < 2) {
      setError('Enter at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        method: 'GET',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Lookup failed');
      const results: GeoHit[] = data.results || [];
      setHits(results);
      if (!results.length) setError('No match. Try adding a city or country.');
    } catch (err: any) {
      setError(err?.message || 'Lookup failed');
      setHits(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle" />
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
            placeholder={placeholder ?? 'Search an address or place'}
            className="pl-8"
          />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          Find
        </Button>
      </div>

      {error && <span className="text-xs text-foreground-muted">{error}</span>}

      {hits && hits.length > 0 && (
        <ul
          className={cn(
            'absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto',
            'rounded-lg border border-border bg-surface shadow-elevation-md'
          )}
        >
          {hits.map((h, i) => (
            <li key={`${h.lat}-${h.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setHits(null);
                }}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
              >
                <span className="text-sm text-foreground line-clamp-2">{h.displayName}</span>
                <span className="font-mono text-[11px] text-foreground-subtle">
                  {Number(h.lat).toFixed(5)}, {Number(h.lng).toFixed(5)}
                  {h.type ? ` · ${h.type}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
