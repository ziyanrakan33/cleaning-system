"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, type StyleSpecification } from "maplibre-gl";
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

/** Distinct fills for the two contract areas, used by the "colour by contractor" mode. */
const CONTRACT_AREA_COLORS: Record<number, string> = { 1: "#2563eb", 2: "#16a34a" };
const UNASSIGNED_COLOR = "#94a3b8";

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "קריטי", HIGH: "גבוה", NORMAL: "רגיל", LOW: "נמוך" };
const TYPE_LABEL: Record<string, string> = {
  STREET: "רחוב",
  PATH: "שביל",
  PEDESTRIAN_MALL: "מדרחוב",
  PUBLIC_AREA: "שטח ציבורי",
  OTHER: "אחר",
};
const FREQ_LABEL: Record<string, string> = {
  DAILY: "כל יום",
  TIMES_PER_WEEK: "X פעמים בשבוע",
  WEEKLY: "פעם בשבוע",
  SPECIFIC_DAYS: "ימים מסוימים",
  AS_NEEDED: "לפי צורך",
};

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
  dirtScore: number | null;
  dataMode: string | null;
  confidence: string | null;
  accessIssue: boolean | null;
  isDemo: boolean;
};

type ServicePointProps = {
  id: string;
  name: string;
  status: string;
  verificationStatus: string;
  kind: "WATER" | "WASTE";
  flowLitersPerMin?: number | null;
  avgFillMinutes?: number | null;
  avgWaitMinutes?: number | null;
  isDemo: boolean;
};

const DATA_MODE_LABEL: Record<string, string> = {
  REQUIRES_REVIEW: "דורש סקר",
  MANUAL_BASELINE: "הערכת מנהל עבודה",
  RULE_BASED: "מבוסס כללים",
  DATA_INFORMED: "מבוסס נתוני ביצוע",
};
const SERVICE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "פעילה",
  BROKEN: "תקולה",
  TEMPORARILY_CLOSED: "סגורה זמנית",
  REQUIRES_REVIEW: "דורשת אישור",
};

type ZoneSummary = {
  id: string;
  name: string;
  code: string;
  color: string;
  zoneNumber: number | null;
  hasBoundary: boolean;
  contractArea: { name: string; areaNumber: number; contractorName: string | null } | null;
  contractAreaStatus: string;
  streetsCount: number;
  pathsCount: number;
  publicAreaCount: number;
  segmentCount: number;
  totalKm: number;
  segmentsRequiringReview: number;
  activeResources: number;
  todayPlan: { versionNumber: number; status: string; total: number; done: number; notDone: number; pending: number } | null;
  completionPercent: number | null;
  contractQuotas: {
    lineNumber: number;
    resourceName: string;
    quantity: number;
    shiftHours: number;
    tenderQuantity: number | null;
    unitPrice: number | null;
    dailyTotal: number | null;
  }[];
  updatedAt: string;
};

type LayerKey =
  | "zones"
  | "streets"
  | "paths"
  | "segments"
  | "unassigned"
  | "crossing"
  | "taskDone"
  | "taskPending"
  | "taskNotDone"
  | "waterPoints"
  | "wastePoints"
  | "requiresVerification";

const LAYER_LABELS: [LayerKey, string][] = [
  ["zones", "אזורים תפעוליים"],
  ["streets", "רחובות"],
  ["paths", "שבילים ומדרחובים"],
  ["segments", "מקטעים לפי אזור"],
  ["unassigned", "מקטעים ללא שיוך"],
  ["crossing", "רחובות שחוצים אזורים"],
  ["taskPending", "משימות היום — ממתינות"],
  ["taskDone", "משימות היום — הושלמו"],
  ["taskNotDone", "משימות היום — לא בוצעו"],
  ["waterPoints", "נקודות מים"],
  ["wastePoints", "נקודות פריקת פסולת"],
  ["requiresVerification", "נקודות הדורשות אימות"],
];

