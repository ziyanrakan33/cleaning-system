"use client";

import { useState } from "react";

type Option = { id: string; label?: string; name?: string };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ReportCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel p-4">
      <div className="mb-3">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

const inputCls = "rounded-md border border-panel-border bg-transparent px-2 py-1 text-sm outline-none";
const printLinkCls = "rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10";
const excelLinkCls = "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground";
const csvLinkCls = "rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent/10";

function ActionLinks({ printHref, exportType, exportQuery }: { printHref: string; exportType: string; exportQuery: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={printHref} target="_blank" className={printLinkCls}>
        תצוגה להדפסה / PDF
      </a>
      <a href={`/api/reports/export?type=${exportType}&format=xlsx&${exportQuery}`} className={excelLinkCls}>
        הורדה כ-Excel
      </a>
      <a href={`/api/reports/export?type=${exportType}&format=csv&${exportQuery}`} className={csvLinkCls}>
        הורדה כ-CSV
      </a>
    </div>
  );
}

export function ReportsIndex({
  zones,
  contractAreas,
  resources,
  workers,
  canSeeFinance,
}: {
  zones: Option[];
  contractAreas: Option[];
  resources: Option[];
  workers: Option[];
  canSeeFinance: boolean;
}) {
  return (
    <div className="space-y-8 p-6">
      {/* ---------------- ביצוע ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">ביצוע — יומי, שבועי וחודשי</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <DailyPlanCard />
          <UnscheduledCard />
          <WeeklyBoardCard />
          <PlanVsActualCard />
          <WeeklyZoneCard />
          <MonthlyContractorCard canSeeFinance={canSeeFinance} />
          <HoursCard />
          <StreetsCompletionCard zones={zones} />
          <KmCard />
        </div>
      </section>

      {/* ---------------- משאבים ורכב ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">משאבים ורכב</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ByResourceCard resources={resources} />
          <ByWorkerCard workers={workers} />
          <ShiftCard />
          <ZoneVehiclesCard />
          <ResourceUtilizationCard contractAreas={contractAreas} />
        </div>
      </section>

      {/* ---------------- ליקויים, איכות ובקרה ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">ליקויים, איכות ובקרה</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <DefectsReportCard zones={zones} contractAreas={contractAreas} />
          <QualityControlCard />
          <CityCoverageCard />
          <GpsCard />
        </div>
      </section>

      {/* ---------------- מקורות ואימות ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">מקורות ואימות</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <SourceConflictsCard />
          <PendingVerificationCard />
        </div>
      </section>

      {/* ---------------- היסטוריה ---------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">היסטוריה</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ReportCard title="היסטוריית גרסאות" description="כל גרסאות התוכנית, כולל שינויים">
            <a href="/plans/history" className={printLinkCls}>
              עבור להיסטוריה ←
            </a>
          </ReportCard>
        </div>
      </section>
    </div>
  );
}

// ============================== existing reports ==============================

function DailyPlanCard() {
  const [date, setDate] = useState(todayStr());
  return (
    <ReportCard title="תוכנית עבודה יומית" description="כל המשימות, לפי כלי, לתאריך נבחר">
      <Field label="תאריך">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`/reports/daily/print?date=${date}`} target="_blank" className={printLinkCls}>
          תצוגה להדפסה / PDF
        </a>
        <a href={`/api/reports/daily/excel?date=${date}`} className={excelLinkCls}>
          הורדה כ-Excel
        </a>
      </div>
    </ReportCard>
  );
}

function UnscheduledCard() {
  return (
    <ReportCard title="רחובות שלא שובצו היום" description="רחובות חייבי ניקיון היום שעדיין לא נכנסו לאף תוכנית">
      <div className="flex flex-wrap gap-2">
        <a href="/reports/unscheduled/print" target="_blank" className={printLinkCls}>
          תצוגה להדפסה / PDF
        </a>
        <a href="/api/reports/unscheduled/excel" className={excelLinkCls}>
          הורדה כ-Excel
        </a>
      </div>
    </ReportCard>
  );
}

function WeeklyBoardCard() {
  return (
    <ReportCard title="תוכנית שבועית" description="תמונת מצב לכל השבוע">
      <a href="/plans/weekly" className={printLinkCls}>
        עבור ללוח השבועי ←
      </a>
    </ReportCard>
  );
}

function PlanVsActualCard() {
  const [date, setDate] = useState(todayStr());
  return (
    <ReportCard title="תוכנית מול ביצוע" description="השוואת זמנים מתוכננים מול בפועל, לפי דיווחי העובדים">
      <Field label="תאריך">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <a href={`/reports/plan-vs-actual?date=${date}`} className={`${printLinkCls} mt-3 inline-block`}>
        צפייה ←
      </a>
    </ReportCard>
  );
}

// ============================== new execution reports ==============================

function WeeklyZoneCard() {
  const [start, setStart] = useState(startOfWeekStr());
  const q = `start=${start}`;
  return (
    <ReportCard title="דוח שבועי לפי אזור" description="משימות, אחוז ביצוע וק״מ לכל אזור תפעולי, לשבוע נבחר">
      <Field label="תחילת שבוע (יום ראשון)">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <ActionLinks printHref={`/reports/weekly-zone/print?${q}`} exportType="weekly-zone" exportQuery={q} />
    </ReportCard>
  );
}

function MonthlyContractorCard({ canSeeFinance }: { canSeeFinance: boolean }) {
  const [month, setMonth] = useState(thisMonthStr());
  const q = `month=${month}`;
  return (
    <ReportCard
      title="דוח חודשי לפי קבלן"
      description={`ביצוע, משאבים וליקויים לכל אזור מכרז, לחודש נבחר${canSeeFinance ? " (כולל קיזוזים מאושרים)" : ""}`}
    >
      <Field label="חודש">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <ActionLinks printHref={`/reports/monthly-contractor/print?${q}`} exportType="monthly-contractor" exportQuery={q} />
    </ReportCard>
  );
}

function HoursCard() {
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const q = `from=${from}&to=${to}`;
  return (
    <ReportCard title="שעות עבודה מתוכננות מול בפועל" description="לכל כלי, סכום שעות מתוכננות מול בפועל וטווח הפער">
      <div className="flex gap-2">
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
      </div>
      <ActionLinks printHref={`/reports/hours/print?${q}`} exportType="hours" exportQuery={q} />
    </ReportCard>
  );
}

function StreetsCompletionCard({ zones }: { zones: Option[] }) {
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const [zoneId, setZoneId] = useState("");
  const [result, setResult] = useState("all");
  const q = `from=${from}&to=${to}${zoneId ? `&zoneId=${zoneId}` : ""}&result=${result}`;
  return (
    <ReportCard title="רחובות שבוצעו / לא בוצעו" description="לפי הסטטוס האחרון של כל רחוב בטווח שנבחר">
      <div className="flex flex-wrap gap-2">
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="אזור">
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputCls}>
            <option value="">כל האזורים</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="הצג">
          <select value={result} onChange={(e) => setResult(e.target.value)} className={inputCls}>
            <option value="all">הכל</option>
            <option value="done">בוצעו</option>
            <option value="not-done">לא בוצעו</option>
          </select>
        </Field>
      </div>
      <ActionLinks printHref={`/reports/streets-completion/print?${q}`} exportType="streets-completion" exportQuery={q} />
    </ReportCard>
  );
}

function KmCard() {
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const [groupBy, setGroupBy] = useState("zone");
  const q = `from=${from}&to=${to}&groupBy=${groupBy}`;
  return (
    <ReportCard title='קילומטרים מתוכננים מול מבוצעים' description='ק"מ שתוכננו מול ק"מ שהושלמו בפועל, לפי אזור או קבלן'>
      <div className="flex flex-wrap gap-2">
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="קיבוץ">
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={inputCls}>
            <option value="zone">לפי אזור</option>
            <option value="contractor">לפי קבלן</option>
          </select>
        </Field>
      </div>
      <ActionLinks printHref={`/reports/km/print?${q}`} exportType="km" exportQuery={q} />
    </ReportCard>
  );
}

// ============================== resources / vehicles ==============================

function ByResourceCard({ resources }: { resources: Option[] }) {
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const q = `resourceId=${resourceId}&from=${from}&to=${to}`;
  return (
    <ReportCard title="דוח לפי כלי רכב / מספר רישוי" description="כל המשימות של כלי נבחר, מתוכנן מול בפועל">
      <div className="flex flex-wrap gap-2">
        <Field label="כלי">
          <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={`${inputCls} min-w-40`}>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
      </div>
      {resourceId ? (
        <ActionLinks printHref={`/reports/by-resource/print?${q}`} exportType="by-resource" exportQuery={q} />
      ) : (
        <p className="mt-3 text-xs text-muted">אין משאבים פעילים במערכת</p>
      )}
    </ReportCard>
  );
}

function ByWorkerCard({ workers }: { workers: Option[] }) {
  const [userId, setUserId] = useState(workers[0]?.id ?? "");
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const q = `userId=${userId}&from=${from}&to=${to}`;
  return (
    <ReportCard title="דוח לפי מנהל עבודה / נהג" description="כל המשימות של הכלים המשויכים לעובד נבחר">
      <div className="flex flex-wrap gap-2">
        <Field label="עובד">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} min-w-40`}>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
      </div>
      {userId ? (
        <ActionLinks printHref={`/reports/by-worker/print?${q}`} exportType="by-worker" exportQuery={q} />
      ) : (
        <p className="mt-3 text-xs text-muted">אין עובדים עם כלי משויך</p>
      )}
    </ReportCard>
  );
}

function ShiftCard() {
  const [shiftType, setShiftType] = useState("MORNING");
  const [date, setDate] = useState(todayStr());
  const q = `shiftType=${shiftType}&date=${date}`;
  return (
    <ReportCard title="דוח משמרת" description="בוקר, צהריים, לילה או יום מנוחה — לפי סוג המשמרת של כל כלי">
      <div className="flex flex-wrap gap-2">
        <Field label="משמרת">
          <select value={shiftType} onChange={(e) => setShiftType(e.target.value)} className={inputCls}>
            <option value="MORNING">בוקר</option>
            <option value="AFTERNOON">צהריים</option>
            <option value="NIGHT">לילה</option>
            <option value="REST_DAY">יום מנוחה</option>
          </select>
        </Field>
        <Field label="תאריך">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
      </div>
      <ActionLinks printHref={`/reports/shift/print?${q}`} exportType="shift" exportQuery={q} />
    </ReportCard>
  );
}

function ZoneVehiclesCard() {
  const [date, setDate] = useState(todayStr());
  const q = `date=${date}`;
  return (
    <ReportCard title="כלי רכב שעבדו בכל אזור" description="פירוט הכלים שביצעו משימות בכל אזור, ליום נבחר">
      <Field label="תאריך">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <ActionLinks printHref={`/reports/zone-vehicles/print?${q}`} exportType="zone-vehicles" exportQuery={q} />
    </ReportCard>
  );
}

function ResourceUtilizationCard({ contractAreas }: { contractAreas: Option[] }) {
  const [month, setMonth] = useState(thisMonthStr());
  const [contractAreaId, setContractAreaId] = useState("");
  const q = `month=${month}${contractAreaId ? `&contractAreaId=${contractAreaId}` : ""}`;
  return (
    <ReportCard
      title="דוח ניצול משאבים מול ההסכם"
      description="כמות חוזית מול ממוצע בפועל לכל סוג משאב — מזהה גם הקצאות מעבר להסכם"
    >
      <div className="flex flex-wrap gap-2">
        <Field label="חודש">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="אזור מכרז">
          <select value={contractAreaId} onChange={(e) => setContractAreaId(e.target.value)} className={`${inputCls} min-w-40`}>
            <option value="">כל אזורי המכרז</option>
            {contractAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ActionLinks printHref={`/reports/resource-utilization/print?${q}`} exportType="resource-utilization" exportQuery={q} />
    </ReportCard>
  );
}

// ============================== defects / quality ==============================

function DefectsReportCard({ zones, contractAreas }: { zones: Option[]; contractAreas: Option[] }) {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [zoneId, setZoneId] = useState("");
  const [contractAreaId, setContractAreaId] = useState("");
  const q = `from=${from}&to=${to}${zoneId ? `&zoneId=${zoneId}` : ""}${contractAreaId ? `&contractAreaId=${contractAreaId}` : ""}`;
  return (
    <ReportCard title="דוח ליקויים פתוחים וסגורים" description="כל ליקוי שנפתח או נסגר בטווח, עם סטטוס וקיזוז">
      <div className="flex flex-wrap gap-2">
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="אזור">
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${inputCls} min-w-32`}>
            <option value="">הכל</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="אזור מכרז">
          <select value={contractAreaId} onChange={(e) => setContractAreaId(e.target.value)} className={`${inputCls} min-w-40`}>
            <option value="">הכל</option>
            {contractAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ActionLinks printHref={`/reports/defects/print?${q}`} exportType="defects" exportQuery={q} />
    </ReportCard>
  );
}

function QualityControlCard() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const q = `from=${from}&to=${to}`;
  return (
    <ReportCard title="דוח בקרת איכות" description="סיורי פיקוח מול ליקויים שהתגלו בהם, לפי אזור (§561)">
      <div className="flex gap-2">
        <Field label="מתאריך">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
        <Field label="עד תאריך">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className={inputCls} />
        </Field>
      </div>
      <ActionLinks printHref={`/reports/quality-control/print?${q}`} exportType="quality-control" exportQuery={q} />
    </ReportCard>
  );
}

function CityCoverageCard() {
  const [date, setDate] = useState(todayStr());
  const q = `date=${date}`;
  return (
    <ReportCard title="דוח כיסוי עירוני" description="כל רחוב מול תדירות הניקיון שנקבעה לו — כולל רחובות שמעולם לא נוקו">
      <Field label="נכון לתאריך">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className={inputCls} />
      </Field>
      <ActionLinks printHref={`/reports/city-coverage/print?${q}`} exportType="city-coverage" exportQuery={q} />
    </ReportCard>
  );
}

function GpsCard() {
  return (
    <ReportCard title="עצירות וחריגות GPS" description="דורש חיבור מערכת איתור (GPS / איתורן) שטרם בוצע">
      <a href="/reports/gps-deviations" className={printLinkCls}>
        פרטים ←
      </a>
    </ReportCard>
  );
}

// ============================== sources ==============================

function SourceConflictsCard() {
  return (
    <ReportCard title="דוח סתירות בנתוני המקור" description="כל סתירה בין המכרז לטבלאות הזוכים, עם שני הערכים והמקורות">
      <ActionLinks printHref="/reports/source-conflicts/print" exportType="source-conflicts" exportQuery="" />
    </ReportCard>
  );
}

function PendingVerificationCard() {
  return (
    <ReportCard title="דוח נתונים הממתינים לאימות" description="כל ערך שחולץ ממסמכי המכרז וטרם אושר, תוקן או נדחה">
      <ActionLinks printHref="/reports/pending-verification/print" exportType="pending-verification" exportQuery="" />
    </ReportCard>
  );
}
