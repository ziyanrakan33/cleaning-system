/**
 * End-to-end check of the resource allocation recommendation screen: the
 * honest "insufficient data" state against the real (currently boundary-less)
 * production zones, then a full recommend → edit → over-quota-warn →
 * confirm-with-reason → apply cycle against a throwaway zone with real
 * segment data seeded directly via Prisma (StreetSegment has no creation API).
 *
 *   npm run dev
 *   node scripts/smoke-allocation.mjs
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

// ---- honest empty state against real production zones --------------------
console.log("\nמצב אמיתי (ללא גבולות מוגדרים)");
await page.goto(`${BASE}/resources`);
await page.waitForSelector("text=משאבים");
check('כפתור "המלצת חלוקת משאבים" מוצג למנהל', (await page.textContent("body")).includes("המלצת חלוקת משאבים"));

await page.click('a:has-text("המלצת חלוקת משאבים")');
await page.waitForSelector("text=המלצת חלוקת משאבים");
await page.waitForTimeout(500);
const emptyBody = await page.textContent("body");
check(
  "המסך מציג נכונה שאין נתונים במקום המלצה מומצאת",
  emptyBody.includes("לא ניתן לחשב המלצה") &&
    // Today's real state is "no operational zone is linked to this contract
    // area yet" (§542-544's blank contractor lists), not merely "no boundary
    // drawn" — the engine distinguishes the two so the message always points
    // at the actual blocker.
    emptyBody.includes("אינו משויך לאזור מכרז זה")
);
await page.screenshot({ path: `${shots}/80-allocation-empty-state.png`, fullPage: true });

// ---- seed a throwaway zone with real data ---------------------------------
console.log("\nהכנת נתוני בדיקה עם גבול אמיתי");
const setupOut = runTs("scripts/setup-smoke-allocation.ts");
const fixture = JSON.parse(setupOut.trim().split("\n").pop());
check("נוצרו נתוני בדיקה (אזור, מקטע, קבלן, מכסה, משאב)", !!fixture.zoneId);

await page.goto(`${BASE}/resources/allocation`);
await page.waitForSelector("text=המלצת חלוקת משאבים");
await page.waitForTimeout(500);
const withDataBody = await page.textContent("body");
check("אזור המכרז החדש מופיע במסך", withDataBody.includes("__SMOKE_ALLOC__"));
check('הכמות המוצעת (1) מוצגת', /\b1\b/.test(withDataBody));
await page.screenshot({ path: `${shots}/81-allocation-with-data.png`, fullPage: true });

// ---- apply the recommendation as-is (within quota) ------------------------
// Scoped to the throwaway fixture's own section: the real production
// contract areas render their "החל הקצאה" buttons disabled (insufficient
// data, no boundary drawn), so an unscoped .first() would hit those instead.
console.log("\nהחלת ההמלצה במסגרת המכסה");
const fixtureSection = page.locator("section", { has: page.getByText("__SMOKE_ALLOC__ אזור מכרז") });
const applyButton = fixtureSection.locator('button:has-text("החל הקצאה")').first();
await applyButton.waitFor({ state: "visible", timeout: 10000 });
const applyResponsePromise = page.waitForResponse((r) => r.url().includes("/api/resources/allocation/apply"), { timeout: 15000 });
await applyButton.click();
const applyResponse = await applyResponsePromise;
check("קריאת ה-API להחלה הצליחה (200)", applyResponse.ok(), `status ${applyResponse.status()}`);
await page.waitForTimeout(500); // let the client render the response before reading the DOM
const appliedBody = await page.textContent("body");
check("ההחלה הצליחה והוצג אישור", appliedBody.includes("יושמה"));
await page.screenshot({ path: `${shots}/82-allocation-applied.png`, fullPage: true });

// ---- verify the resource actually moved -----------------------------------
const resRes = await page.request.get(`${BASE}/api/resources`);
const allResources = await resRes.json();
const smokeResource = allResources.find((r) => r.identifier === `__SMOKE_ALLOC__R1`);
check(
  "המשאב שויך בפועל לאזור החדש",
  smokeResource?.allowedZones?.some((z) => z.id === fixture.zoneId) ?? false
);

// ---- exceed the quota and confirm the warn-then-reason flow ---------------
console.log("\nחריגה מהמכסה החוזית");
await page.goto(`${BASE}/resources/allocation`);
await page.waitForSelector("text=המלצת חלוקת משאבים");
await page.waitForTimeout(500);
const fixtureSection2 = page.locator("section", { has: page.getByText("__SMOKE_ALLOC__ אזור מכרז") });
const qtyInput = fixtureSection2.locator('input[type="number"]').first();
await qtyInput.fill("2"); // quota is 1
const overQuotaResponsePromise = page.waitForResponse((r) => r.url().includes("/api/resources/allocation/apply"), { timeout: 15000 });
await fixtureSection2.locator('button:has-text("החל הקצאה")').first().click();
const overQuotaResponse = await overQuotaResponsePromise;
check("קריאת ה-API מחזירה 409 (חריגה מהמכסה)", overQuotaResponse.status() === 409, `status ${overQuotaResponse.status()}`);
await page.waitForTimeout(500);
const warnBody = await fixtureSection2.textContent();
check("חריגה מהמכסה מוצגת כאזהרה, לא כחסימה שקטה", warnBody.includes("חורג") || warnBody.includes("נימוק"));

const reasonInput = fixtureSection2.locator('input[placeholder*="נימוק"]');
if (await reasonInput.count() > 0) {
  await reasonInput.fill("__SMOKE_ALLOC__ תגבור מאושר לבדיקה");
  const confirmResponsePromise = page.waitForResponse((r) => r.url().includes("/api/resources/allocation/apply"), { timeout: 15000 });
  await fixtureSection2.locator('button:has-text("אשר בכל זאת")').click();
  const confirmResponse = await confirmResponsePromise;
  check("לאחר נימוק, קריאת ה-API מצליחה (200)", confirmResponse.ok(), `status ${confirmResponse.status()}`);
  await page.waitForTimeout(500);
  const confirmedBody = await fixtureSection2.textContent();
  check("לאחר אישור עם נימוק, ההחלה מצליחה", confirmedBody.includes("יושמה"));
} else {
  check("שדה נימוק מוצג לאחר חריגה מהמכסה", false, "לא נמצא");
}

await browser.close();

// ---- cleanup ----------------------------------------------------------------
console.log("\nניקוי שאריות");
try {
  const out = runTs("scripts/cleanup-smoke-allocation.ts");
  console.log(out.trim().split("\n").map((l) => `  ${l}`).join("\n"));
  check("שאריות בדיקת ההקצאה נוקו", true);
} catch (e) {
  check("שאריות בדיקת ההקצאה נוקו", false, String(e).slice(0, 200));
}

console.log(`\n${failures.length === 0 ? "כל הבדיקות עברו" : `${failures.length} בדיקות נכשלו`}`);
for (const f of failures) console.log("  ✗", f);
console.log(`שגיאות קונסול: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  -", e);

process.exit(failures.length > 0 ? 1 : 0);
