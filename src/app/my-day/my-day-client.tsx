"use client";

import { useEffect, useState } from "react";

type Task = {
  id: string;
  resourceLabel: string;
  sequenceOrder: number;
  streetName: string;
  lat: number | null;
  lon: number | null;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  employeeComment: string | null;
};

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

export function MyDayClient() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [openCommentFor, setOpenCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  function load() {
    fetch("/api/my-day")
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks));
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(taskId: string, status: string, employeeComment?: string) {
    await fetch(`/api/plans/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(employeeComment !== undefined ? { employeeComment } : {}) }),
    });
    load();
    setOpenCommentFor(null);
    setCommentDraft("");
  }

  if (tasks === null) {
    return <div className="p-4 text-sm text-muted">טוען...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
        אין לך משימות משובצות היום.
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-panel-border bg-panel p-3 text-sm">
        <div className="flex items-center justify-between">
          <span>{tasks[0]?.resourceLabel}</span>
          <span className="text-muted">
            {doneCount}/{tasks.length} הושלמו
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full bg-success" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
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
              onClick={() => setStatus(t.id, "DONE")}
              className="rounded-md border border-success/40 bg-success/10 py-1.5 text-xs font-semibold text-success"
            >
              בוצע
            </button>
            <button
              onClick={() => setStatus(t.id, "NOT_DONE")}
              className="rounded-md border border-danger/40 bg-danger/10 py-1.5 text-xs font-semibold text-danger"
            >
              לא בוצע
            </button>
            <button
              onClick={() => setStatus(t.id, "PROBLEM")}
              className="rounded-md border border-warning/40 bg-warning/10 py-1.5 text-xs font-semibold text-warning"
            >
              בעיה
            </button>
          </div>

          {openCommentFor === t.id ? (
            <div className="mt-2 flex gap-2">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="הערה..."
                className="flex-1 rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none"
              />
              <button
                onClick={() => setStatus(t.id, t.status, commentDraft)}
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
    </div>
  );
}
