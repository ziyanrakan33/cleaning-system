"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Map as MapLibreMap, NavigationControl, Marker, Popup, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  type LonLat,
  findSelfIntersections,
  validatePolygonPoints,
  closeRing,
  uncloseRing,
  isDuplicateConsecutive,
} from "@/lib/geo-utils";

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

  // Core state
  const [points, setPoints] = useState<LonLat[]>([]);
  const [savedPoints, setSavedPoints] = useState<LonLat[]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [cursorPos, setCursorPos] = useState<LonLat | null>(null);
  const [hoveringFirstPoint, setHoveringFirstPoint] = useState(false);
  const [intersectingSegments, setIntersectingSegments] = useState<[LonLat, LonLat][]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Refs for event callbacks to access latest state without re-binding
  const pointsRef = useRef<LonLat[]>([]);
  const savedPointsRef = useRef<LonLat[]>([]);
  const isClosedRef = useRef<boolean>(false);
  const hoveringFirstPointRef = useRef<boolean>(false);
  const markersRef = useRef<Marker[]>([]);
  const midpointsRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    savedPointsRef.current = savedPoints;
  }, [savedPoints]);

  useEffect(() => {
    isClosedRef.current = isClosed;
  }, [isClosed]);

  useEffect(() => {
    hoveringFirstPointRef.current = hoveringFirstPoint;
  }, [hoveringFirstPoint]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasChanges = JSON.stringify(points) !== JSON.stringify(savedPoints);
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [points, savedPoints]);

  // Refresh MapLibre sources for lines, fills, preview, and warning highlights
  const refreshDrawSources = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPts = pointsRef.current;
    const closed = isClosedRef.current;

    // 1. Draw Fill Layer (ONLY rendered when closed!)
    const fillFeatures: GeoJSON.Feature[] =
      closed && currentPts.length >= 3
        ? [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [closeRing(currentPts)],
              },
              properties: {},
            },
          ]
        : [];
    (map.getSource("draw-fill") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: fillFeatures,
    });

    // 2. Draw Line Layer (LineString connecting points in order)
    const lineCoords = closed && currentPts.length >= 3 ? closeRing(currentPts) : currentPts;
    const lineFeatures: GeoJSON.Feature[] =
      lineCoords.length >= 2
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: lineCoords },
              properties: {},
            },
          ]
        : [];
    (map.getSource("draw-line") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: lineFeatures,
    });

    // 3. Draw Preview Line (From last point to cursor or first point when drawing)
    let previewFeatures: GeoJSON.Feature[] = [];
    if (!closed && currentPts.length >= 1 && cursorPos) {
      const lastPt = currentPts[currentPts.length - 1];
      const targetPt = hoveringFirstPointRef.current ? currentPts[0] : cursorPos;
      previewFeatures = [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [lastPt, targetPt] },
          properties: {},
        },
      ];
    }
    (map.getSource("draw-preview") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: previewFeatures,
    });

    // 4. Draw Intersecting Segments Warning Layer (Red lines)
    const intersectFeatures: GeoJSON.Feature[] = intersectingSegments.map((seg) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: seg },
      properties: {},
    }));
    (map.getSource("draw-intersect") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: intersectFeatures,
    });
  }, [cursorPos, intersectingSegments]);

  // Update HTML vertex markers on map
  const refreshMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    midpointsRef.current.forEach((m) => m.remove());
    midpointsRef.current = [];

    const currentPts = pointsRef.current;
    const closed = isClosedRef.current;
    const mainColor = zoneColor || "#e11d48";

    // Create vertex markers
    currentPts.forEach((pt, index) => {
      const isFirst = index === 0;
      const isLast = index === currentPts.length - 1;
      const isHovered = isFirst && hoveringFirstPoint;

      const el = document.createElement("div");
      el.className = "flex items-center justify-center cursor-pointer transition-transform duration-150";

      let bgColor = mainColor;
      let size = 18;
      let borderWidth = 2;
      const labelText = `${index + 1}`;

      if (isHovered) {
        bgColor = "#10b981"; // Bright emerald green on hover
        size = 28;
        borderWidth = 3;
      } else if (isFirst) {
        bgColor = "#059669"; // Emerald green for first point
        size = 24;
        borderWidth = 3;
      } else if (isLast && !closed) {
        bgColor = "#f43f5e"; // Bright rose for last active point
        size = 20;
        borderWidth = 2;
      }

      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.borderRadius = "50%";
      el.style.backgroundColor = bgColor;
      el.style.border = `${borderWidth}px solid #ffffff`;
      el.style.boxShadow = isHovered
        ? "0 0 0 4px rgba(16, 185, 129, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.2)"
        : "0 2px 4px rgba(0,0,0,0.3)";

      el.title = isFirst
        ? currentPts.length >= 3 && !closed
          ? "נקודה ראשונה - לחץ לסגירת האזור"
          : "נקודה ראשונה"
        : `נקודה ${index + 1}`;

      const textSpan = document.createElement("span");
      textSpan.className = "text-[10px] font-bold text-white leading-none select-none";
      textSpan.innerText = labelText;
      el.appendChild(textSpan);

      // Marker is draggable when polygon is closed / editing mode
      const marker = new Marker({ element: el, draggable: closed || isEditing })
        .setLngLat(pt)
        .addTo(map);

      if (closed || isEditing) {
        marker.on("drag", () => {
          const newLngLat = marker.getLngLat();
          const newPt: LonLat = [newLngLat.lng, newLngLat.lat];
          const updated = [...pointsRef.current];
          updated[index] = newPt;

          // Validate self-intersection during drag
          const check = findSelfIntersections(updated);
          if (check.hasIntersection) {
            setIntersectingSegments(check.intersectingSegments);
            setError("הזזת הנקודה גורמת להצטלבות עצמית");
          } else {
            setIntersectingSegments([]);
            setError(null);
          }
          setPoints(updated);
          setSaved(false);
          refreshDrawSources();
        });

        marker.on("dragend", () => {
          const newLngLat = marker.getLngLat();
          const newPt: LonLat = [newLngLat.lng, newLngLat.lat];
          const updated = [...pointsRef.current];
          updated[index] = newPt;

          const check = findSelfIntersections(updated);
          if (check.hasIntersection) {
            setError("הזזת הנקודה גורמת להצטלבות עצמית - הנקודה הוחזרה למקומה");
            // Revert marker position
            marker.setLngLat(pt);
          } else {
            setPoints(updated);
            setSaved(false);
            setError(null);
            setIntersectingSegments([]);
          }
        });
      }

      markersRef.current.push(marker);
    });

    // Create midpoint insertion handles if closed / editing
    if (closed && currentPts.length >= 3) {
      for (let i = 0; i < currentPts.length; i++) {
        const p1 = currentPts[i];
        const p2 = currentPts[(i + 1) % currentPts.length];
        const mid: LonLat = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

        const midEl = document.createElement("div");
        midEl.className =
          "flex items-center justify-center w-3 h-3 rounded-full bg-white border-2 border-rose-500 cursor-pointer hover:scale-150 transition-transform shadow";
        midEl.title = "לחץ להוספת נקודה באמצע הקטע";

        const midMarker = new Marker({ element: midEl })
          .setLngLat(mid)
          .addTo(map);

        const insertIndex = i + 1;
        midEl.addEventListener("click", (e) => {
          e.stopPropagation();
          const updated = [
            ...currentPts.slice(0, insertIndex),
            mid,
            ...currentPts.slice(insertIndex),
          ];
          const check = findSelfIntersections(updated);
          if (check.hasIntersection) {
            setError("הוספת הנקודה גורמת להצטלבות עצמית");
            setIntersectingSegments(check.intersectingSegments);
          } else {
            setPoints(updated);
            setSaved(false);
            setError(null);
            setIntersectingSegments([]);
          }
        });

        midpointsRef.current.push(midMarker);
      }
    }
  }, [zoneColor, hoveringFirstPoint, isEditing, refreshDrawSources]);

  // Sync sources & markers when state changes
  useEffect(() => {
    refreshDrawSources();
    refreshMarkers();
  }, [points, isClosed, cursorPos, hoveringFirstPoint, intersectingSegments, refreshDrawSources, refreshMarkers]);

  // Map initialization & event binding
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

      // Add background reference streets
      map.addSource("streets", { type: "geojson", data: streetsRes });
      map.addLayer({
        id: "streets-ref",
        type: "line",
        source: "streets",
        paint: { "line-color": "#94a3b8", "line-width": 1, "line-opacity": 0.6 },
      });

      // Add other zones context
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

      // Load existing geometry for this zone if available
      const thisZoneFeature = (zonesRes.features as GeoJSON.Feature[]).find(
        (f) => f.properties?.id === zoneId
      );
      if (thisZoneFeature && thisZoneFeature.geometry.type === "Polygon") {
        const ring = thisZoneFeature.geometry.coordinates[0] as LonLat[];
        const unclosed = uncloseRing(ring);
        setPoints(unclosed);
        setSavedPoints(unclosed);
        setIsClosed(true);
        setIsEditing(true);
      }

      // Add Drawing Layers
      map.addSource("draw-fill", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-fill-layer",
        type: "fill",
        source: "draw-fill",
        paint: { "fill-color": zoneColor || "#e11d48", "fill-opacity": 0.25 },
      });

      map.addSource("draw-line", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-line-halo-layer",
        type: "line",
        source: "draw-line",
        paint: { "line-color": "#ffffff", "line-width": 7 },
      });
      map.addLayer({
        id: "draw-line-layer",
        type: "line",
        source: "draw-line",
        paint: { "line-color": zoneColor || "#e11d48", "line-width": 3.5 },
      });

      map.addSource("draw-preview", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-preview-layer",
        type: "line",
        source: "draw-preview",
        paint: {
          "line-color": "#fb7185",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource("draw-intersect", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-intersect-layer",
        type: "line",
        source: "draw-intersect",
        paint: { "line-color": "#ef4444", "line-width": 5 },
      });

      // Track mouse movement for preview line and first-point hit testing
      map.on("mousemove", (e) => {
        const cursor: LonLat = [e.lngLat.lng, e.lngLat.lat];
        setCursorPos(cursor);

        const currentPts = pointsRef.current;
        const closed = isClosedRef.current;

        if (!closed && currentPts.length >= 3) {
          const p0 = currentPts[0];
          const px0 = map.project(p0);
          const distPx = Math.hypot(e.point.x - px0.x, e.point.y - px0.y);
          const isNearFirst = distPx <= 22; // 22px comfortable hit radius

          setHoveringFirstPoint(isNearFirst);

          if (isNearFirst) {
            if (!popupRef.current) {
              popupRef.current = new Popup({
                closeButton: false,
                closeOnClick: false,
                offset: 15,
                className: "text-xs font-semibold text-emerald-400",
              })
                .setLngLat(p0)
                .setHTML("<strong>לחץ לסגירת האזור</strong>")
                .addTo(map);
            }
          } else {
            if (popupRef.current) {
              popupRef.current.remove();
              popupRef.current = null;
            }
          }
        } else {
          setHoveringFirstPoint(false);
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
        }
      });

      // Handle Map Click to Add Point or Close Shape
      map.on("click", (e) => {
        const clickPt: LonLat = [e.lngLat.lng, e.lngLat.lat];
        const currentPts = pointsRef.current;
        const closed = isClosedRef.current;

        if (closed) {
          return; // Shape is closed; click handles or midpoints to edit
        }

        // Case 1: Clicked near first point to close shape
        if (hoveringFirstPointRef.current && currentPts.length >= 3) {
          const closingCheck = findSelfIntersections(currentPts, null, true);
          if (closingCheck.hasIntersection) {
            setError("לא ניתן לסגור את הגבול מכיוון שהגבול חוצה את עצמו");
            setIntersectingSegments(closingCheck.intersectingSegments);
            return;
          }
          setIsClosed(true);
          setIsEditing(true);
          setError(null);
          setSaved(false);
          setIntersectingSegments([]);
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
          return;
        }

        // Case 2: Ignore duplicate fast clicks
        if (isDuplicateConsecutive(currentPts, clickPt)) {
          return;
        }

        // Case 3: Check self-intersection before adding new point
        const check = findSelfIntersections(currentPts, clickPt);
        if (check.hasIntersection) {
          setError("לא ניתן להוסיף את הנקודה מכיוון שהגבול חוצה את עצמו");
          setIntersectingSegments(check.intersectingSegments);
          return;
        }

        // Case 4: Add valid point
        const updated = [...currentPts, clickPt];
        setPoints(updated);
        setSaved(false);
        setError(null);
        setIntersectingSegments([]);
      });
    });

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Action Button Handlers
  function undoLast() {
    if (points.length === 0) return;
    const updated = points.slice(0, -1);
    setPoints(updated);
    setIsClosed(false);
    setSaved(false);
    setError(null);
    setIntersectingSegments([]);
  }

  function clearAll() {
    if (points.length === 0) return;
    if (window.confirm("האם אתה בטוח שברצונך למחוק את כל הנקודות של הציור הנוכחי?")) {
      setPoints([]);
      setIsClosed(false);
      setSaved(false);
      setError(null);
      setIntersectingSegments([]);
    }
  }

  function cancelDrawing() {
    setPoints(savedPoints);
    setIsClosed(savedPoints.length >= 3);
    setSaved(false);
    setError(null);
    setIntersectingSegments([]);
  }

  async function handleCloseAndSave() {
    if (points.length < 3) {
      setError("נדרשות לפחות 3 נקודות לסגירת האזור");
      return;
    }

    // Check closing segment self-intersection if not yet closed
    if (!isClosed) {
      const closingCheck = findSelfIntersections(points, null, true);
      if (closingCheck.hasIntersection) {
        setError("לא ניתן לסגור את הגבול מכיוון שהגבול חוצה את עצמו");
        setIntersectingSegments(closingCheck.intersectingSegments);
        return;
      }
    }

    // Validate polygon points
    const validation = validatePolygonPoints(points);
    if (!validation.valid) {
      setError(validation.error || "הגבול שצוין אינו תקין");
      return;
    }

    const closedRing = closeRing(points);
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/zones/${zoneId}/geometry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ring: closedRing }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "שמירת הגבול נכשלה");
      }

      setSaved(true);
      setIsClosed(true);
      setIsEditing(true);

      // Reload saved boundary from server to verify exact DB representation
      const zonesRes = await fetch("/api/geo/zones").then((r) => r.json());
      const thisZoneFeature = (zonesRes.features as GeoJSON.Feature[]).find(
        (f) => f.properties?.id === zoneId
      );
      if (thisZoneFeature && thisZoneFeature.geometry.type === "Polygon") {
        const ring = thisZoneFeature.geometry.coordinates[0] as LonLat[];
        const unclosed = uncloseRing(ring);
        setPoints(unclosed);
        setSavedPoints(unclosed);
      }

      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const instructionMessage =
    points.length < 3
      ? "לחץ על המפה כדי להוסיף נקודות לאורך גבול האזור"
      : !isClosed
      ? "לחץ על הנקודה הראשונה או על 'סגור ושמור גבול'"
      : "הגבול סגור. ניתן לגרור נקודות לעריכה או ללחוץ על מרכז קטע להוספת נקודה";

  return (
    <div className="relative flex-1" dir="rtl">
      <div ref={containerRef} className="h-full w-full" />

      {/* Control Panel */}
      <div className="no-print absolute right-4 top-4 z-10 w-80 rounded-xl border border-panel-border bg-panel/95 p-4 shadow-lg backdrop-blur text-right">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full shadow-sm" style={{ background: zoneColor || "#e11d48" }} />
            <span className="font-bold text-base">{zoneName}</span>
          </div>
          {isClosed ? (
            <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 font-semibold">
              גבול סגור
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 font-semibold">
              גבול פתוח
            </span>
          )}
        </div>

        <p className="mb-3 text-xs text-muted leading-relaxed">
          {instructionMessage}
        </p>

        <div className="mb-3 flex items-center justify-between text-sm border-t border-b border-panel-border py-2">
          <span>מספר נקודות שסומנו:</span>
          <span className="font-bold text-base tabular-nums text-accent">{points.length}</span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={undoLast}
            disabled={points.length === 0 || saving}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm font-medium hover:bg-panel-border/30 disabled:opacity-40 transition-colors"
          >
            בטל נקודה אחרונה
          </button>
          <button
            onClick={clearAll}
            disabled={points.length === 0 || saving}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm font-medium hover:bg-panel-border/30 disabled:opacity-40 transition-colors"
          >
            נקה הכל
          </button>
          <button
            onClick={cancelDrawing}
            disabled={saving || (points.length === 0 && savedPoints.length === 0)}
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm font-medium hover:bg-panel-border/30 disabled:opacity-40 transition-colors"
          >
            בטל ציור
          </button>
          <button
            onClick={handleCloseAndSave}
            disabled={points.length < 3 || saving}
            className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity mt-1"
          >
            {saving ? "שומר גבול..." : "סגור ושמור גבול"}
          </button>
        </div>

        {saved && (
          <div className="mt-3 rounded-md bg-emerald-500/10 p-2 text-xs font-semibold text-emerald-400 border border-emerald-500/20 text-center">
            הגבול נשמר בהצלחה!
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md bg-rose-500/10 p-2 text-xs font-semibold text-rose-400 border border-rose-500/20 text-center">
            {error}
          </div>
        )}
        <a href="/zones" className="mt-3 block text-center text-xs text-accent hover:underline">
          חזרה לרשימת האזורים
        </a>
      </div>
    </div>
  );
}
