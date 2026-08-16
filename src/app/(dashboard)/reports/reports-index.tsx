"use client";

import { useState } from "react";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReportsIndex() {
  const [date, setDate] = useState(todayStr());

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">תוכנית עבודה יומית</div>
            <div className="text-sm text-muted">כל המשימות, לפי כלי, לתאריך נבחר</div>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            dir="ltr"
            className="rounded-md border border-panel-border bg-transparent px-3 py-1.5 text-sm outline-none"
          />
        </div>
        <div className="flex gap-2">
          <a
            href={`/reports/daily/print?date=${date}`}
            target="_blank"
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10"
          >
            תצוגה להדפסה / PDF
          </a>
          <a
            href={`/api/reports/daily/excel?date=${date}`}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
          >
            הורדה כ-Excel
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-3">
          <div className="font-semibold">רחובות שלא שובצו היום</div>
          <div className="text-sm text-muted">רחובות חייבי ניקיון היום שעדיין לא נכנסו לאף תוכנית</div>
        </div>
        <div className="flex gap-2">
          <a
            href="/reports/unscheduled/print"
            target="_blank"
            className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10"
          >
            תצוגה להדפסה / PDF
          </a>
          <a href="/api/reports/unscheduled/excel" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
            הורדה כ-Excel
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="font-semibold">תוכנית שבועית</div>
        <div className="mb-3 text-sm text-muted">תמונת מצב לכל השבוע</div>
        <a href="/plans/weekly" className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10">
          עבור ללוח השבועי ←
        </a>
      </div>

      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="mb-3">
          <div className="font-semibold">תוכנית מול ביצוע</div>
          <div className="text-sm text-muted">השוואת זמנים מתוכננים מול בפועל, לפי דיווחי העובדים</div>
        </div>
        <a href={`/reports/plan-vs-actual?date=${date}`} className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10">
          צפייה ←
        </a>
      </div>

      <div className="rounded-xl border border-panel-border bg-panel p-4">
        <div className="font-semibold">היסטוריית גרסאות</div>
        <div className="mb-3 text-sm text-muted">כל גרסאות התוכנית, כולל שינויים</div>
        <a href="/plans/history" className="rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10">
          עבור להיסטוריה ←
        </a>
      </div>
    </div>
  );
}
