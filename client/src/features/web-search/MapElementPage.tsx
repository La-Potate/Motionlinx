import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy, Check, MapPin, Map, Download } from 'lucide-react';
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

function generateOSM(title: string, subtitle: string, locations: Location[], width: number, height: number) {
  const valid = locations.filter((l) => l.lat && l.lng);
  if (!valid.length) return '<!-- Add at least one location with coordinates -->';
  const centerLat =
    valid.reduce((s, l) => s + parseFloat(l.lat), 0) / valid.length;
  const centerLng =
    valid.reduce((s, l) => s + parseFloat(l.lng), 0) / valid.length;
  const markers = valid
    .map((loc, i) => {
      const popup = loc.link
        ? `<strong>${loc.name || `Location ${i + 1}`}</strong>${loc.address ? `<br>${loc.address}` : ''}<br><a href="${loc.link}" target="_blank">View Details</a>`
        : `<strong>${loc.name || `Location ${i + 1}`}</strong>${loc.address ? `<br>${loc.address}` : ''}`;
      return `      L.marker([${loc.lat}, ${loc.lng}]).addTo(map).bindPopup('${popup.replace(/'/g, "\\'")}');`;
    })
    .join('\n');
  return `<div class="map-section">
  ${title ? `<h2 class="map-title">${title}</h2>` : ''}
  ${subtitle ? `<p class="map-subtitle">${subtitle}</p>` : ''}
  <div id="map" style="width: ${width}px; height: ${height}px; border-radius: 8px; overflow: hidden;"></div>
</div>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map').setView([${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}], ${valid.length === 1 ? 13 : 6});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
${markers}
</script>`;
}

function generateIframe(title: string, subtitle: string, locations: Location[], width: number, height: number) {
  const first = locations.find((l) => l.lat && l.lng);
  if (!first) return '<!-- Add at least one location with coordinates -->';
  return `<div class="map-section">
  ${title ? `<h2>${title}</h2>` : ''}
  ${subtitle ? `<p>${subtitle}</p>` : ''}
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

  const output = useMemo(() => {
    const w = parseInt(width, 10) || 600;
    const h = parseInt(height, 10) || 450;
    return mode === 'osm-iframe'
      ? generateIframe(title, subtitle, locations, w, h)
      : generateOSM(title, subtitle, locations, w, h);
  }, [title, subtitle, locations, width, height, mode]);

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
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Name"
                    value={loc.name}
                    onChange={(e) => updateLoc(i, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Address"
                    value={loc.address}
                    onChange={(e) => updateLoc(i, { address: e.target.value })}
                  />
                  <Input
                    placeholder="Latitude"
                    value={loc.lat}
                    onChange={(e) => updateLoc(i, { lat: e.target.value })}
                  />
                  <Input
                    placeholder="Longitude"
                    value={loc.lng}
                    onChange={(e) => updateLoc(i, { lng: e.target.value })}
                  />
                  <Input
                    placeholder="Link (optional)"
                    value={loc.link}
                    onChange={(e) => updateLoc(i, { link: e.target.value })}
                    className="col-span-2"
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
          <Tabs defaultValue="code">
            <TabsList>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="code">
              <Textarea
                value={output}
                readOnly
                className="font-mono text-xs h-80"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div
                className="rounded-md border border-border bg-surface-muted overflow-hidden"
                style={{ minHeight: 300 }}
                dangerouslySetInnerHTML={{ __html: output }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ToolPage>
  );
}
