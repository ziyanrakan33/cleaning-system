"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Map as MapLibreMap, NavigationControl, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
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

type LonLat = [number, number];

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function ZoneBoundaryEditor({
  zoneId,
  zoneName,
  zoneColor,
}: {
  zoneId: string;
  zoneName: string;
  zoneColor: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointsRef = useRef<LonLat[]>([]);
  const [points, setPoints] = useState<LonLat[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  function refreshDrawSources() {
    const map = mapRef.current;
    if (!map) return;
    const pts = pointsRef.current;

    const pointFeatures: GeoJSON.Feature[] = pts.map((p, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p },
      properties: { index: i + 1 },
    }));
    (map.getSource("draw-points") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: pointFeatures });

    const lineCoords = pts.length >= 2 ? pts : [];
    (map.getSource("draw-line") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: lineCoords.length >= 2 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: lineCoords }, properties: {} }] : [],
    });

    (map.getSource("draw-fill") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features:
        pts.length >= 3
          ? [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] }, properties: {} }]
          : [],
    });
  }

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

      map.addSource("streets", { type: "geojson", data: streetsRes });
      map.addLayer({
        id: "streets-ref",
        type: "line",
        source: "streets",
        paint: { "line-color": "#94a3b8", "line-width": 1, "line-opacity": 0.6 },
      });

      map.addSource("other-zones", { type: "geojson", data: zonesRes });
      map.addLayer({
        id: "other-zones-fill",
        type: "fill",
        source: "other-zones",
        filter: ["!=", ["get", "id"], zoneId],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "other-zones-line-halo",
        type: "line",
        source: "other-zones",
        filter: ["!=", ["get", "id"], zoneId],
        paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "other-zones-line",
        type: "line",
        source: "other-zones",
        filter: ["!=", ["get", "id"], zoneId],
        paint: { "line-color": ["get", "color"], "line-width": 2.5 },
      });

      // Preload existing geometry for this zone, if any, so it can be re-edited.
      const thisZoneFeature = (zonesRes.features as GeoJSON.Feature[]).find((f) => f.properties?.id === zoneId);
      if (thisZoneFeature && thisZoneFeature.geometry.type === "Polygon") {
        const ring = (thisZoneFeature.geometry.coordinates[0] as LonLat[]).slice(0, -1);
        setPoints(ring);
      }

      map.addSource("draw-fill", { type: "geojson", data: emptyFC() });
      map.addLayer({ id: "draw-fill-layer", type: "fill", source: "draw-fill", paint: { "fill-color": zoneColor, "fill-opacity": 0.3 } });

      map.addSource("draw-line", { type: "geojson", data: emptyFC() });
      map.addLayer({ id: "draw-line-halo-layer", type: "line", source: "draw-line", paint: { "line-color": "#ffffff", "line-width": 7 } });
      map.addLayer({ id: "draw-line-layer", type: "line", source: "draw-line", paint: { "line-color": zoneColor, "line-width": 3.5 } });

      map.addSource("draw-points", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-points-layer",
        type: "circle",
        source: "draw-points",
        paint: { "circle-radius": 7, "circle-color": zoneColor, "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });

      map.on("click", (e) => {
        pointsRef.current = [...pointsRef.current, [e.lngLat.lng, e.lngLat.lat]];
        setPoints(pointsRef.current);
        refreshDrawSources();
      });

      refreshDrawSources();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function undoLast() {
    pointsRef.current = pointsRef.current.slice(0, -1);
    setPoints(pointsRef.current);
    refreshDrawSources();
  }

  function clearAll() {
    pointsRef.current = [];
    setPoints([]);
    refreshDrawSources();
  }

  async function save() {
    if (points.length < 3) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/zones/${zoneId}/geometry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ring: points }),
      });
      if (!res.ok) throw new Error("שמירה נכשלה");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="h-full w-full" />

      <div className="no-print absolute right-4 top-4 z-10 w-72 rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: zoneColor }} />
          <span className="font-semibold">{zoneName}</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          לחצו על המפה כדי להוסיף נקודות לגבול האזור. נדרשות לפחות 3 נקודות.
        </p>
        <div className="mb-3 text-sm">
          נקודות שסומנו: <span className="font-bold tabular-nums">{points.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={undoLast}
            disabled={points.length === 0}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            בטל נקודה אחרונה
          </button>
          <button
            onClick={clearAll}
            disabled={points.length === 0}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            נקה הכל
          </button>
          <button
            onClick={save}
            disabled={points.length < 3 || saving}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            {saving ? "שומר..." : "סגור ושמור גבול"}
          </button>
        </div>
        {saved && <div className="mt-2 text-xs text-success">הגבול נשמר בהצלחה.</div>}
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        <a href="/zones" className="mt-3 block text-center text-xs text-accent hover:underline">
          חזרה לרשימת האזורים
        </a>
      </div>
    </div>
  );
}
