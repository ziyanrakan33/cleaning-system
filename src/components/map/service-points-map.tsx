"use client";

/**
 * §4/§5: shows both kinds of service point and supports adding one by
 * clicking the map, and moving one by dragging its marker.
 */
import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const KFAR_SABA_CENTER: [number, number] = [34.9075, 32.1775];

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#16a34a",
  BROKEN: "#dc2626",
  TEMPORARILY_CLOSED: "#d97706",
  REQUIRES_REVIEW: "#94a3b8",
};

export type ServicePointMarker = {
  id: string;
  kind: "WATER" | "WASTE";
  name: string;
  lat: number;
  lon: number;
  status: string;
};

export function ServicePointsMap({
  points,
  addMode,
  onMapClick,
  onSelect,
  onMove,
  selectedId,
}: {
  points: ServicePointMarker[];
  addMode: boolean;
  onMapClick?: (lat: number, lon: number) => void;
  onSelect?: (id: string) => void;
  onMove?: (id: string, lat: number, lon: number) => void;
  selectedId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center: KFAR_SABA_CENTER,
      zoom: 13.5,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl(), "top-left");
    mapRef.current = map;
    map.on("load", () => setLoaded(true));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Click-to-add
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = addMode ? "crosshair" : "";

    function handler(e: maplibregl.MapMouseEvent) {
      if (!addMode) return;
      onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    }
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMode, loaded]);

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.id);
      let marker = markersRef.current.get(p.id);
      const color = STATUS_COLOR[p.status] ?? "#64748b";

      if (!marker) {
        const el = document.createElement("div");
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = p.kind === "WATER" ? "50%" : "3px";
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
        el.style.cursor = "pointer";
        marker = new Marker({ element: el, draggable: !!onMove })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelect?.(p.id);
        });
        marker.on("dragend", () => {
          const pos = marker!.getLngLat();
          onMove?.(p.id, pos.lat, pos.lng);
        });
        markersRef.current.set(p.id, marker);
      } else {
        marker.setLngLat([p.lon, p.lat]);
      }
      const el = marker.getElement();
      el.style.background = color;
      el.style.outline = selectedId === p.id ? "3px solid #2563eb" : "none";
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, loaded, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
