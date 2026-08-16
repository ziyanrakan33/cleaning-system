"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const KFAR_SABA_CENTER: [number, number] = [34.9075, 32.1775];

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f59e0b",
  NORMAL: "#3b82f6",
  LOW: "#64748b",
};

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

export function StreetsMap({
  onSelectStreet,
  selectedStreetId,
}: {
  onSelectStreet?: (id: string, props: Record<string, unknown>) => void;
  selectedStreetId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
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

    map.on("load", async () => {
      const [streetsRes, zonesRes] = await Promise.all([
        fetch("/api/geo/streets").then((r) => r.json()),
        fetch("/api/geo/zones").then((r) => r.json()),
      ]);

      map.addSource("zones", { type: "geojson", data: zonesRes });
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "zones-line-halo",
        type: "line",
        source: "zones",
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "zones-line",
        type: "line",
        source: "zones",
        paint: { "line-color": ["get", "color"], "line-width": 3 },
      });

      map.addSource("streets", { type: "geojson", data: streetsRes });
      map.addLayer({
        id: "streets-line",
        type: "line",
        source: "streets",
        paint: {
          "line-color": [
            "match",
            ["get", "priority"],
            "CRITICAL", PRIORITY_COLORS.CRITICAL,
            "HIGH", PRIORITY_COLORS.HIGH,
            "NORMAL", PRIORITY_COLORS.NORMAL,
            "LOW", PRIORITY_COLORS.LOW,
            PRIORITY_COLORS.NORMAL,
          ],
          "line-width": ["match", ["get", "type"], "PATH", 1.5, 3],
          "line-dasharray": ["match", ["get", "type"], "PATH", ["literal", [2, 1.5]], ["literal", [1, 0]]],
        },
      });

      map.on("click", "streets-line", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        onSelectStreet?.(f.properties!.id as string, f.properties as Record<string, unknown>);
      });
      map.on("mouseenter", "streets-line", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "streets-line", () => (map.getCanvas().style.cursor = ""));

      setLoaded(true);
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __map: MapLibreMap }).__map = map;
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (map.getLayer("streets-line")) {
      map.setPaintProperty("streets-line", "line-width", [
        "match",
        ["get", "id"],
        selectedStreetId ?? "__none__",
        5,
        ["match", ["get", "type"], "PATH", 1.5, 3],
      ]);
    }
  }, [selectedStreetId, loaded]);

  return <div ref={containerRef} className="h-full w-full" />;
}
