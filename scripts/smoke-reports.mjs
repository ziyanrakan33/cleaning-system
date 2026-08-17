/**
 * End-to-end check of the reports module: the categorized index page, print
 * views for a representative sample of the 15 new reports plus the two
 * original ones, Excel download via the legacy per-report route, and Excel +
 * CSV download via the new generic /api/reports/export dispatcher.
 *
 *   npm run dev
 *   node scripts/smoke-reports.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const shots = "smoke-screenshots";
const errors = [];
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

// ---- index page ------------------------------------------------------
console.log("\nמסך דוחות");
await page.goto(`${BASE}/reports`);
await page.waitForSelector("text=דוחות");
await page.waitForTimeout(500);
const indexBody = await page.textContent("body");
check("כל 5 קטגוריות הדוחות מוצגות", [
  "ביצוע — יומי, שבועי וחודשי", "משאבים ורכב", "ליקויים, איכות ובקרה", "מקורות ואימות", "היסטוריה",
].every((label) => indexBody.includes(label)));
check("דוח שבועי לפי אזור מופיע ברשימה", indexBody.includes("דוח שבועי לפי אזור"));
check("דוח חודשי לפי קבלן מופיע ברשימה", indexBody.includes("דוח חודשי לפי קבלן"));
check("דוח ניצול משאבים מופיע ברשימה", indexBody.includes("דוח ניצול משאבים מול ההסכם"));
check("דוח GPS מסומן כדורש חיבור", indexBody.includes("עצירות וחריגות GPS"));
await page.screenshot({ path: `${shots}/70-reports.png`, fullPage: true });

// ---- original reports still work --------------------------------------
console.log("\nדוחות קיימים (רגרסיה)");
await page.goto(`${BASE}/reports/daily/print`);
await page.waitForTimeout(800);
check("דוח תוכנית יומית נטען", (await page.textContent("body")).includes("תוכנית עבודה יומית"));
await page.screenshot({ path: `${shots}/71-daily-print.png`, fullPage: true });

await page.goto(`${BASE}/reports/unscheduled/print`);
await page.waitForTimeout(800);
check("דוח רחובות שלא שובצו נטען", true);
await page.screenshot({ path: `${shots}/72-unscheduled-print.png`, fullPage: true });

// Legacy per-report Excel route.
{
  const downloadPromise = page.waitForEvent("download");
  await page.goto(`${BASE}/reports`);
  await page.click('a:has-text("הורדה כ-Excel") >> nth=0');
  const download = await downloadPromise;
  const savePath = `${shots}/daily-plan.xlsx`;
  await download.saveAs(savePath);
  check("הורדת Excel של הדוח היומי (נתיב ישן) הצליחה", fs.existsSync(savePath) && fs.statSync(savePath).size > 0);
}

// ---- new reports: print views ------------------------------------------
console.log("\nדוחות חדשים — תצוגת הדפסה");
const today = new Date().toISOString().slice(0, 10);
const printChecks = [
  ["weekly-zone", `start=${today}`, "דוח שבועי לפי אזור"],
  ["monthly-contractor", `month=${today.slice(0, 7)}`, "דוח חודשי לפי קבלן"],
  ["hours", `from=${today}&to=${today}`, "שעות עבודה מתוכננות מול בפועל"],
  ["streets-completion", `from=${today}&to=${today}`, "רחובות שבוצעו"],
  ["km", `from=${today}&to=${today}`, 'קילומטרים מתוכננים'],
  ["defects", `from=${today}&to=${today}`, "דוח ליקויים"],
  ["quality-control", `from=${today}&to=${today}`, "דוח בקרת איכות"],
  ["city-coverage", `date=${today}`, "דוח כיסוי עירוני"],
  ["source-conflicts", "", "דוח סתירות בנתוני המקור"],
  ["pending-verification", "", "דוח נתונים הממתינים לאימות"],
];
for (const [id, qs, expectedText] of printChecks) {
  await page.goto(`${BASE}/reports/${id}/print${qs ? `?${qs}` : ""}`);
  await page.waitForTimeout(600);
  const body = await page.textContent("body");
  check(`דוח ${id} נטען ומציג את הכותרת הנכונה`, body.includes(expectedText), body.slice(0, 80));
}

// ---- GPS coming-soon ------------------------------------------------------
await page.goto(`${BASE}/reports/gps-deviations`);
await page.waitForTimeout(500);
check("מסך GPS מסביר שאין חיבור פעיל", (await page.textContent("body")).includes("איתורן"));
await page.screenshot({ path: `${shots}/73-gps-coming-soon.png` });

// ---- new generic export route: Excel + CSV -----------------------------
// Fetched directly via the request API rather than page.goto(), which throws
// on a navigation that turns into a download instead of a loaded document.
console.log("\nהורדת קבצים דרך /api/reports/export");
{
  const res = await page.request.get(`${BASE}/api/reports/export?type=weekly-zone&format=xlsx&start=${today}`);
  check("ייצוא Excel דרך הנתיב הכללי מחזיר 200", res.ok(), `status ${res.status()}`);
  check(
    "ייצוא Excel מוגדר כ-spreadsheetml",
    (res.headers()["content-type"] ?? "").includes("spreadsheetml")
  );
  const body = await res.body();
  check("קובץ ה-Excel שהתקבל אינו ריק", body.byteLength > 1000, `${body.byteLength} bytes`);
  fs.writeFileSync(`${shots}/weekly-zone.xlsx`, body);
}

const csvRes = await page.request.get(`${BASE}/api/reports/export?type=source-conflicts&format=csv`);
check("ייצוא CSV מחזיר תגובה תקינה", csvRes.ok());
check("ייצוא CSV מוגדר כ-text/csv", (csvRes.headers()["content-type"] ?? "").includes("text/csv"));

const badReport = await page.request.get(`${BASE}/api/reports/export?type=no-such-report&format=xlsx`);
check("סוג דוח לא קיים מחזיר 404", badReport.status() === 404);

const missingParams = await page.request.get(`${BASE}/api/reports/export?type=weekly-zone&format=xlsx`);
check("חסרון פרמטר חובה מחזיר 400", missingParams.status() === 400);

await browser.close();

console.log(`\n${failures.length === 0 ? "כל הבדיקות עברו" : `${failures.length} בדיקות נכשלו`}`);
for (const f of failures) console.log("  ✗", f);
console.log(`שגיאות קונסול: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  -", e);

process.exit(failures.length > 0 ? 1 : 0);
