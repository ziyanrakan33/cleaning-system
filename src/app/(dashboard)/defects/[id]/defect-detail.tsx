"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  DEDUCTION_STATUS_CLASS,
  DEDUCTION_STATUS_LABEL,
  DEFECT_STATUS_CLASS,
  DEFECT_STATUS_LABEL,
  EVENT_ACTION_LABEL,
  formatDateTime,
  ORIGIN_LABEL,
  relativeDeadline,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
} from "../defect-labels";

type Detail = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  status: string;
  severity: string;
  origin: string;
  type: {
    code: string;
    name: string;
    category: string;
    unitBasis: string;
    deductionAmount: number | null;
    sourceSection: string | null;
  } | null;
  zone: { name: string; code: string; color: string } | null;
  streetName: string | null;
  contractAreaName: string | null;
  contractorName: string | null;
  assignedTo: { id: string; name: string } | null;
  reportedByName: string;
  reportedAt: string;
  dueAt: string | null;
  fixedAt: string | null;
  closedAt: string | null;
  overdue: boolean;
  notDoneReason: string | null;
  inspectorNotes: string | null;
  deduction: {
    status: string;
    amount: number | null;
    surchargePercent: number | null;
    effective: number | null;
    reason: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
  };
  appeal: {
    text: string | null;
    appealedAt: string | null;
    dueAt: string | null;
    decision: string | null;
    decidedAt: string | null;
    decidedByName: string | null;
  };
  complaint: { id: string; reference: string; subject: string } | null;
  photos: {
    id: string;
    kind: string;
    caption: string | null;
    sizeBytes: number;
    uploadedAt: string;
    uploadedByName: string;
  }[];
  events: {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    userName: string | null;
    createdAt: string;
  }[];
  availableTransitions: { to: string; label: string }[];
  canApproveDeduction: boolean;
  canAppeal: boolean;
  canDecideAppeal: boolean;
  canSeeFinance: boolean;
};

