"use client";

/**
 * §19 — seed or remove the demo dataset from a screen, without a terminal.
 * Not shown to anyone lacking `demo.manage`; the server enforces the same
 * gate independently.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DemoDataSection() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function seed() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/demo/routing", { method: "POST" });
      const body = await res.json();
      setMsg(res.ok ? `נוצרו נתוני הדגמה: ${body.streetIds?.length ?? 0} מקטעים, כלי אחד, 2 נקודות מים.` : body.error ?? "יצירה נכשלה");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/demo/routing", { method: "DELETE" });
      setMsg(res.ok ? "נתוני ההדגמה נמחקו." : "מחיקה נכשלה");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-panel-border bg-panel p-4">
      <h2 className="mb-1 font-bold">נתוני הדגמה (§19)</h2>
      <p className="mb-3 text-xs text-muted">
        אזור הדגמה אחד עם 8 מקטעים, כלי עם קיבולת מים מוגדרת, שתי נקודות מים (אחת תקולה) ומסלול שדורש מילוי — מסומן{" "}
        <span className="font-semibold">DEMO</span> בכל מקום שבו הוא מוצג. אינו נכלל בדוחות חיסכון או בלמידה.
      </p>
      {msg && <div className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{msg}</div>}
      <div className="flex gap-3">
        <button
          onClick={seed}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {busy ? "מעבד..." : "צור נתוני הדגמה"}
        </button>
        <button
          onClick={clear}
          disabled={busy}
          className="rounded-md border border-danger/40 bg-danger/10 px-4 py-1.5 text-sm font-semibold text-danger disabled:opacity-50"
        >
          מחק נתוני הדגמה
        </button>
      </div>
    </section>
  );
}
