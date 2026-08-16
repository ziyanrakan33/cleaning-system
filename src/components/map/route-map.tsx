"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, NavigationControl, Marker, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
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

export type RouteStop = {
  sequenceOrder: number;
  streetName: string;
  geometry: [number, number][] | null;
};

export function RouteMap({ stops, color }: { stops: RouteStop[]; color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

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

    map.on("load", () => {
      map.addSource("route-streets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "route-streets-halo",
        type: "line",
        source: "route-streets",
        paint: { "line-color": "#ffffff", "line-width": 6 },
      });
      map.addLayer({
        id: "route-streets-line",
        type: "line",
        source: "route-streets",
        paint: { "line-color": color, "line-width": 3.5 },
      });

      map.addSource("route-hops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "route-hops-line",
        type: "line",
        source: "route-hops",
        paint: { "line-color": color, "line-width": 1.5, "line-dasharray": [1, 1.5], "line-opacity": 0.6 },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function render() {
      const validStops = stops.filter((s) => s.geometry && s.geometry.length >= 2);

      const streetFeatures: GeoJSON.Feature[] = validStops.map((s) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: s.geometry! },
        properties: { sequenceOrder: s.sequenceOrder, name: s.streetName },
      }));
      const streetsSrc = map!.getSource("route-streets") as GeoJSONSource | undefined;
      streetsSrc?.setData({ type: "FeatureCollection", features: streetFeatures });

      const hopFeatures: GeoJSON.Feature[] = [];
      for (let i = 0; i < validStops.length - 1; i++) {
        const from = validStops[i].geometry![validStops[i].geometry!.length - 1];
        const to = validStops[i + 1].geometry![0];
        hopFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [from, to] },
          properties: {},
        });
      }
      const hopsSrc = map!.getSource("route-hops") as GeoJSONSource | undefined;
      hopsSrc?.setData({ type: "FeatureCollection", features: hopFeatures });

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = validStops.map((s) => {
        const el = document.createElement("div");
        el.textContent = String(s.sequenceOrder + 1);
        el.style.cssText = `
          background:${color}; color:#fff; font-size:11px; font-weight:700;
          width:20px; height:20px; border-radius:50%; display:flex;
          align-items:center; justify-content:center; border:2px solid white;
          box-shadow:0 1px 3px rgba(0,0,0,0.4);
        `;
        return new Marker({ element: el }).setLngLat(s.geometry![0]).addTo(map!);
      });

      if (validStops.length > 0 && validStops[0].geometry) {
        map!.flyTo({ center: validStops[0].geometry[0], zoom: 15, duration: 500 });
      }
    }

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [stops, color]);

  return <div ref={containerRef} className="h-full w-full" />;
}
