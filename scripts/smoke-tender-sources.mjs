/**
 * End-to-end check of the tender/sources work against the running app:
 * sources screen, contract-area assignment, boundary drawing, and the spatial
 * join that a saved boundary triggers.
 *
 *   npm run dev
 *   node scripts/smoke-tender-sources.mjs
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3000";
const shots = "smoke-screenshots";
const SMOKE_PREFIX = "__SMOKE__";
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
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

// ---- sources screen ------------------------------------------------------
console.log("\nמסך מקורות ואימות");
await page.goto(`${BASE}/sources`);
await page.waitForSelector("text=מקורות ואימות נתונים");
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/20-sources-overview.png`, fullPage: true });

const body = await page.textContent("body");
check("שני הקבלנים מוצגים", body.includes("שלג לבן") && body.includes("פרח השקד"));
check(
  "אזור מכרז 1 מוצג לצד שלג לבן",
  /אזור מכרז 1[\s\S]{0,120}שלג לבן/.test(body),
  "השיוך המתוקן אינו מופיע"
);
check(
  "אזור מכרז 2 מוצג לצד פרח השקד",
  /אזור מכרז 2[\s\S]{0,120}פרח השקד/.test(body),
  "השיוך המתוקן אינו מופיע"
);
check("מוצגת אזהרה על אזורים ללא שיוך קבלן", body.includes("טרם שויכו לאזור מכרז"));

// ---- conflicts -----------------------------------------------------------
await page.click('button:has-text("סתירות")');
await page.waitForTimeout(400);
const conflictText = await page.textContent("body");
check("סתירת עובדי הניקיון הידני מוצגת", conflictText.includes("47") && conflictText.includes("20"));
check('סתירת הק"מ מוצגת', conflictText.includes("197") && conflictText.includes("295"));
await page.screenshot({ path: `${shots}/21-sources-conflicts.png`, fullPage: true });

// ---- zone → contract area assignment ------------------------------------
console.log("\nשיוך אזור לקבלן");
await page.click('button:has-text("שיוך אזורים לקבלנים")');
await page.waitForSelector("select");
await page.screenshot({ path: `${shots}/22-zone-assignment-before.png`, fullPage: true });

const firstSelect = page.locator("select").first();
const optionValues = await firstSelect.locator("option").evaluateAll((os) =>
  os.map((o) => ({ value: o.value, text: o.textContent.trim() }))
);
const area1 = optionValues.find((o) => o.text.includes("אזור מכרז 1"));
check("רשימת אזורי המכרז זמינה לבחירה", !!area1);

if (area1) {
  await firstSelect.selectOption(area1.value);
  await page.waitForSelector("text=השיוך נשמר", { timeout: 10000 });
  await page.waitForTimeout(1200);
  const afterAssign = await page.textContent("body");
  check("השיוך נשמר ומוצג כמאומת", afterAssign.includes("אומת"));
  await page.screenshot({ path: `${shots}/23-zone-assigned.png`, fullPage: true });

  // Put it back so the smoke run leaves no residue.
  await page.locator("select").first().selectOption("");
  await page.waitForTimeout(1200);
}

// ---- boundary drawing triggers the spatial join --------------------------
console.log("\nציור גבול והרצת השיוך הגיאוגרפי");
await page.goto(`${BASE}/zones`);
await page.waitForSelector("text=אזורי ניקיון תפעוליים");
const zonesBody = await page.textContent("body");
check("עשרת האזורים מוצגים", (zonesBody.match(/אזור \d+/g) ?? []).length >= 10);
check("מוצגת אזהרה על אזורים ללא גבול", zonesBody.includes("ללא גבול גיאוגרפי"));
await page.screenshot({ path: `${shots}/24-zones-list.png`, fullPage: true });

// Draw on a throwaway zone rather than one of the ten real ones. A rectangle
// clicked onto a map is not a real cleaning-zone boundary, and leaving one
// behind would present invented geometry as verified fact.
const tempRes = await page.request.post(`${BASE}/api/zones`, {
  data: { name: `${SMOKE_PREFIX} אזור בדיקת עשן`, code: SMOKE_PREFIX, color: "#111111" },
});
check("נוצר אזור בדיקה זמני", tempRes.ok(), `HTTP ${tempRes.status()}`);
const tempZone = await tempRes.json();

await page.goto(`${BASE}/zones/${tempZone.id}/boundary`);
await page.waitForSelector(".maplibregl-canvas");

// The editor only binds its click handler after loading the streets and zones
// layers, so poll the point counter instead of guessing a wait.
// Anchor on the label — the surrounding panel also contains the zone name
// ("אזור 1"), and a bare \d+ would happily match that instead.
const counter = page.locator("text=נקודות שסומנו").locator("..");
const pointCount = async () => {
  const t = await counter.textContent();
  return parseInt(t.match(/נקודות שסומנו:\s*(\d+)/)?.[1] ?? "0", 10);
};

const mapBox = await page.locator(".maplibregl-canvas").boundingBox();
const cx = mapBox.x + mapBox.width / 2;
const cy = mapBox.y + mapBox.height / 2;
const corners = [
  [cx - 160, cy - 120],
  [cx + 160, cy - 120],
  [cx + 160, cy + 120],
  [cx - 160, cy + 120],
];

let ready = false;
for (let attempt = 0; attempt < 30 && !ready; attempt++) {
  await page.mouse.click(corners[0][0], corners[0][1]);
  await page.waitForTimeout(1000);
  ready = (await pointCount()) > 0;
}
check("עורך הגבולות קולט לחיצות על המפה", ready);

for (const [x, y] of corners.slice(1)) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}
check("ארבע נקודות נרשמו", (await pointCount()) >= 3, `${await pointCount()} נקודות`);
await page.screenshot({ path: `${shots}/24b-boundary-drawn.png` });

await page.click('button:has-text("סגור ושמור גבול")');
await page.waitForSelector("text=הגבול נשמר בהצלחה", { timeout: 20000 });
await page.screenshot({ path: `${shots}/25-boundary-saved.png` });
check("שמירת גבול הצליחה", true);

// The join runs inside the save request, so streets should now be attributed.
await page.goto(`${BASE}/zones`);
await page.waitForSelector("text=אזורי ניקיון תפעוליים");
await page.waitForTimeout(500);
const afterJoin = await page.textContent("body");
const kmMatch = afterJoin.match(/([\d.]+)\s*ק״מ/);
check("השיוך הגיאוגרפי הפיק אורך לאזור", !!kmMatch && parseFloat(kmMatch[1]) > 0, kmMatch?.[0]);
await page.screenshot({ path: `${shots}/26-zones-after-join.png`, fullPage: true });

// ---- map -----------------------------------------------------------------
console.log("\nמסך המפה");
await page.goto(`${BASE}/map`);
await page.waitForSelector(".maplibregl-canvas");
await page.waitForTimeout(7000);
const mapBody = await page.textContent("body");
check("מקרא המפה מוצג", mapBody.includes("מקרא"));
check("מתג צביעה לפי אזור מכרז קיים", mapBody.includes("צביעה לפי אזור מכרז"));
check("שכבת מקטעים קיימת", mapBody.includes("מקטעים לפי אזור"));
check("המפה מציינת אזורים ללא גבול", mapBody.includes("אינם מוצגים"));
await page.screenshot({ path: `${shots}/27-map-layers.png` });

await page.click('text=צביעה לפי אזור מכרז');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shots}/28-map-by-contract-area.png` });

await browser.close();

// Remove the throwaway zone and recompute, so the run leaves no invented
// geometry behind.
console.log("\nניקוי שאריות");
try {
  const out = execFileSync(
    "npx",
    ["tsx", "--env-file=.env", "scripts/cleanup-smoke-artifacts.ts"],
    { encoding: "utf8", shell: true }
  );
  console.log(out.trim().split("\n").map((l) => `  ${l}`).join("\n"));
  check("שאריות בדיקת העשן נוקו", !out.includes("נכשל"));
} catch (e) {
  check("שאריות בדיקת העשן נוקו", false, String(e).slice(0, 200));
}

console.log(`\n${failures.length === 0 ? "כל הבדיקות עברו" : `${failures.length} בדיקות נכשלו`}`);
for (const f of failures) console.log("  ✗", f);
console.log(`שגיאות קונסול: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  -", e);

process.exit(failures.length > 0 ? 1 : 0);
