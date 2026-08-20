import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const shots = "smoke-screenshots";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

console.log("Navigating to login on", BASE_URL);
await page.goto(`${BASE_URL}/login`);
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await Promise.all([
  page.waitForNavigation(),
  page.click('button[type="submit"]')
]);
console.log("Logged in successfully, current URL:", page.url());

// Navigate to zones list
await page.goto(`${BASE_URL}/zones`);
await page.waitForSelector("text=אזורי ניקיון תפעוליים");
await page.screenshot({ path: `${shots}/10-zones-created.png` });

// Open boundary editor for first zone
const drawLink = page.locator('a:has-text("צייר גבול על המפה")').first();
await drawLink.click();
await page.waitForSelector(".maplibregl-canvas");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${shots}/11-boundary-editor-empty.png` });

// Draw 4 points in order on the map
const mapBox = await page.locator(".maplibregl-canvas").boundingBox();
const cx = mapBox.x + mapBox.width / 2;
const cy = mapBox.y + mapBox.height / 2;

const pts = [
  [cx - 100, cy - 80],
  [cx + 100, cy - 80],
  [cx + 100, cy + 80],
  [cx - 100, cy + 80],
];

for (const [x, y] of pts) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${shots}/12-boundary-drawn.png` });

// Verify point counter equal to 4
const ptsCount = await page.locator('span:has-text("4")').count();
console.log("Points count equal to 4 rendered:", ptsCount > 0);

// Test self-intersection attempt (clicking a point that crosses segment 0-1)
await page.mouse.click(cx, cy - 120);
await page.waitForTimeout(300);

const hasSelfInterError = await page.locator('text=לא ניתן להוסיף את הנקודה מכיוון שהגבול חוצה את עצמו').count();
console.log("Self intersection blocked successfully:", hasSelfInterError > 0);

// Close and save boundary
await page.click('button:has-text("סגור ושמור גבול")');
await page.waitForSelector("text=הגבול נשמר בהצלחה!");
await page.screenshot({ path: `${shots}/13-boundary-saved.png` });

// Reload page to verify saved boundary persists
await page.reload();
await page.waitForSelector("text=גבול סגור");
await page.screenshot({ path: `${shots}/14-boundary-reloaded.png` });

await browser.close();
console.log("Smoke test finished with console errors:", errors.length);
for (const e of errors) console.log(" -", e);
