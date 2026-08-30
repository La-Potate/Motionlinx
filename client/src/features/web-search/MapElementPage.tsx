import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy, Check, Map, Download, Crosshair } from 'lucide-react';
import { AddressSearch } from './components/AddressSearch';
import { MapPreview, type PreviewMarker } from './components/MapPreview';
import { ToolPage } from '@/shared/components/ToolPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/sonner';

type Location = { id: string; name: string; address: string; lat: string; lng: string; link: string };

const emptyLocation = (): Location => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  address: '',
  lat: '',
  lng: '',
  link: '',
});

/** Escape text before it is interpolated into generated HTML/JS. Names,
 *  addresses and links are free text, and previously went in raw. */
function esc(v: string) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateOSM(
  title: string,
  subtitle: string,
  locations: Location[],
  width: number,
  height: number,
  zoom: number
) {
  const valid = locations.filter((l) => l.lat && l.lng);
  if (!valid.length) return '<!-- Add at least one location with coordinates -->';
  const centerLat =
    valid.reduce((s, l) => s + parseFloat(l.lat), 0) / valid.length;
  const centerLng =
    valid.reduce((s, l) => s + parseFloat(l.lng), 0) / valid.length;
  const markers = valid
    .map((loc, i) => {
      const name = esc(loc.name || `Location ${i + 1}`);
      const addr = loc.address ? `<br>${esc(loc.address)}` : '';
      const popup = loc.link
        ? `<strong>${name}</strong>${addr}<br><a href="${esc(loc.link)}" target="_blank" rel="noopener">View Details</a>`
        : `<strong>${name}</strong>${addr}`;
      return `      L.marker([${loc.lat}, ${loc.lng}]).addTo(map).bindPopup('${popup.replace(/'/g, "\\'")}');`;
    })
    .join('\n');
  return `<div class="map-section">
  ${title ? `<h2 class="map-title">${esc(title)}</h2>` : ''}
  ${subtitle ? `<p class="map-subtitle">${esc(subtitle)}</p>` : ''}
  <div id="map" style="width: ${width}px; height: ${height}px; border-radius: 8px; overflow: hidden;"></div>
</div>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map').setView([${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}], ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
${markers}
</script>`;
}

function generateIframe(
  title: string,
  subtitle: string,
  locations: Location[],
  width: number,
  height: number
) {
  const first = locations.find((l) => l.lat && l.lng);
  if (!first) return '<!-- Add at least one location with coordinates -->';
  return `<div class="map-section">
  ${title ? `<h2>${esc(title)}</h2>` : ''}
  ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
  <iframe
    src="https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(first.lng) - 0.05}%2C${parseFloat(first.lat) - 0.05}%2C${parseFloat(first.lng) + 0.05}%2C${parseFloat(first.lat) + 0.05}&layer=mapnik&marker=${first.lat}%2C${first.lng}"
    width="${width}" height="${height}" style="border:0; border-radius:8px;" loading="lazy"></iframe>
</div>`;
}