export function DefectDetail({ defectId, initial }: { defectId: string; initial: Detail }) {
  // Rendered from a Server Component with the first paint's data already
  // fetched, so there is no fetch-on-mount effect here — only re-fetches after
  // a mutation, triggered from the event handlers below.
  const [d, setD] = useState<Detail>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/defects/${defectId}`);
      if (!res.ok) throw new Error("טעינת הליקוי נכשלה");
      setD(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [defectId]);

  async function patch(body: unknown, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/defects/${defectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "הפעולה נכשלה");
      setMessage(success);
      setNote("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(kind: "BEFORE" | "AFTER", file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch(`/api/defects/${defectId}/photos`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "העלאה נכשלה");
      setMessage(kind === "BEFORE" ? "תמונת לפני נוספה" : "תמונת אחרי נוספה");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const before = d.photos.filter((p) => p.kind === "BEFORE");
  const after = d.photos.filter((p) => p.kind === "AFTER");

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <Link href="/defects" className="mb-4 inline-block text-sm text-accent hover:underline">
        ← חזרה לרשימת הליקויים
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- main ---- */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted" dir="ltr">
                {d.reference}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${DEFECT_STATUS_CLASS[d.status] ?? ""}`}
              >
                {DEFECT_STATUS_LABEL[d.status] ?? d.status}
              </span>
              {d.overdue && (
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                  באיחור
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold">{d.title}</h2>
            {d.description && <p className="mt-1 text-sm text-muted">{d.description}</p>}

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="סוג ליקוי" value={d.type?.name ?? "לא הוגדר"} />
              <Row label="קטגוריה" value={d.type?.category ?? "—"} />
              <Row label="אזור" value={d.zone?.name ?? "ללא"} />
              <Row label="רחוב" value={d.streetName ?? "—"} />
              <Row label="קבלן אחראי" value={d.contractorName ?? "טרם נקבע"} />
              <Row label="אזור מכרז" value={d.contractAreaName ?? "—"} />
              <Row
                label="חומרה"
                value={SEVERITY_LABEL[d.severity] ?? d.severity}
                className={SEVERITY_CLASS[d.severity]}
              />
              <Row label="מקור" value={ORIGIN_LABEL[d.origin] ?? d.origin} />
              <Row label="דווח על ידי" value={`${d.reportedByName} · ${formatDateTime(d.reportedAt)}`} />
              <Row label="אחראי מטעם הקבלן" value={d.assignedTo?.name ?? "טרם שויך"} />
              <Row
                label="מועד יעד"
                value={`${formatDateTime(d.dueAt)} (${relativeDeadline(d.dueAt)})`}
                className={d.overdue ? "text-danger" : undefined}
              />
              <Row label="תוקן" value={formatDateTime(d.fixedAt)} />
            </dl>

            {d.notDoneReason && (
              <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                <div className="text-xs font-semibold text-danger">סיבת אי-ביצוע</div>
                {d.notDoneReason}
              </div>
            )}
            {d.complaint && (
              <div className="mt-3 text-sm">
                נפתח בעקבות תלונה{" "}
                <a href="/complaints" className="font-mono text-accent hover:underline" dir="ltr">
                  {d.complaint.reference}
                </a>{" "}
                — {d.complaint.subject}
              </div>
            )}
          </div>

          {/* ---- photos ---- */}
          <div className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-3 text-sm font-semibold">תיעוד לפני ואחרי</div>
            <div className="grid gap-4 md:grid-cols-2">
              <PhotoColumn
                title="לפני"
                photos={before}
                onPick={() => beforeInput.current?.click()}
                busy={busy}
                closed={d.status === "CLOSED"}
              />
              <PhotoColumn
                title="אחרי"
                photos={after}
                onPick={() => afterInput.current?.click()}
                busy={busy}
                closed={d.status === "CLOSED"}
                hint={
                  after.length === 0
                    ? "נדרשת תמונת 'אחרי' לפני שניתן לאשר את התיקון"
                    : undefined
                }
              />
            </div>
            <input
              ref={beforeInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto("BEFORE", f);
                e.target.value = "";
              }}
            />
            <input
              ref={afterInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto("AFTER", f);
                e.target.value = "";
              }}
            />
          </div>

          {/* ---- history ---- */}
          <div className="rounded-xl border border-panel-border bg-panel p-4">
            <div className="mb-3 text-sm font-semibold">היסטוריית טיפול</div>
            <ol className="space-y-2">
              {d.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent/60" />
                  <div>
                    <div>
                      {EVENT_ACTION_LABEL[e.action] ?? e.action}
                      {e.toStatus && e.action === "STATUS_CHANGE" && (
                        <>
                          {" "}
                          → <strong>{DEFECT_STATUS_LABEL[e.toStatus] ?? e.toStatus}</strong>
                        </>
                      )}
                    </div>
                    {e.note && <div className="text-xs text-muted">{e.note}</div>}
                    <div className="text-xs text-muted">
                      {e.userName ?? "מערכת"} · {formatDateTime(e.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted">
              ההיסטוריה היא רישום בלתי הפיך — רשומות אינן נערכות ואינן נמחקות.
            </p>
          </div>
        </div>

        {/* ---- side: actions ---- */}
        <div className="space-y-4">
          {d.availableTransitions.length > 0 && (
            <div className="rounded-xl border border-panel-border bg-panel p-4">
              <div className="mb-2 text-sm font-semibold">פעולות</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="הערה (תישמר בהיסטוריה)"
                className="mb-2 w-full rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <div className="flex flex-col gap-2">
                {d.availableTransitions.map((t) => (
                  <button
                    key={t.to}
                    disabled={busy}
                    onClick={() =>
                      patch({ action: "status", to: t.to, note: note || null }, `בוצע: ${t.label}`)
                    }
                    className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DeductionPanel d={d} busy={busy} patch={patch} />
          <AppealPanel d={d} busy={busy} patch={patch} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={className}>{value}</dd>
    </div>
  );
}

function PhotoColumn({
  title,
  photos,
  onPick,
  busy,
  closed,
  hint,
}: {
  title: string;
  photos: Detail["photos"];
  onPick: () => void;
  busy: boolean;
  closed: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{title}</span>
        {!closed && (
          <button
            onClick={onPick}
            disabled={busy}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            הוספת תמונה
          </button>
        )}
      </div>
      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-panel-border p-4 text-center text-xs text-muted">
          {hint ?? "אין תמונות"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <a
              key={p.id}
              href={`/api/defects/photos/${p.id}`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-panel-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/defects/photos/${p.id}`}
                alt={p.caption ?? title}
                className="h-28 w-full object-cover"
              />
              <div className="p-1 text-xs text-muted">{formatDateTime(p.uploadedAt)}</div>
            </a>
          ))}
        </div>
      )}
      {hint && photos.length > 0 && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function DeductionPanel({
  d,
  busy,
  patch,
}: {
  d: Detail;
  busy: boolean;
  patch: (body: unknown, success: string) => Promise<void>;
}) {
  const [surcharge, setSurcharge] = useState(false);
  const [reason, setReason] = useState("");

  if (d.deduction.status === "NONE") {
    return (
      <div className="rounded-xl border border-panel-border bg-panel p-4 text-sm">
        <div className="mb-1 font-semibold">קיזוז</div>
        <p className="text-xs text-muted">
          לליקוי לא שויך סוג מטבלת הקיזוזים, ולכן לא הוצע קיזוז.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">קיזוז</span>
        <span className={`text-xs ${DEDUCTION_STATUS_CLASS[d.deduction.status] ?? ""}`}>
          {DEDUCTION_STATUS_LABEL[d.deduction.status] ?? d.deduction.status}
        </span>
      </div>

      {d.canSeeFinance ? (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">סכום מהמכרז</span>
            <span className="tabular-nums">
              {(d.deduction.amount ?? 0).toLocaleString("he-IL")} ₪
            </span>
          </div>
          {d.deduction.surchargePercent ? (
            <div className="flex justify-between">
              <span className="text-muted">תוספת §822</span>
              <span className="tabular-nums">{d.deduction.surchargePercent}%</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-panel-border pt-1 font-semibold">
            <span>סה״כ</span>
            <span className="tabular-nums">
              {(d.deduction.effective ?? 0).toLocaleString("he-IL")} ₪
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">סכומי הקיזוז מוצגים לבעלי הרשאת כספים בלבד.</p>
      )}

      {d.type && <p className="mt-2 text-xs text-muted">בסיס החיוב: {d.type.unitBasis}</p>}

      {d.deduction.approvedByName && (
        <p className="mt-2 text-xs text-muted">
          אושר על ידי {d.deduction.approvedByName} · {formatDateTime(d.deduction.approvedAt)}
        </p>
      )}

      {d.canApproveDeduction && d.deduction.status === "PROPOSED" && (
        <div className="mt-3 space-y-2 border-t border-panel-border pt-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={surcharge}
              onChange={() => setSurcharge((v) => !v)}
            />
            העירייה ביצעה את התיקון — הוספת 15% הוצאות מיוחדות (§822)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="נימוק (לא חובה)"
            className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                patch(
                  { action: "deduction", decision: "APPROVED", applySurcharge: surcharge, reason: reason || null },
                  "הקיזוז אושר"
                )
              }
              className="flex-1 rounded-md border border-panel-border px-2 py-1.5 text-xs hover:border-danger hover:text-danger disabled:opacity-50"
            >
              אשר קיזוז
            </button>
            <button
              disabled={busy}
              onClick={() =>
                patch(
                  { action: "deduction", decision: "WAIVED", reason: reason || null },
                  "הקיזוז בוטל"
                )
              }
              className="flex-1 rounded-md border border-panel-border px-2 py-1.5 text-xs hover:border-success hover:text-success disabled:opacity-50"
            >
              בטל קיזוז
            </button>
          </div>
          <p className="text-xs text-muted">
            הקיזוז אינו חל עד לאישור כאן. §825: בתום כל חודש המנהל מפרט את רשימת הליקויים ושיעור הקיזוז.
          </p>
        </div>
      )}
    </div>
  );
}

function AppealPanel({
  d,
  busy,
  patch,
}: {
  d: Detail;
  busy: boolean;
  patch: (body: unknown, success: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [decision, setDecision] = useState("");

  const canLodge = d.canAppeal && d.deduction.status === "APPROVED" && !d.appeal.appealedAt;
  const canDecide = d.canDecideAppeal && d.status === "APPEALED";

  if (!d.appeal.appealedAt && !canLodge) return null;

  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="mb-2 text-sm font-semibold">ערעור</div>

      {d.appeal.appealedAt ? (
        <div className="space-y-1 text-sm">
          <p className="text-xs text-muted">הוגש {formatDateTime(d.appeal.appealedAt)}</p>
          <p className="rounded-md bg-background p-2 text-sm">{d.appeal.text}</p>
          {d.appeal.decision ? (
            <div className="mt-2">
              <div className="text-xs font-semibold text-muted">ההחלטה (סופית)</div>
              <p>{d.appeal.decision}</p>
              <p className="text-xs text-muted">
                {d.appeal.decidedByName} · {formatDateTime(d.appeal.decidedAt)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-warning">
              ממתין להחלטה · המכרז קוצב 14 יום ({formatDateTime(d.appeal.dueAt)})
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            §826: ניתן לערער תוך 7 ימים מקבלת רשימת הליקויים
            {d.appeal.dueAt ? ` — עד ${formatDateTime(d.appeal.dueAt)}` : ""}.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="נימוק הערעור"
            className="mb-2 w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            disabled={busy || text.trim().length < 5}
            onClick={() => patch({ action: "appeal", text }, "הערעור הוגש")}
            className="w-full rounded-md border border-panel-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
          >
            הגש ערעור
          </button>
        </>
      )}

      {canDecide && (
        <div className="mt-3 space-y-2 border-t border-panel-border pt-3">
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            rows={2}
            placeholder="נימוק ההחלטה"
            className="w-full rounded-md border border-panel-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || decision.trim().length < 3}
              onClick={() =>
                patch(
                  { action: "appealDecision", accepted: true, decision },
                  "הערעור התקבל והקיזוז בוטל"
                )
              }
              className="flex-1 rounded-md border border-panel-border px-2 py-1.5 text-xs hover:border-success hover:text-success disabled:opacity-50"
            >
              קבל ערעור
            </button>
            <button
              disabled={busy || decision.trim().length < 3}
              onClick={() =>
                patch({ action: "appealDecision", accepted: false, decision }, "הערעור נדחה")
              }
              className="flex-1 rounded-md border border-panel-border px-2 py-1.5 text-xs hover:border-danger hover:text-danger disabled:opacity-50"
            >
              דחה ערעור
            </button>
          </div>
          <p className="text-xs text-muted">ההחלטה סופית לפי §826.</p>
        </div>
      )}
    </div>
  );
}
