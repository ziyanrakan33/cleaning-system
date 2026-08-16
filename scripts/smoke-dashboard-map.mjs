import { chromium } from "playwright";

const shots = "smoke-screenshots";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "admin@kfar-saba-cleaning.local");
await page.fill('input[name="password"]', "Admin123!");
await page.click('button[type="submit"]');
await page.waitForSelector("text=בקרה");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/60-dashboard.png`, fullPage: true });

await page.goto("http://localhost:3000/map");
await page.waitForSelector("text=מפת מנהל");
await page.waitForTimeout(4000);
await page.screenshot({ path: `${shots}/61-admin-map.png`, fullPage: false });

// Click on a street to test the info panel
const canvas = page.locator(".maplibregl-canvas");
const box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width / 2 - 50, box.y + box.height / 2 - 30);
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/62-admin-map-street-info.png`, fullPage: false });

console.log("Errors:", errors.length);
for (const e of errors) console.log(" -", e);
await browser.close();