export default function MapElementPage() {
  const [title, setTitle] = useState('Find us on the map');
  const [subtitle, setSubtitle] = useState('');
  const [width, setWidth] = useState('600');
  const [height, setHeight] = useState('450');
  const [mode, setMode] = useState<'osm-leaflet' | 'osm-iframe'>('osm-leaflet');
  const [locations, setLocations] = useState<Location[]>([emptyLocation()]);
  const [copied, setCopied] = useState(false);
  // Driven by the preview map, so the snippet opens at whatever the user
  // framed rather than a hardcoded guess.
  const [zoom, setZoom] = useState(13);

  const output = useMemo(() => {
    const w = parseInt(width, 10) || 600;
    const h = parseInt(height, 10) || 450;
    return mode === 'osm-iframe'
      ? generateIframe(title, subtitle, locations, w, h)
      : generateOSM(title, subtitle, locations, w, h, zoom);
  }, [title, subtitle, locations, width, height, mode, zoom]);

  /** Locations that have usable coordinates, shaped for the preview map. */
  const previewMarkers: PreviewMarker[] = useMemo(
    () =>
      locations
        .filter((l) => l.lat !== '' && l.lng !== '' && !Number.isNaN(Number(l.lat)) && !Number.isNaN(Number(l.lng)))
        .map((l, i) => ({
          id: l.id,
          lat: Number(l.lat),
          lng: Number(l.lng),
          label: l.name || l.address || `Location ${i + 1}`,
        })),
    [locations]
  );

  /** Dragging a pin is just another way of editing the coordinate fields. */
  const onMarkerMove = (id: string, lat: number, lng: number) =>
    setLocations((prev) =>
      prev.map((l) => (l.id === id ? { ...l, lat: lat.toFixed(6), lng: lng.toFixed(6) } : l))
    );

  const updateLoc = (i: number, patch: Partial<Location>) =>
    setLocations((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    toast.success('Snippet copied');
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    const blob = new Blob([output], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map-element.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      eyebrow="Web Search"
      icon={Map}
      title="Map element"
      description="Generate copy-pasteable map embeds for any page, with markers and popups."
      twoColumn
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Map settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Provider</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="osm-leaflet">OpenStreetMap (Leaflet)</SelectItem>
                  <SelectItem value="osm-iframe">OpenStreetMap (iframe)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="map-title">Title</Label>
              <Input
                id="map-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="map-subtitle">Subtitle</Label>
              <Input
                id="map-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="map-w">Width (px)</Label>
                <Input
                  id="map-w"
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="map-h">Height (px)</Label>
                <Input
                  id="map-h"
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Locations</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocations((p) => [...p, emptyLocation()])}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {locations.map((loc, i) => (
              <div key={loc.id} className="rounded-md border border-border bg-surface-muted/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground-muted">
                    Location {i + 1}
                  </span>
                  {locations.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        setLocations((p) => p.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="size-3.5 text-rose-ink" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Name"
                    value={loc.name}
                    onChange={(e) => updateLoc(i, { name: e.target.value })}
                  />

                  {/* Search fills the coordinates, so nobody has to look them
                      up by hand. Typing them directly still works. */}
                  <AddressSearch
                    value={loc.address}
                    onChange={(v) => updateLoc(i, { address: v })}
                    onPick={(hit) =>
                      updateLoc(i, {
                        address: hit.displayName,
                        lat: Number(hit.lat).toFixed(6),
                        lng: Number(hit.lng).toFixed(6),
                      })
                    }
                    placeholder="Search an address, or paste one"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Latitude"
                      value={loc.lat}
                      onChange={(e) => updateLoc(i, { lat: e.target.value })}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="Longitude"
                      value={loc.lng}
                      onChange={(e) => updateLoc(i, { lng: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>

                  <Input
                    placeholder="Link (optional)"
                    value={loc.link}
                    onChange={(e) => updateLoc(i, { link: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Map className="size-4" /> Output
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="size-3.5" /> Download
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              {previewMarkers.length === 0 ? (
                <div className="flex h-[340px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
                  <Crosshair className="size-5 text-foreground-subtle" />
                  <p className="text-sm text-foreground-muted max-w-xs">
                    Search an address above and the map appears here. Drag the pin to
                    fine-tune its position.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Rendered with the real Leaflet build rather than injecting
                      the generated markup: innerHTML never executes <script>,
                      so the old preview showed nothing for this mode. */}
                  <MapPreview
                    markers={previewMarkers}
                    zoom={zoom}
                    onMove={onMarkerMove}
                    onZoomChange={setZoom}
                  />
                  <div className="flex items-center gap-3">
                    <Label htmlFor="map-zoom" className="shrink-0 text-xs">
                      Zoom
                    </Label>
                    <input
                      id="map-zoom"
                      type="range"
                      min={2}
                      max={19}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="w-6 text-right font-mono text-xs tabular-nums text-foreground-muted">
                      {zoom}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-muted">
                    Drag a pin to move it — the coordinate fields update as you go.
                    The zoom you set here is the zoom the embed opens at.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="code">
              <Textarea value={output} readOnly className="font-mono text-xs h-80" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ToolPage>
  );
}
