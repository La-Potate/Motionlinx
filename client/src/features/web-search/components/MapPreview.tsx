import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type PreviewMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
};

type Props = {
  markers: PreviewMarker[];
  zoom: number;
  height?: number;
  /** Fired when a marker is dragged, so the form fields stay authoritative. */
  onMove: (id: string, lat: number, lng: number) => void;
  /** Fired when the user zooms, so the generated snippet matches the preview. */
  onZoomChange: (zoom: number) => void;
};

/**
 * Live Leaflet preview for the Map Element builder.
 *
 * Before this, the tool emitted embed code you could not see until you pasted
 * it into your own site, and coordinates had to be typed by hand. Markers here
 * are draggable and write their new position straight back into the form, so
 * placement is done by eye.
 *
 * Leaflet is imperative and owns its own DOM, so the map instance lives in a
 * ref and React never re-renders into that subtree — only the marker layer is
 * reconciled on updates.
 */
export function MapPreview({ markers, zoom, height = 340, onMove, onZoomChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Callbacks are read through a ref so re-creating them per render never
  // detaches and re-attaches Leaflet's event handlers.
  const cbRef = useRef({ onMove, onZoomChange });
  cbRef.current = { onMove, onZoomChange };

  // Create once.
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      center: [20, 0],
      zoom,
      scrollWheelZoom: false, // page scroll should not be hijacked
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('zoomend', () => cbRef.current.onZoomChange(map.getZoom()));
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile markers.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { draggable: true });
      if (m.label) marker.bindTooltip(m.label, { direction: 'top' });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        cbRef.current.onMove(m.id, lat, lng);
      });
      marker.addTo(layer);
    });

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], map.getZoom());
    } else if (markers.length > 1) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), {
        padding: [36, 36],
      });
    }
  }, [markers]);

  // Keep the map in step when zoom is changed from outside (the slider).
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.getZoom() !== zoom) map.setZoom(zoom);
  }, [zoom]);

  // Leaflet measures its container on creation; if the card was laid out after
  // that, tiles render into a stale size until it is told to re-measure.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(t);
  }, [height, markers.length]);

  return (
    <div
      ref={hostRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-lg border border-border bg-surface-muted"
      role="application"
      aria-label="Map preview — drag a pin to reposition it"
    />
  );
}