export function AdminMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    zones: true,
    streets: true,
    paths: true,
    segments: false,
    unassigned: true,
    crossing: false,
    taskDone: true,
    taskPending: true,
    taskNotDone: true,
    waterPoints: true,
    wastePoints: true,
    requiresVerification: true,
  });
  const [colorByContract, setColorByContract] = useState(false);
  const [colorByDirt, setColorByDirt] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<ServicePointProps | null>(null);
  const [selectedStreet, setSelectedStreet] = useState<StreetProps | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneSummary | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zonesWithoutBoundary, setZonesWithoutBoundary] = useState<string[]>([]);
  const [isEmpty, setIsEmpty] = useState(false);
  const [search, setSearch] = useState("");
  const [streetIndex, setStreetIndex] = useState<{ id: string; name: string; zoneName: string | null; center: [number, number] }[]>([]);

  const openZone = useCallback(async (zoneId: string) => {
    setZoneLoading(true);
    setSelectedStreet(null);
    try {
      const res = await fetch(`/api/zones/${zoneId}/summary`);
      if (!res.ok) throw new Error("טעינת פרטי האזור נכשלה");
      setSelectedZone(await res.json());
    } catch (err) {
      console.error(err);
      setSelectedZone(null);
    } finally {
      setZoneLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center: KFAR_SABA_CENTER,
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl(), "top-left");
    mapRef.current = map;

    map.on("load", async () => {
      try {
        const [streetsRes, zonesRes, segmentsRes, todayRes, servicePointsRes] = await Promise.all([
          fetch("/api/geo/streets").then((r) => r.json()),
          fetch("/api/geo/zones").then((r) => r.json()),
          fetch("/api/geo/segments").then((r) => r.json()),
          fetch("/api/plans/today").then((r) => r.json()),
          fetch("/api/geo/service-points").then((r) => r.json()),
        ]);

        const taskStatusByStreet = new Map<string, string>();
        for (const t of todayRes.tasks ?? []) taskStatusByStreet.set(t.streetId, t.status);
        for (const f of streetsRes.features) {
          f.properties.taskStatus = taskStatusByStreet.get(f.properties.id) ?? null;
        }

        // Build a searchable index of street names with a coordinate to fly to.
        setStreetIndex(
          (streetsRes.features as GeoJSON.Feature[]).map((f) => {
            const coords = (f.geometry as GeoJSON.LineString).coordinates;
            const mid = coords[Math.floor(coords.length / 2)] as [number, number];
            return {
              id: f.properties!.id as string,
              name: f.properties!.name as string,
              zoneName: (f.properties!.zoneName as string) ?? null,
              center: mid,
            };
          })
        );

        // ---- zones -------------------------------------------------------
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
        // Zone number, so the map reads like the printed one it came from.
        map.addLayer({
          id: "zones-label",
          type: "symbol",
          source: "zones",
          layout: {
            "text-field": ["coalesce", ["to-string", ["get", "zoneNumber"]], ["get", "code"]],
            "text-size": 22,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#b91c1c", "text-halo-color": "#ffffff", "text-halo-width": 2.5 },
        });

        // ---- segments (one feature per street-part per zone) --------------
        map.addSource("segments", { type: "geojson", data: segmentsRes });
        map.addLayer({
          id: "segments-line",
          type: "line",
          source: "segments",
          layout: { visibility: "none" },
          paint: { "line-color": ["get", "zoneColor"], "line-width": 4, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "segments-unassigned",
          type: "line",
          source: "segments",
          filter: ["==", ["get", "zoneId"], null],
          paint: { "line-color": "#dc2626", "line-width": 4, "line-dasharray": [2, 2] },
        });
        map.addLayer({
          id: "segments-crossing",
          type: "line",
          source: "segments",
          filter: ["==", ["get", "crossesZones"], true],
          layout: { visibility: "none" },
          paint: { "line-color": "#7c3aed", "line-width": 5, "line-opacity": 0.9 },
        });

        // ---- streets / paths ---------------------------------------------
        map.addSource("streets", { type: "geojson", data: streetsRes });
        map.addLayer({
          id: "streets-line",
          type: "line",
          source: "streets",
          filter: ["==", ["get", "type"], "STREET"],
          paint: {
            "line-color": [
              "match",
              ["get", "priority"],
              "CRITICAL", "#dc2626",
              "HIGH", "#f59e0b",
              "NORMAL", "#3b82f6",
              "LOW", "#64748b",
              "#3b82f6",
            ],
            "line-width": 2.5,
          },
        });
        map.addLayer({
          id: "paths-line",
          type: "line",
          source: "streets",
          filter: ["in", ["get", "type"], ["literal", ["PATH", "PEDESTRIAN_MALL"]]],
          paint: {
            "line-color": [
              "match",
              ["get", "priority"],
              "CRITICAL", "#dc2626",
              "HIGH", "#f59e0b",
              "NORMAL", "#3b82f6",
              "LOW", "#64748b",
              "#3b82f6",
            ],
            "line-width": 1.5,
            "line-dasharray": [2, 1.5],
          },
        });

        // ---- today's execution overlay -----------------------------------
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

        // Zones that exist but have no polygon can't be drawn — say so rather
        // than letting them silently vanish from the map.
        const drawn = new Set(
          (zonesRes.features as GeoJSON.Feature[]).map((f) => f.properties!.code as string)
        );
        const zonesMeta: { code: string; name: string }[] = await fetch("/api/zones")
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        setZonesWithoutBoundary(
          zonesMeta.filter((z) => !drawn.has(z.code)).map((z) => z.name)
        );

        for (const layerId of ["streets-line", "paths-line", "task-done", "task-pending", "task-not-done", "segments-line", "segments-unassigned", "segments-crossing"]) {
          map.on("click", layerId, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            setSelectedZone(null);
            setSelectedStreet(f.properties as unknown as StreetProps);
          });
          map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
        }

        map.on("click", "zones-fill", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          openZone(f.properties!.id as string);
        });
        map.on("mouseenter", "zones-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "zones-fill", () => (map.getCanvas().style.cursor = ""));

        // ---- water / waste service points (§4, §5, §14) --------------------
        map.addSource("service-points", { type: "geojson", data: servicePointsRes });
        map.addLayer({
          id: "water-points",
          type: "circle",
          source: "service-points",
          filter: ["==", ["get", "kind"], "WATER"],
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match", ["get", "status"],
              "ACTIVE", "#0891b2",
              "BROKEN", "#dc2626",
              "TEMPORARILY_CLOSED", "#d97706",
              "#94a3b8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "waste-points",
          type: "circle",
          source: "service-points",
          filter: ["==", ["get", "kind"], "WASTE"],
          paint: {
            "circle-radius": 7,
            "circle-color": [
              "match", ["get", "status"],
              "ACTIVE", "#65a30d",
              "BROKEN", "#dc2626",
              "TEMPORARILY_CLOSED", "#d97706",
              "#94a3b8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "service-points-requires-verification",
          type: "circle",
          source: "service-points",
          filter: ["==", ["get", "verificationStatus"], "REQUIRES_REVIEW"],
          paint: { "circle-radius": 13, "circle-color": "transparent", "circle-stroke-width": 2, "circle-stroke-color": "#f59e0b" },
        });

        for (const layerId of ["water-points", "waste-points"]) {
          map.on("click", layerId, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            setSelectedStreet(null);
            setSelectedZone(null);
            setSelectedPoint(f.properties as unknown as ServicePointProps);
          });
          map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
        }

        setLoaded(true);
        // A genuinely empty database (no zones, no streets imported yet)
        // must say so, not show a bare basemap with a populated-looking
        // control panel that could be mistaken for a load failure.
        setIsEmpty((zonesRes.features?.length ?? 0) === 0 && (streetsRes.features?.length ?? 0) === 0);
      } catch (err) {
        console.error("AdminMap load failed:", err);
        setLoadError("טעינת שכבות המפה נכשלה. רעננו את הדף או בדקו את החיבור לשרת.");
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const vis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    vis("zones-fill", layers.zones);
    vis("zones-line-halo", layers.zones);
    vis("zones-line", layers.zones);
    vis("zones-label", layers.zones);
    vis("streets-line", layers.streets);
    vis("paths-line", layers.paths);
    vis("segments-line", layers.segments);
    vis("segments-unassigned", layers.unassigned);
    vis("segments-crossing", layers.crossing);
    vis("task-done", layers.taskDone);
    vis("task-pending", layers.taskPending);
    vis("task-not-done", layers.taskNotDone);
    vis("water-points", layers.waterPoints);
    vis("waste-points", layers.wastePoints);
    vis("service-points-requires-verification", layers.requiresVerification && (layers.waterPoints || layers.wastePoints));
  }, [layers, loaded]);

  // Colour streets by dirt score instead of priority.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer("streets-line")) return;
    const dirtColorExpr = [
      "case",
      ["==", ["get", "dirtScore"], null], "#94a3b8",
      ["interpolate", ["linear"], ["get", "dirtScore"], 0, "#16a34a", 40, "#f59e0b", 70, "#dc2626", 100, "#7f1d1d"],
    ] as unknown as string;
    const priorityColorExpr = [
      "match", ["get", "priority"],
      "CRITICAL", "#dc2626", "HIGH", "#f59e0b", "NORMAL", "#3b82f6", "LOW", "#64748b", "#3b82f6",
    ] as unknown as string;
    const expr = colorByDirt ? dirtColorExpr : priorityColorExpr;
    map.setPaintProperty("streets-line", "line-color", expr);
    if (map.getLayer("paths-line")) map.setPaintProperty("paths-line", "line-color", expr);
  }, [colorByDirt, loaded]);

  // Colour zones by zone identity or by which contractor holds them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.getLayer("zones-fill")) return;
    const fill = colorByContract
      ? ([
          "match",
          ["coalesce", ["get", "contractAreaNumber"], -1],
          1, CONTRACT_AREA_COLORS[1],
          2, CONTRACT_AREA_COLORS[2],
          UNASSIGNED_COLOR,
        ] as unknown as string)
      : (["get", "color"] as unknown as string);
    map.setPaintProperty("zones-fill", "fill-color", fill);
    map.setPaintProperty("zones-line", "line-color", fill);
  }, [colorByContract, loaded]);

  const searchResults = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) return [];
    return streetIndex.filter((s) => s.name.includes(q)).slice(0, 8);
  }, [search, streetIndex]);

  function flyToStreet(s: { id: string; center: [number, number] }) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: s.center, zoom: 16.5 });
    setSearch("");
  }

  function toggle(key: LayerKey) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const freq = selectedStreet?.cleaningFrequency as { type: string } | null;

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="h-full w-full" />

      {!loaded && !loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
          <div className="rounded-lg border border-panel-border bg-panel px-4 py-2 text-sm">טוען שכבות מפה…</div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-x-0 top-0 z-20 m-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {loadError}
        </div>
      )}

      {loaded && isEmpty && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90">
          <div className="max-w-sm rounded-xl border border-panel-border bg-panel p-6 text-center shadow-lg">
            <div className="mb-2 text-lg font-bold">אין עדיין נתונים להצגה</div>
            <p className="mb-4 text-sm text-muted">
              לא הוגדרו אזורים ולא יובאו רחובות למערכת. זו מפה ריקה, לא תקלת טעינה — יש להתחיל מיצירת אזורי הניקיון ולאחר מכן לייבא את הרחובות.
            </p>
            <div className="flex flex-col gap-2">
              <a href="/zones" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
                יצירת אזורים ←
              </a>
              <a href="/streets" className="rounded-md border border-panel-border px-4 py-2 text-sm">
                ייבוא רחובות ←
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="no-print absolute right-4 top-4 z-10 max-h-[calc(100%-2rem)] w-72 overflow-auto rounded-xl border border-panel-border bg-panel/95 p-3 shadow-lg backdrop-blur">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש רחוב…"
          className="mb-3 w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        {searchResults.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-md border border-panel-border">
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => flyToStreet(s)}
                className="block w-full px-2 py-1.5 text-start text-sm hover:bg-accent/10"
              >
                <div>{s.name}</div>
                <div className="text-xs text-muted">{s.zoneName ?? "ללא אזור"}</div>
              </button>
            ))}
          </div>
        )}

        <label className="mb-1.5 flex cursor-pointer items-center gap-2 rounded-md border border-panel-border px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={colorByContract}
            onChange={() => setColorByContract((v) => !v)}
          />
          צביעה לפי אזור מכרז
        </label>
        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-panel-border px-2 py-1.5 text-sm">
          <input type="checkbox" checked={colorByDirt} onChange={() => setColorByDirt((v) => !v)} />
          צביעת רחובות לפי ציון עדיפות ניקיון
        </label>

        <div className="mb-2 text-xs font-semibold text-muted">שכבות</div>
        <div className="space-y-1.5 text-sm">
          {LAYER_LABELS.map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-3 border-t border-panel-border pt-2">
          <div className="mb-1.5 text-xs font-semibold text-muted">מקרא</div>
          <div className="space-y-1 text-xs">
            {colorByContract ? (
              <>
                <LegendRow color={CONTRACT_AREA_COLORS[1]} label="אזור מכרז 1" />
                <LegendRow color={CONTRACT_AREA_COLORS[2]} label="אזור מכרז 2" />
                <LegendRow color={UNASSIGNED_COLOR} label="טרם שויך לקבלן" />
              </>
            ) : colorByDirt ? (
              <>
                <LegendRow color="#16a34a" label="ציון נמוך (נקי)" />
                <LegendRow color="#f59e0b" label="ציון בינוני" />
                <LegendRow color="#dc2626" label="ציון גבוה (מלוכלך)" />
                <LegendRow color="#94a3b8" label="אין ציון (טרם נסקר)" />
              </>
            ) : (
              <>
                <LegendRow color="#dc2626" label="עדיפות קריטית" />
                <LegendRow color="#f59e0b" label="עדיפות גבוהה" />
                <LegendRow color="#3b82f6" label="עדיפות רגילה" />
              </>
            )}
            <LegendRow color="#16a34a" label="בוצע היום" />
            <LegendRow color="#dc2626" label="לא בוצע / בעיה" dashed />
            <LegendRow color="#7c3aed" label="חוצה אזורים" />
            <LegendRow color="#0891b2" label="נקודת מים" />
            <LegendRow color="#65a30d" label="נקודת פריקה" />
          </div>
        </div>

        {zonesWithoutBoundary.length > 0 && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            <div className="font-semibold text-warning">
              {zonesWithoutBoundary.length} אזורים אינם מוצגים
            </div>
            <div className="mt-0.5">
              טרם הוגדר להם גבול גיאוגרפי: {zonesWithoutBoundary.join(", ")}.
            </div>
            <a href="/zones" className="mt-1 block text-accent hover:underline">
              הגדרת גבולות ←
            </a>
          </div>
        )}
      </div>

      {/* Street detail */}
      {selectedStreet && (
        <div className="no-print absolute left-4 top-4 z-10 w-72 rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-start justify-between">
            <div className="font-bold">{selectedStreet.name}</div>
            <button onClick={() => setSelectedStreet(null)} className="text-muted" aria-label="סגור">✕</button>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="סוג" value={TYPE_LABEL[selectedStreet.type] ?? selectedStreet.type} />
            <Row label="אזור" value={selectedStreet.zoneName ?? "ללא"} />
            <Row label="אורך" value={selectedStreet.lengthM ? `${Math.round(selectedStreet.lengthM)} מ׳` : "—"} />
            <Row label="עדיפות" value={PRIORITY_LABEL[selectedStreet.priority] ?? selectedStreet.priority} />
            <Row label="תדירות" value={freq ? (FREQ_LABEL[freq.type] ?? freq.type) : "—"} />
            <Row
              label="זמן ניקיון משוער"
              value={selectedStreet.estimatedCleanMinutes ? `${selectedStreet.estimatedCleanMinutes} דק׳` : "—"}
            />
            <Row label="ציון עדיפות ניקיון" value={selectedStreet.dirtScore !== null ? Math.round(selectedStreet.dirtScore) : "טרם נסקר"} warn={selectedStreet.dirtScore !== null && selectedStreet.dirtScore >= 70} />
            {selectedStreet.dataMode && <Row label="מצב נתונים" value={DATA_MODE_LABEL[selectedStreet.dataMode] ?? selectedStreet.dataMode} />}
            {selectedStreet.confidence && <Row label="רמת ביטחון" value={selectedStreet.confidence === "HIGH" ? "גבוהה" : selectedStreet.confidence === "MEDIUM" ? "בינונית" : "נמוכה"} />}
          </div>
          {selectedStreet.accessIssue && (
            <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">בעיית גישה ידועה</div>
          )}
          {selectedStreet.isDemo && (
            <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">נתון DEMO</div>
          )}
          {selectedStreet.notes && <div className="pt-1 text-xs text-muted">{selectedStreet.notes}</div>}
          <a href="/streets" className="mt-3 block text-xs text-accent hover:underline">
            עריכה במסך רחובות ושבילים ←
          </a>
        </div>
      )}

      {/* Service point detail */}
      {selectedPoint && (
        <div className="no-print absolute left-4 top-4 z-10 w-72 rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-start justify-between">
            <div className="font-bold">{selectedPoint.kind === "WATER" ? "💧" : "🗑️"} {selectedPoint.name}</div>
            <button onClick={() => setSelectedPoint(null)} className="text-muted" aria-label="סגור">✕</button>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="סטטוס" value={SERVICE_STATUS_LABEL[selectedPoint.status] ?? selectedPoint.status} warn={selectedPoint.status !== "ACTIVE"} />
            {selectedPoint.kind === "WATER" && (
              <>
                <Row label="קצב מילוי" value={selectedPoint.flowLitersPerMin ? `${selectedPoint.flowLitersPerMin} ל'/דק'` : "—"} />
                <Row label="זמן מילוי" value={selectedPoint.avgFillMinutes ? `${selectedPoint.avgFillMinutes} דק'` : "—"} />
                <Row label="המתנה ממוצעת" value={selectedPoint.avgWaitMinutes ? `${selectedPoint.avgWaitMinutes} דק'` : "—"} />
              </>
            )}
          </div>
          {selectedPoint.isDemo && (
            <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">נתון DEMO</div>
          )}
          <a href="/service-points" className="mt-3 block text-xs text-accent hover:underline">
            עריכה במסך נקודות מים ופריקה ←
          </a>
        </div>
      )}

      {/* Zone detail */}
      {(selectedZone || zoneLoading) && (
        <div className="no-print absolute left-4 top-4 z-10 max-h-[calc(100%-2rem)] w-80 overflow-auto rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur">
          {zoneLoading && <div className="text-sm text-muted">טוען פרטי אזור…</div>}
          {selectedZone && (
            <>
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: selectedZone.color }} />
                  <span className="font-bold">{selectedZone.name}</span>
                  <span className="text-xs text-muted">{selectedZone.code}</span>
                </div>
                <button onClick={() => setSelectedZone(null)} className="text-muted" aria-label="סגור">✕</button>
              </div>

              {selectedZone.contractArea ? (
                <div className="mb-3 rounded-lg border border-panel-border p-2 text-sm">
                  <div className="font-medium">{selectedZone.contractArea.name}</div>
                  <div className="text-muted">{selectedZone.contractArea.contractorName ?? "ללא קבלן"}</div>
                  <div className="mt-1 text-xs text-success">שיוך מאומת</div>
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                  <div className="font-semibold text-warning">הקבלן האחראי טרם נקבע</div>
                  <div className="mt-0.5">
                    מסמכי המכרז אינם מגדירים אילו אזורים שייכים לכל קבלן.
                  </div>
                  <a href="/sources" className="mt-1 block text-accent hover:underline">
                    קביעת שיוך ←
                  </a>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <Row label="רחובות" value={selectedZone.streetsCount} />
                <Row label="שבילים ומדרחובים" value={selectedZone.pathsCount} />
                <Row label="שטחים ציבוריים" value={selectedZone.publicAreaCount} />
                <Row label="מקטעים" value={selectedZone.segmentCount} />
                <Row label='סה״כ ק״מ' value={selectedZone.totalKm.toFixed(1)} />
                <Row label="משאבים מורשים" value={selectedZone.activeResources} />
                {selectedZone.segmentsRequiringReview > 0 && (
                  <Row label="מקטעים לבדיקה" value={selectedZone.segmentsRequiringReview} warn />
                )}
              </div>

              <div className="mt-3 border-t border-panel-border pt-2">
                <div className="mb-1 text-xs font-semibold text-muted">תוכנית העבודה להיום</div>
                {selectedZone.todayPlan ? (
                  <div className="space-y-1 text-sm">
                    <Row label="משימות" value={selectedZone.todayPlan.total} />
                    <Row label="הושלמו" value={selectedZone.todayPlan.done} />
                    <Row label="לא בוצעו" value={selectedZone.todayPlan.notDone} />
                    <Row label="אחוז ביצוע" value={selectedZone.completionPercent !== null ? `${selectedZone.completionPercent}%` : "—"} />
                  </div>
                ) : (
                  <div className="text-xs text-muted">לא נוצרה תוכנית עבודה להיום.</div>
                )}
              </div>

              {selectedZone.contractQuotas.length > 0 && (
                <div className="mt-3 border-t border-panel-border pt-2">
                  <div className="mb-1 text-xs font-semibold text-muted">משאבים חוזיים באזור המכרז</div>
                  <div className="space-y-1 text-xs">
                    {selectedZone.contractQuotas.map((q) => (
                      <div key={q.lineNumber} className="flex items-baseline justify-between gap-2">
                        <span className="truncate" title={q.resourceName}>{q.resourceName}</span>
                        <span className="shrink-0 tabular-nums">
                          {q.quantity}
                          {q.tenderQuantity !== null && q.tenderQuantity !== q.quantity && (
                            <span className="text-warning" title={`במכרז העירוני: ${q.tenderQuantity}`}>
                              {" "}≠{q.tenderQuantity}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    הכמות היא של אזור המכרז כולו, לא של אזור תפעולי בודד.
                  </p>
                </div>
              )}

              <div className="mt-3 text-xs text-muted">
                עודכן: {new Date(selectedZone.updatedAt).toLocaleString("he-IL")}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${warn ? "text-warning" : ""}`}>{value}</span>
    </div>
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-0.5 w-5 shrink-0"
        style={{
          background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
