/**
 * End-to-end check of the defects/complaints/inspections module against the
 * running app: create a defect, walk it through the state machine, upload
 * before/after photos, approve a deduction, and run the appeal flow across
 * three different roles (contractor appeals, department head decides).
 *
 *   npm run dev
 *   npm run seed:demo-roles     (creates the non-admin test accounts)
 *   node scripts/smoke-defects.mjs
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

// A minimal valid 1x1 PNG, used as photo evidence — no fixture file needed.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function loginAs(browser, email, password) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${email}] ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errors.push(`[${email}] ${String(e).slice(0, 200)}`));
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=בקרה", { timeout: 15000 });
  return page;
}

const browser = await chromium.launch();

// ---- admin: create a defect and run it through most of the workflow ------
console.log("\nכניסה כמנהל מערכת");
const admin = await loginAs(browser, "admin@kfar-saba-cleaning.local", "Admin123!");

await admin.goto(`${BASE}/defects`);
await admin.waitForSelector("text=ליקוי חדש");
await admin.click('button:has-text("ליקוי חדש")');
await admin.waitForSelector('select >> nth=0');

// Pick the first real defect type (skip the placeholder option).
const typeSelect = admin.locator("form select").first();
const typeOptions = await typeSelect.locator("option").evaluateAll((os) =>
  os.map((o) => o.value).filter(Boolean)
);
check("קטלוג סוגי הליקוי נטען לטופס", typeOptions.length > 0, `${typeOptions.length} סוגים`);
if (typeOptions.length > 0) await typeSelect.selectOption(typeOptions[0]);

const titleInput = admin.locator('form input[type="text"], form input:not([type])').first();
await titleInput.fill("__SMOKE_DEFECT__ בדיקת עשן אוטומטית");
await admin.click('button:has-text("פתח ליקוי")');
await admin.waitForTimeout(1500);

const bodyAfterCreate = await admin.textContent("body");
check("הליקוי נוצר ומופיע ברשימה", bodyAfterCreate.includes("__SMOKE_DEFECT__"));
await admin.screenshot({ path: `${shots}/30-defect-created.png`, fullPage: true });

await admin.click("text=__SMOKE_DEFECT__");
await admin.waitForSelector("text=פעולות", { timeout: 10000 });
const detailUrl = admin.url();
const defectId = detailUrl.split("/").pop();
check("נכנסים למסך פרטי הליקוי", /\/defects\/[a-z0-9]+/.test(detailUrl), detailUrl);

// NEW -> ASSIGNED -> IN_PROGRESS
await admin.click('button:has-text("העברה לטיפול")');
await admin.waitForTimeout(1000);
await admin.click('button:has-text("התחלת טיפול")');
await admin.waitForTimeout(1000);
const inProgressBody = await admin.textContent("body");
check("הליקוי עבר לסטטוס בטיפול", inProgressBody.includes("בטיפול"));

// Upload before photo
await admin.locator('button:has-text("הוספת תמונה")').first().click().catch(() => {});
const beforeInput = admin.locator('input[type="file"]').first();
await beforeInput.setInputFiles({ name: "before.png", mimeType: "image/png", buffer: TINY_PNG });
await admin.waitForSelector("text=תמונת לפני נוספה", { timeout: 10000 });
check("תמונת לפני הועלתה", true);

// Move to AWAITING_PROOF
await admin.click('button:has-text("דיווח על תיקון")');

// Approving without an "after" photo should fail — verify the guard fires in
// the real UI, not just in the unit test. Wait for the button deterministically
// rather than racing a fixed timeout, so this check can never silently no-op.
const approveButton = admin.locator('button:has-text("אישור התיקון")').first();
await approveButton.waitFor({ state: "visible", timeout: 10000 });
await approveButton.click();
await admin.waitForTimeout(1000);
const blockedBody = await admin.textContent("body");
check(
  "אישור תיקון ללא תמונת אחרי נחסם",
  blockedBody.includes("תמונת") && blockedBody.includes("אחרי")
);

// Upload after photo, then approve.
const afterInputs = admin.locator('input[type="file"]');
await afterInputs.nth(1).setInputFiles({ name: "after.png", mimeType: "image/png", buffer: TINY_PNG });
await admin.waitForSelector("text=תמונת אחרי נוספה", { timeout: 10000 });
await admin.click('button:has-text("אישור התיקון")');
await admin.waitForTimeout(1000);
const fixedBody = await admin.textContent("body");
check("הליקוי אושר כתוקן לאחר הוספת תמונת אחרי", fixedBody.includes("תוקן"));
await admin.screenshot({ path: `${shots}/31-defect-fixed.png`, fullPage: true });

// Approve the deduction as admin (has finance.approveDeduction).
const approveDeduction = admin.locator('button:has-text("אשר קיזוז")');
if (await approveDeduction.count() > 0) {
  await approveDeduction.click();
  await admin.waitForTimeout(1000);
  const deductionBody = await admin.textContent("body");
  check("הקיזוז אושר", deductionBody.includes("אושר"));
  await admin.screenshot({ path: `${shots}/32-deduction-approved.png`, fullPage: true });
} else {
  check("כפתור אישור קיזוז זמין", false, "לא נמצא — ייתכן שלליקוי לא היה סוג עם קיזוז");
}

// ---- contractor: lodge an appeal --------------------------------------
console.log("\nכניסה כנציג קבלן — הגשת ערעור");
const contractor = await loginAs(browser, "contractor1@kfar-saba-cleaning.local", "Demo1234!");
await contractor.goto(`${BASE}/defects/${defectId}`);
await contractor.waitForTimeout(1000);
const appealTextarea = contractor.locator('textarea[placeholder*="נימוק הערעור"]');
if (await appealTextarea.count() > 0) {
  await appealTextarea.fill("__SMOKE__ הליקוי תוקן בפועל, מבקש לבטל את הקיזוז");
  await contractor.click('button:has-text("הגש ערעור")');
  await contractor.waitForTimeout(1000);
  const appealedBody = await contractor.textContent("body");
  check("הערעור הוגש", appealedBody.includes("ערעור"));
} else {
  check("טופס ערעור זמין לקבלן", false, "לא נמצא — ייתכן שהקיזוז לא היה במצב מאושר");
}
await contractor.screenshot({ path: `${shots}/33-appeal-lodged.png`, fullPage: true });

// contractor must not see prices
const contractorSeesMoney = (await contractor.textContent("body")).includes("₪");
check("נציג הקבלן אינו רואה סכומי קיזוז בשקלים", !contractorSeesMoney);

// ---- department head: decide the appeal --------------------------------
console.log("\nכניסה כמנהל אגף — הכרעה בערעור");
const dept = await loginAs(browser, "deptmanager1@kfar-saba-cleaning.local", "Demo1234!");
await dept.goto(`${BASE}/defects/${defectId}`);
await dept.waitForTimeout(1000);
const decisionTextarea = dept.locator('textarea[placeholder*="נימוק ההחלטה"]');
if (await decisionTextarea.count() > 0) {
  await decisionTextarea.fill("__SMOKE__ הערעור נבדק ואושר");
  await dept.click('button:has-text("קבל ערעור")');
  await dept.waitForSelector("text=נסגר", { timeout: 10000 });
  check("הערעור הוכרע והליקוי נסגר", true);
} else {
  check("טופס הכרעת ערעור זמין למנהל האגף", false, "לא נמצא");
}
await dept.screenshot({ path: `${shots}/34-appeal-decided.png`, fullPage: true });

// ---- complaints and inspections screens load ----------------------------
console.log("\nמסכי תלונות וסיורים");
await admin.goto(`${BASE}/complaints`);
await admin.waitForSelector("text=תלונות ופניות מוקד");
check("מסך התלונות נטען", true);

await admin.goto(`${BASE}/inspections`);
await admin.waitForSelector("text=סיורי פיקוח");
check("מסך סיורי הפיקוח נטען", true);

await browser.close();

// ---- cleanup --------------------------------------------------------------
console.log("\nניקוי שאריות");
try {
  const out = execFileSync(
    "npx",
    ["tsx", "--env-file=.env", "scripts/cleanup-smoke-defect.ts"],
    { encoding: "utf8", shell: true }
  );
  console.log(out.trim().split("\n").map((l) => `  ${l}`).join("\n"));
  check("שאריות בדיקת הליקוי נוקו", !out.includes("נכשל"));
} catch (e) {
  check("שאריות בדיקת הליקוי נוקו", false, String(e).slice(0, 200));
}

console.log(`\n${failures.length === 0 ? "כל הבדיקות עברו" : `${failures.length} בדיקות נכשלו`}`);
for (const f of failures) console.log("  ✗", f);
console.log(`שגיאות קונסול: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  -", e);

process.exit(failures.length > 0 ? 1 : 0);
