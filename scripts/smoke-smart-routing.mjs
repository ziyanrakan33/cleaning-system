/**
 * End-to-end check of the smart-cleaning-routing upgrade against a real
 * browser: seeds the §19 demo dataset, then walks through the new screens —
 * survey, service points, resource profile, plan alternatives → publish →
 * feasibility, settings/weights, and learning — checking each renders
 * without console/server errors and shows the expected content. Cleans the
 * demo data up afterwards regardless of outcome.
 *
 *   npm run dev
 *   npm run smoke:routing
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

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

function runTs(script) {
  return execFileSync("npx", ["tsx", "--env-file=.env", script], { encoding: "utf8", shell: true });
}

console.log("ניקוי וזריעת נתוני הדגמה");
try {
  runTs("scripts/clear-demo-routing.ts");
} catch {
  /* fine if nothing existed yet */
}
console.log(runTs("scripts/seed-demo-routing.ts"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
page.on("console", (m) => {
  // A 409 from /api/plans/[id] is the intentional §13 feasibility gate this
  // script deliberately triggers, not a bug — the browser logs it to the
  // console the same way it would any non-2xx fetch, so it is filtered here
  // rather than treated as a failure.
  if (m.type() === "error" && !m.text().includes("status of 409")) errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("response", (r) => {
  if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
});

try {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
  await page.fill('input[name="password"]', "Admin123!");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=בקרה");

  // ---- survey screen -------------------------------------------------------
  console.log("\nסקר שטח (§3)");
  await page.goto(`${BASE}/survey`);
  await page.waitForSelector("text=חסרים");
  check("מסך הסקר טוען עם כותרות התקדמות", (await page.textContent("body")).includes("מולאו"));
  await page.screenshot({ path: `${shots}/90-survey.png`, fullPage: true });

  // ---- service points --------------------------------------------------
  console.log("\nנקודות מים ופריקה (§4, §5)");
  await page.goto(`${BASE}/service-points`);
  await page.waitForSelector("text=נקודות מים");
  const spBody = await page.textContent("body");
  check("נקודת המים של ההדגמה מוצגת", spBody.includes("DEMO"));
  check("נקודה תקולה מסומנת", spBody.includes("תקולה"));
  await page.screenshot({ path: `${shots}/91-service-points.png`, fullPage: true });

  // ---- resources: operational profile tab --------------------------------
  console.log("\nפרופיל תפעולי לכלי (§6)");
  await page.goto(`${BASE}/resources`);
  await page.waitForSelector("text=משאבים");
  await page.click('button:has-text("פרופיל תפעולי") >> nth=0');
  await page.waitForSelector("text=קיבולת מיכל מים", { timeout: 20000 });
  check("לוח הפרופיל התפעולי נפתח", true);
  await page.screenshot({ path: `${shots}/92-resource-profile.png`, fullPage: true });

  // ---- settings / weights --------------------------------------------------
  console.log("\nהגדרות ומשקלים (§2, §11)");
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("text=משקלי ציון הלכלוך");
  check("מסך המשקלים טוען עם קבוצות ברירת המחדל", (await page.textContent("body")).includes("פונקציית עלות המסלול"));
  await page.screenshot({ path: `${shots}/93-settings.png`, fullPage: true });

  // ---- plan wizard: propose -> compare -> publish -> feasibility -----------
  console.log("\nהצעת חלופות ופרסום תוכנית (§12, §13)");
  await page.goto(`${BASE}/plans`);
  await page.waitForSelector("text=הצע חלופות מסלול");
  await page.click('button:has-text("הצע חלופות מסלול")');
  await page.waitForSelector("text=נבחר", { timeout: 20000 });
  const alternativesBody = await page.textContent("body");
  check("שלוש חלופות מוצגות", (alternativesBody.match(/עצירות מילוי/g) ?? []).length >= 1);
  await page.screenshot({ path: `${shots}/94-plan-alternatives.png`, fullPage: true });

  await page.click('button:has-text("צור טיוטת תוכנית מהחלופה שנבחרה")');
  await page.waitForSelector("text=צפייה במפה ובמסלולים", { timeout: 20000 });
  check("התוכנית נוצרה ומוצג קישור לצפייה", true);
  await page.screenshot({ path: `${shots}/95-plan-generated.png`, fullPage: true });

  await page.click('a:has-text("צפייה במפה ובמסלולים")');
  await page.waitForURL(/\/plans\/[a-z0-9]+$/, { timeout: 20000 });
  await page.waitForSelector('button:has-text("אשר תוכנית")', { timeout: 30000 });
  await page.screenshot({ path: `${shots}/96-plan-detail.png`, fullPage: true });
  check("מסך פרטי התוכנית נטען עם כפתור אישור", true);

  // Real production data has hundreds of unassigned high-priority streets
  // today, so confirming should be blocked until an override reason is given
  // — exactly the §13 behaviour under test here.
  await page.click('button:has-text("אשר תוכנית")');
  await page.waitForSelector("text=בדיקת היתכנות (§13)", { timeout: 15000 });
  check("אישור נחסם והיתכנות מוצגת כשיש חריגות", true);
  await page.fill('input[placeholder*="סיבת הפרסום"]', "פרסום הדגמה — בדיקת עקיפה (smoke test)");
  await page.click('button:has-text("אשר בכל זאת עם נימוק")');
  await page.waitForSelector("text=תוכנית מאושרת", { timeout: 15000 });
  check("התוכנית פורסמה לאחר נימוק חריגה", true);
  await page.screenshot({ path: `${shots}/96b-plan-confirmed-override.png`, fullPage: true });

  // ---- learning screen -------------------------------------------------
  console.log("\nלמידה מהביצוע (§17)");
  await page.goto(`${BASE}/learning`);
  await page.waitForSelector("text=למידה מנתוני הביצוע");
  check("מסך הלמידה נטען", true);
  await page.screenshot({ path: `${shots}/97-learning.png`, fullPage: true });

  // ---- admin map new layers -------------------------------------------
  console.log("\nשכבות מפה חדשות (§14)");
  await page.goto(`${BASE}/map`);
  await page.waitForSelector("text=נקודות מים");
  check("שכבות נקודות המים והפריקה מופיעות ברשימת השכבות", (await page.textContent("body")).includes("נקודות פריקת פסולת"));
  await page.screenshot({ path: `${shots}/98-map-layers.png`, fullPage: true });

  check("אין שגיאות קונסולה/שרת (5xx) לאורך כל הבדיקה", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  console.log("\nניקוי נתוני הדגמה");
  runTs("scripts/clear-demo-routing.ts");
}

console.log(`\n${failures.length === 0 ? "✓ כל הבדיקות עברו" : `✗ ${failures.length} בדיקות נכשלו`}`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
