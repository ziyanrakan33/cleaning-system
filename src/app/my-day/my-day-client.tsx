"use client";

import { useEffect, useState } from "react";
import { drainQueue, queueLength, sendOrQueue } from "./offlineQueue";

type Task = {
  id: string;
  resourceId: string;
  resourceLabel: string;
  sequenceOrder: number;
  streetId: string;
  streetName: string;
  lat: number | null;
  lon: number | null;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  employeeComment: string | null;
  hasFieldReport: boolean;
};

type Resource = { id: string; identifier: string; resourceType: { name: string } };
type ShiftReport = { resourceId: string; id: string };
type ServicePoint = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "ממתין",
  IN_PROGRESS: "בביצוע",
  DONE: "בוצע",
  NOT_DONE: "לא בוצע",
  PROBLEM: "בעיה",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "border-panel-border text-muted",
  IN_PROGRESS: "border-accent text-accent",
  DONE: "border-success text-success",
  NOT_DONE: "border-danger text-danger",
  PROBLEM: "border-warning text-warning",
};

function fmtTime(iso: string) {
  return new Date(iso).toTimeString().slice(0, 5);
}

// ---------------------------------------------------------------------------
// §7 — shift opening
// ---------------------------------------------------------------------------

function ShiftOpenForm({ resource, onDone }: { resource: Resource; onDone: () => void }) {
  const [waterStartPercent, setWaterStartPercent] = useState(100);
  const [wasteTankState, setWasteTankState] = useState("ריק");
  const [vehicleCondition, setVehicleCondition] = useState("תקין");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      let coords: { lat: number | null; lon: number | null } = { lat: null, lon: null };
      if (navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve({ lat: null, lon: null }),
            { timeout: 3000 }
          );
        });
      }
      // Idempotency comes for free here: shift_reports has a unique
      // (resourceId, date) constraint and the route upserts on it, so a
      // queued retry landing twice is harmless.
      await sendOrQueue(`shift-${resource.id}-${new Date().toDateString()}`, "/api/shift-reports", "POST", {
        resourceId: resource.id,
        waterStartPercent,
        wasteTankState,
        vehicleCondition,
        notes: notes || undefined,
        ...coords,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3 rounded-xl border-2 border-accent bg-accent/5 p-4">
      <div className="mb-3 font-bold">פתיחת משמרת — {resource.resourceType.name} {resource.identifier}</div>

      <label className="mb-1 block text-sm font-medium">כמות מים בתחילת המשמרת</label>
      <input
        type="range"
        min={0}
        max={100}
        value={waterStartPercent}
        onChange={(e) => setWaterStartPercent(Number(e.target.value))}
        className="w-full"
      />
      <div className="mb-3 text-center text-2xl font-bold text-accent" dir="ltr">{waterStartPercent}%</div>

      <label className="mb-1 block text-sm font-medium">מצב מיכל פסולת</label>
      <div className="mb-3 flex gap-2">
        {["ריק", "חלקי", "מלא"].map((v) => (
          <button
            key={v}
            onClick={() => setWasteTankState(v)}
            className={`flex-1 rounded-lg border-2 py-2 text-sm ${
              wasteTankState === v ? "border-accent bg-accent text-accent-foreground" : "border-panel-border"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-sm font-medium">תקינות הכלי</label>
      <div className="mb-3 flex gap-2">
        {["תקין", "תקלה קלה", "תקלה"].map((v) => (
          <button
            key={v}
            onClick={() => setVehicleCondition(v)}
            className={`flex-1 rounded-lg border-2 py-2 text-sm ${
              vehicleCondition === v ? "border-accent bg-accent text-accent-foreground" : "border-panel-border"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="הערות (אופציונלי)"
        className="mb-3 w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 text-sm outline-none"
      />

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-xl bg-accent py-3 text-base font-bold text-accent-foreground disabled:opacity-50"
      >
        {saving ? "שומר..." : "פתח משמרת"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §8 — end-of-street execution report
// ---------------------------------------------------------------------------

const NON_COMPLETION_REASON_LABEL: Record<string, string> = {
  BLOCKED: "חסימה",
  WATER_SHORTAGE: "מחסור במים",
  ACCESS_ISSUE: "בעיית גישה",
  VEHICLE_UNSUITABLE: "כלי לא מתאים",
  DEFECT: "ליקוי בשטח",
  OTHER: "אחר",
};

function FieldReportSheet({
  task,
  status,
  canCreateDefect,
  onClose,
  onSaved,
}: {
  task: Task;
  status: string;
  canCreateDefect: boolean;
  onClose: () => void;
  onSaved: (comment?: string) => void;
}) {
  const [waterPoints, setWaterPoints] = useState<ServicePoint[]>([]);
  const [wastePoints, setWastePoints] = useState<ServicePoint[]>([]);
  const [dirtBefore, setDirtBefore] = useState(3);
  const [cleanAfter, setCleanAfter] = useState(4);
  const [refillNeeded, setRefillNeeded] = useState(false);
  const [waterRefillPointId, setWaterRefillPointId] = useState("");
  const [wasteDumpNeeded, setWasteDumpNeeded] = useState(false);
  const [wasteDisposalPointId, setWasteDisposalPointId] = useState("");
  const [accessProblem, setAccessProblem] = useState(status === "PROBLEM");
  const [parkedVehicles, setParkedVehicles] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [vehicleSuitable, setVehicleSuitable] = useState(status !== "PROBLEM");
  const [needsRevisit, setNeedsRevisit] = useState(status === "NOT_DONE");
  const [comment, setComment] = useState("");
  const [photoBefore, setPhotoBefore] = useState<File | null>(null);
  const [photoAfter, setPhotoAfter] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const needsReason = status === "NOT_DONE" || status === "PROBLEM";
  const [nonCompletionReason, setNonCompletionReason] = useState<string>(status === "PROBLEM" ? "ACCESS_ISSUE" : "OTHER");
  const [defectId, setDefectId] = useState<string | null>(null);
  const [raisingDefect, setRaisingDefect] = useState(false);
  // One id per sheet-open, not per click — a retried submit (flaky field
  // connection) must reuse the same key so the server treats it as the same
  // attempt instead of a duplicate report and a second EWMA update.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function raiseDefect() {
    setRaisingDefect(true);
    try {
      const res = await fetch("/api/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streetId: task.streetId,
          title: `ליקוי שדווח מ-/my-day: ${task.streetName}`,
          origin: "CONTRACTOR",
        }),
      });
      const body = await res.json();
      if (res.ok && body.id) {
        setDefectId(body.id);
        setNonCompletionReason("DEFECT");
      }
    } finally {
      setRaisingDefect(false);
    }
  }

  useEffect(() => {
    fetch("/api/service-points")
      .then((r) => r.json())
      .then((d) => {
        setWaterPoints(d.water ?? []);
        setWastePoints(d.waste ?? []);
      });
  }, []);

  async function uploadPhoto(reportId: string, file: File, kind: "BEFORE" | "AFTER") {
    const form = new FormData();
    form.append("file", file);
    form.append("entityType", "TaskFieldReport");
    form.append("entityId", reportId);
    form.append("kind", kind);
    await fetch("/api/field-photos", { method: "POST", body: form });
  }

  async function save() {
    setSaving(true);
    try {
      // idempotencyKey doubles as the offline-queue id: if this never leaves
      // the device (network down all the way through), the exact same
      // report is what eventually gets sent — never a duplicate.
      const { queued, body } = await sendOrQueue(idempotencyKey, `/api/plans/tasks/${task.id}/field-report`, "POST", {
        startedAt: task.plannedStart,
        endedAt: new Date().toISOString(),
        dirtBefore,
        cleanAfter: status === "DONE" ? cleanAfter : null,
        refillNeeded,
        waterRefillPointId: refillNeeded ? waterRefillPointId || null : null,
        wasteDumpNeeded,
        wasteDisposalPointId: wasteDumpNeeded ? wasteDisposalPointId || null : null,
        accessProblem,
        parkedVehicles,
        blocked,
        vehicleSuitable,
        needsRevisit,
        nonCompletionReason: needsReason ? nonCompletionReason : null,
        defectId,
        notes: comment || null,
        idempotencyKey,
      });
      // Photos are uploaded live only — a queued report has no reportId yet
      // to attach them to. A photo captured while fully offline is not
      // retried; this is a known gap (see MD-03 in docs/IMPLEMENTATION_STATUS.md).
      const reportId = (body as { reportId?: string } | null)?.reportId;
      if (!queued && reportId) {
        if (photoBefore) await uploadPhoto(reportId, photoBefore, "BEFORE");
        if (photoAfter) await uploadPhoto(reportId, photoAfter, "AFTER");
      }
      onSaved(comment || undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-bold">{task.streetName} — {STATUS_LABEL[status]}</div>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">רמת לכלוך לפני</label>
          <div className="flex gap-2" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setDirtBefore(n)}
                className={`h-11 flex-1 rounded-lg border-2 font-bold ${
                  dirtBefore === n ? "border-accent bg-accent text-accent-foreground" : "border-panel-border"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoBefore(e.target.files?.[0] ?? null)}
            className="mt-2 w-full text-xs"
          />
        </div>

        {status === "DONE" && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">רמת ניקיון אחרי</label>
            <div className="flex gap-2" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setCleanAfter(n)}
                  className={`h-11 flex-1 rounded-lg border-2 font-bold ${
                    cleanAfter === n ? "border-success bg-success/10 text-success" : "border-panel-border"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhotoAfter(e.target.files?.[0] ?? null)}
              className="mt-2 w-full text-xs"
            />
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <ToggleChip label="נדרש מילוי מים" value={refillNeeded} onChange={setRefillNeeded} />
          <ToggleChip label="נדרשה פריקת פסולת" value={wasteDumpNeeded} onChange={setWasteDumpNeeded} />
          <ToggleChip label="בעיית גישה" value={accessProblem} onChange={setAccessProblem} />
          <ToggleChip label="רכבים חונים" value={parkedVehicles} onChange={setParkedVehicles} />
          <ToggleChip label="הייתה חסימה" value={blocked} onChange={setBlocked} />
          <ToggleChip label="נדרש לחזור שוב" value={needsRevisit} onChange={setNeedsRevisit} />
        </div>

        {needsReason && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">סיבת אי-ביצוע</label>
            <select
              value={nonCompletionReason}
              onChange={(e) => setNonCompletionReason(e.target.value)}
              className="w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 text-sm outline-none"
            >
              {Object.entries(NON_COMPLETION_REASON_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            {canCreateDefect && (
              <button
                onClick={raiseDefect}
                disabled={raisingDefect || !!defectId}
                className="mt-2 w-full rounded-lg border border-warning/40 bg-warning/10 py-2 text-sm font-semibold text-warning disabled:opacity-50"
              >
                {defectId ? "✓ ליקוי נפתח" : raisingDefect ? "פותח ליקוי..." : "פתח ליקוי על סמך דיווח זה"}
              </button>
            )}
          </div>
        )}

        {refillNeeded && (
          <select
            value={waterRefillPointId}
            onChange={(e) => setWaterRefillPointId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 text-sm outline-none"
          >
            <option value="">נקודת מילוי...</option>
            {waterPoints.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {wasteDumpNeeded && (
          <select
            value={wasteDisposalPointId}
            onChange={(e) => setWasteDisposalPointId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 text-sm outline-none"
          >
            <option value="">נקודת פריקה...</option>
            {wastePoints.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <label className="mb-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={vehicleSuitable} onChange={(e) => setVehicleSuitable(e.target.checked)} />
          המסלול היה מתאים לכלי
        </label>

        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="הערה (אופציונלי)"
          className="my-3 w-full rounded-lg border border-panel-border bg-transparent px-3 py-2 text-sm outline-none"
        />

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-accent py-3 text-base font-bold text-accent-foreground disabled:opacity-50"
        >
          {saving ? "שומר..." : "שמור דיווח"}
        </button>
      </div>
    </div>
  );
}

function ToggleChip({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`rounded-lg border-2 px-3 py-2 text-xs font-medium ${
        value ? "border-accent bg-accent/10 text-accent" : "border-panel-border text-foreground/80"
      }`}
    >
      {value ? "✅ " : "⬜ "}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function MyDayClient() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [openCommentFor, setOpenCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [reportSheet, setReportSheet] = useState<{ task: Task; status: string } | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [canCreateDefect, setCanCreateDefect] = useState(false);
  const [droppedConflicts, setDroppedConflicts] = useState(0);

  function load() {
    fetch("/api/my-day")
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks);
        setResources(data.resources ?? []);
        setShiftReports(data.shiftReports ?? []);
        setCanCreateDefect(!!data.canCreateDefect);
      });
    queueLength().then(setPendingSync);
  }

  async function syncNow() {
    const { remaining, conflicts } = await drainQueue();
    setPendingSync(remaining);
    // Accumulate rather than overwrite — several sync passes could each
    // surface a conflict before the worker notices/dismisses the banner.
    if (conflicts > 0) setDroppedConflicts((n) => n + conflicts);
    load();
  }

  useEffect(() => {
    // Drains whatever the offline queue already holds (e.g. from a previous
    // session that closed while still offline) before the first load, then
    // keeps retrying on reconnect and periodically in case `online` doesn't
    // fire reliably on the device.
    const timer = setTimeout(() => {
      syncNow();
    }, 0);
    window.addEventListener("online", syncNow);
    const interval = setInterval(syncNow, 30000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", syncNow);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function commitStatus(taskId: string, status: string, employeeComment?: string) {
    await sendOrQueue(crypto.randomUUID(), `/api/plans/tasks/${taskId}/status`, "PATCH", {
      status,
      ...(employeeComment !== undefined ? { employeeComment } : {}),
    });
    load();
    setOpenCommentFor(null);
    setCommentDraft("");
  }

  function requestStatus(task: Task, status: string) {
    // A field report accompanies every real outcome (§8); a bare "in progress"
    // does not need one.
    if (status === "IN_PROGRESS") {
      commitStatus(task.id, status);
      return;
    }
    setReportSheet({ task, status });
  }

  if (tasks === null) {
    return <div className="p-4 text-sm text-muted">טוען...</div>;
  }

  const resourcesNeedingShift = resources.filter((r) => !shiftReports.some((s) => s.resourceId === r.id));

  return (
    <div className="space-y-3">
      {pendingSync > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>ממתין לסנכרון: {pendingSync} דיווחים שנשמרו במכשיר ויישלחו כשהחיבור יחזור</span>
          <button onClick={syncNow} className="font-semibold underline">
            נסה עכשיו
          </button>
        </div>
      )}

      {droppedConflicts > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>
            {droppedConflicts} עדכונים שנשמרו במכשיר לא נשלחו — המשימה שויכה מחדש בזמן שהייתם offline. בדקו את רשימת המשימות העדכנית.
          </span>
          <button onClick={() => setDroppedConflicts(0)} className="font-semibold underline">
            הבנתי
          </button>
        </div>
      )}

      {resourcesNeedingShift.map((r) => (
        <ShiftOpenForm key={r.id} resource={r} onDone={load} />
      ))}

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
          אין לך משימות משובצות היום.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-panel-border bg-panel p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{tasks[0]?.resourceLabel}</span>
              <span className="text-muted">
                {tasks.filter((t) => t.status === "DONE").length}/{tasks.length} הושלמו
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full bg-success"
                style={{ width: `${(tasks.filter((t) => t.status === "DONE").length / tasks.length) * 100}%` }}
              />
            </div>
          </div>

          {tasks.map((t, i) => (
            <div key={t.id} className="rounded-xl border border-panel-border bg-panel p-3">
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold">{t.streetName}</div>
                    <div className="text-xs text-muted" dir="ltr">
                      {fmtTime(t.plannedStart)}–{fmtTime(t.plannedEnd)}
                    </div>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLOR[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>
              </div>

              {t.lat && t.lon && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2 block rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-center text-sm text-accent"
                >
                  פתח במפה 🧭
                </a>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => requestStatus(t, "DONE")}
                  className="rounded-md border border-success/40 bg-success/10 py-1.5 text-xs font-semibold text-success"
                >
                  בוצע
                </button>
                <button
                  onClick={() => requestStatus(t, "NOT_DONE")}
                  className="rounded-md border border-danger/40 bg-danger/10 py-1.5 text-xs font-semibold text-danger"
                >
                  לא בוצע
                </button>
                <button
                  onClick={() => requestStatus(t, "PROBLEM")}
                  className="rounded-md border border-warning/40 bg-warning/10 py-1.5 text-xs font-semibold text-warning"
                >
                  בעיה
                </button>
              </div>

              {t.status === "PENDING" && (
                <button
                  onClick={() => commitStatus(t.id, "IN_PROGRESS")}
                  className="mt-2 w-full rounded-md border border-panel-border py-1.5 text-xs text-muted"
                >
                  התחל עבודה
                </button>
              )}

              {t.hasFieldReport && <div className="mt-2 text-xs text-success">✓ דווח ביצוע מפורט</div>}

              {openCommentFor === t.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="הערה..."
                    className="flex-1 rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none"
                  />
                  <button
                    onClick={() => commitStatus(t.id, t.status, commentDraft)}
                    className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground"
                  >
                    שמור
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setOpenCommentFor(t.id);
                    setCommentDraft(t.employeeComment ?? "");
                  }}
                  className="mt-2 text-xs text-accent"
                >
                  {t.employeeComment ? `הערה: ${t.employeeComment}` : "+ הוסף הערה"}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {reportSheet && (
        <FieldReportSheet
          task={reportSheet.task}
          status={reportSheet.status}
          canCreateDefect={canCreateDefect}
          onClose={() => setReportSheet(null)}
          onSaved={(comment) => {
            const { task, status } = reportSheet;
            setReportSheet(null);
            commitStatus(task.id, status, comment);
          }}
        />
      )}
    </div>
  );
}
