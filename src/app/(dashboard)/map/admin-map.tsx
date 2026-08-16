"use client";

import { useEffect, useRef, useState } from "react";
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

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };
const TYPE_LABEL: Record<string, string> = { STREET: "רחוב", PATH: "שביל", PEDESTRIAN_MALL: "מדרחוב", PUBLIC_AREA: "שטח ציבורי", OTHER: "אחר" };
const FREQ_LABEL: Record<string, string> = { DAILY: "כל יום", TIMES_PER_WEEK: "X פעמים בשבוע", WEEKLY: "פעם בשבוע", SPECIFIC_DAYS: "ימים מסוימים", AS_NEEDED: "לפי צורך" };

type StreetProps = {
  id: string;
  name: string;
  type: string;
  priority: string;
  zoneId: string | null;
  zoneName: string | null;
  lengthM: number | null;
  cleaningFrequency: { type: string } | null;
  estimatedCleanMinutes: number | null;
  notes: string | null;
};

type LayerState = {
  zones: boolean;
  streets: boolean;
  paths: boolean;
  taskDone: boolean;
  taskPending: boolean;
  taskNotDone: boolean;
};

export function AdminMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    zones: true,
    streets: true,
    paths: true,
    taskDone: true,
    taskPending: true,
    taskNotDone: true,
  });
  const [selected, setSelected] = useState<StreetProps | null>(null);
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
      try {
      const [streetsRes, zonesRes, todayRes] = await Promise.all([
        fetch("/api/geo/streets").then((r) => r.json()),
        fetch("/api/geo/zones").then((r) => r.json()),
        fetch("/api/plans/today").then((r) => r.json()),
      ]);

      const taskStatusByStreet = new Map<string, string>();
      for (const t of todayRes.tasks ?? []) taskStatusByStreet.set(t.streetId, t.status);

      for (const f of streetsRes.features) {
        f.properties.taskStatus = taskStatusByStreet.get(f.properties.id) ?? null;
      }

      map.addSource("zones", { type: "geojson", data: zonesRes });
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 } });
      map.addLayer({ id: "zones-line-halo", type: "line", source: "zones", paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
      map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: { "line-color": ["get", "color"], "line-width": 3 } });

      map.addSource("streets", { type: "geojson", data: streetsRes });

      // Base street/path lines (always visible when their layer is on), colored by priority.
      map.addLayer({
        id: "streets-line",
        type: "line",
        source: "streets",
        filter: ["==", ["get", "type"], "STREET"],
        paint: {
          "line-color": ["match", ["get", "priority"], "CRITICAL", "#dc2626", "HIGH", "#f59e0b", "NORMAL", "#3b82f6", "LOW", "#64748b", "#3b82f6"],
          "line-width": 3,
        },
      });
      map.addLayer({
        id: "paths-line",
        type: "line",
        source: "streets",
        filter: ["in", ["get", "type"], ["literal", ["PATH", "PEDESTRIAN_MALL"]]],
        paint: {
          "line-color": ["match", ["get", "priority"], "CRITICAL", "#dc2626", "HIGH", "#f59e0b", "NORMAL", "#3b82f6", "LOW", "#64748b", "#3b82f6"],
          "line-width": 1.5,
          "line-dasharray": [2, 1.5],
        },
      });

      // Today's task-status overlays (drawn on top, thicker).
      map.addLayer({
        id: "task-done",
        type: "line",
        source: "streets",
        filter: ["==", ["get", "taskStatus"], "DONE"],
        paint: { "line-color": "#16a34a", "line-width": 5, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "task-pending",
        type: "line",
        source: "streets",
        filter: ["in", ["get", "taskStatus"], ["literal", ["PENDING", "IN_PROGRESS"]]],
        paint: { "line-color": "#3b82f6", "line-width": 5, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "task-not-done",
        type: "line",
        source: "streets",
        filter: ["in", ["get", "taskStatus"], ["literal", ["NOT_DONE", "PROBLEM"]]],
        paint: { "line-color": "#dc2626", "line-width": 5, "line-opacity": 0.85 },
      });

      for (const layerId of ["streets-line", "paths-line", "task-done", "task-pending", "task-not-done"]) {
        map.on("click", layerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          setSelected(f.properties as StreetProps);
        });
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }

      setLoaded(true);
      } catch (err) {
        console.error("AdminMap load failed:", err);
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
    const vis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    vis("zones-fill", layers.zones);
    vis("zones-line-halo", layers.zones);
    vis("zones-line", layers.zones);
    vis("streets-line", layers.streets);
    vis("paths-line", layers.paths);
    vis("task-done", layers.taskDone);
    vis("task-pending", layers.taskPending);
    vis("task-not-done", layers.taskNotDone);
  }, [layers, loaded]);

  function toggle(key: keyof LayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const freq = selected?.cleaningFrequency as { type: string } | null;

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="h-full w-full" />

      <div className="no-print absolute right-4 top-4 z-10 w-64 rounded-xl border border-panel-border bg-panel/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 text-xs font-semibold text-muted">שכבות</div>
        <div className="space-y-1.5 text-sm">
          {([
            ["zones", "אזורים"],
            ["streets", "רחובות"],
            ["paths", "שבילים"],
            ["taskPending", "משימות היום — ממתינות"],
            ["taskDone", "משימות היום — הושלמו"],
            ["taskNotDone", "משימות היום — לא בוצעו"],
          ] as [keyof LayerState, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {selected && (
        <div className="no-print absolute left-4 top-4 z-10 w-72 rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-start justify-between">
            <div className="font-bold">{selected.name}</div>
            <button onClick={() => setSelected(null)} className="text-muted">✕</button>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">סוג</span><span>{TYPE_LABEL[selected.type] ?? selected.type}</span></div>
            <div className="flex justify-between"><span className="text-muted">אזור</span><span>{selected.zoneName ?? "ללא"}</span></div>
            <div className="flex justify-between"><span className="text-muted">אורך</span><span>{selected.lengthM ? `${Math.round(selected.lengthM)} מ׳` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">עדיפות</span><span>{PRIORITY_LABEL[selected.priority] ?? selected.priority}</span></div>
            <div className="flex justify-between"><span className="text-muted">תדירות</span><span>{freq ? FREQ_LABEL[freq.type] ?? freq.type : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">זמן ניקיון משוער</span><span>{selected.estimatedCleanMinutes ? `${selected.estimatedCleanMinutes} דק׳` : "—"}</span></div>
            {selected.notes && <div className="pt-1 text-xs text-muted">{selected.notes}</div>}
          </div>
          <a href="/streets" className="mt-3 block text-xs text-accent hover:underline">
            עריכה במסך רחובות ושבילים ←
          </a>
        </div>
      )}
    </div>
  );
}
