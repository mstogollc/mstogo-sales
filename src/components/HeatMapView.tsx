import { useEffect, useRef, useState, type FC } from "react";
import { LEVEL_COLOR, boundsOf, type MapPoint } from "../lib/heatMap";

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

// Minimal structural typing for the slice of the Leaflet API we use. Avoids
// pulling in @types/leaflet (and the leaflet npm package) just for the map.
interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: [[number, number], [number, number]], opts?: { padding?: [number, number]; maxZoom?: number }): void;
  remove(): void;
  removeLayer(layer: unknown): void;
}
interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
  bindTooltip(content: string): LeafletLayer;
}
interface LeafletDivIcon {
  options: Record<string, unknown>;
}
interface LeafletStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, opts?: Record<string, unknown>): LeafletLayer;
  circleMarker(latlng: [number, number], opts?: Record<string, unknown>): LeafletLayer;
  marker(latlng: [number, number], opts?: Record<string, unknown>): LeafletLayer;
  divIcon(opts: Record<string, unknown>): LeafletDivIcon;
}

declare global {
  interface Window {
    L?: LeafletStatic;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let leafletPromise: Promise<LeafletStatic | null> | null = null;

function loadLeaflet(): Promise<LeafletStatic | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve) => {
    if (!document.querySelector(`link[data-leaflet]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.setAttribute("data-leaflet", "true");
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[data-leaflet]`);
    const onReady = () => resolve(window.L ?? null);
    if (existing) {
      if (window.L) resolve(window.L);
      else existing.addEventListener("load", onReady);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.setAttribute("data-leaflet", "true");
    script.addEventListener("load", onReady);
    script.addEventListener("error", () => resolve(null));
    document.body.appendChild(script);
  });
  return leafletPromise;
}

interface Props {
  points: MapPoint[];
  center?: { lat: number; lng: number };
}

export const HeatMapView: FC<Props> = ({ points, center }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletLayer[]>([]);
  const [failed, setFailed] = useState(false);

  // Create the map once Leaflet is available and the container is mounted.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current || mapRef.current) {
        if (!L) setFailed(true);
        return;
      }
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        center ? [center.lat, center.lng] : [34.7304, -86.5861],
        11,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
      }
    };
  }, []);

  // Redraw markers whenever the points change.
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    for (const m of markersRef.current) map.removeLayer(m);
    markersRef.current = [];

    if (points.length === 0) return;

    for (const p of points) {
      const size = 34;
      const icon = L.divIcon({
        className: "heat-pin-wrap",
        html: `<span class="heat-pin heat-pin-${p.level}" style="background:${LEVEL_COLOR[p.level]}">${escapeHtml(
          p.marker,
        )}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        tooltipAnchor: [0, -size / 2],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map).bindTooltip(p.title);
      markersRef.current.push(marker);
    }

    const b = boundsOf(points);
    if (b) {
      map.fitBounds(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        { padding: [28, 28], maxZoom: 14 },
      );
    }
  }, [points]);

  if (failed) {
    return (
      <div className="heatmap-map-fallback notice">
        The interactive map couldn't load. The grid below shows the same ranking data.
      </div>
    );
  }

  return <div ref={containerRef} className="heatmap-map" aria-label="Local ranking map with colored ranking dots" />;
};
