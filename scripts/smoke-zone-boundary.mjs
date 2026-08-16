import { chromium } from "playwright";

const shots = "smoke-screenshots";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");

// Create a zone (skip if already present from a prior run)
await page.goto("http://localhost:3000/zones");
await page.waitForSelector("text=אזורי עבודה");
const alreadyExists = await page.locator('a:has-text("ציור גבול על המפה")').count();
if (alreadyExists === 0) {
  await page.fill('input[placeholder*="מרכז העיר"]', "מרכז העיר");
  await page.fill('input[placeholder="Z01"]', "Z01");
  await page.click('button:has-text("הוסף אזור")');
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${shots}/10-zones-created.png` });

// Open boundary editor
await page.click('a:has-text("ציור גבול על המפה")');
await page.waitForSelector("text=גבול אזור");
await page.waitForSelector(".maplibregl-canvas");
await page.waitForTimeout(6000);
await page.screenshot({ path: `${shots}/11-boundary-editor-empty.png` });

// Draw a small polygon by clicking 4 points on the map
const mapBox = await page.locator(".maplibregl-canvas").boundingBox();
console.log("map canvas box:", mapBox);
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
  await page.waitForTimeout(150);
}
await page.screenshot({ path: `${shots}/12-boundary-drawn.png` });

await page.click('button:has-text("סגור ושמור גבול")');
await page.waitForSelector("text=הגבול נשמר בהצלחה");
await page.screenshot({ path: `${shots}/13-boundary-saved.png` });

// Verify on the map page that the zone polygon now renders
await page.goto("http://localhost:3000/map");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/14-map-with-zone.png` });

// Verify streets screen can now assign a street to this zone
await page.goto("http://localhost:3000/streets");
await page.waitForSelector("text=רחובות ושבילים");
await page.screenshot({ path: `${shots}/15-streets-with-zone-option.png` });

await browser.close();
console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
